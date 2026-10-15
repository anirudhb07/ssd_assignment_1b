// Real PostgreSQL integration tests against seeded users/restaurants. Each test
// owns an outer transaction; request transactions use savepoints so rollback
// behaviour is exercised without leaving orders or immutable audit rows behind.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/postgres.js';

const app = createApp();
let client;
let connectSpy;
let userId;
let restaurantId;
let auditCount;
const checkout = (amount = 10, extra = {}) => request(app).post('/api/checkout').send({ userId, restaurantId, amount, ...extra });
const topup = (amount) => request(app).post(`/api/users/${userId}/topup`).send({ amount });
const advance = (id) => request(app).post(`/api/orders/${id}/advance`);
const snapshot = async () => (await client.query(`
  SELECT wallet_balance AS balance,
         (SELECT count(*) FROM orders WHERE user_id = $1) AS orders,
         (SELECT count(*) FROM wallet_audit_logs WHERE user_id = $1) AS audits
    FROM users WHERE id = $1`, [userId])).rows[0];

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  const user = await client.query(`SELECT id FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM orders WHERE user_id = u.id AND status IN ('PREPARING', 'DELIVERING'))
    LIMIT 1 FOR UPDATE`);
  userId = user.rows[0].id;
  restaurantId = (await client.query('SELECT id FROM restaurants LIMIT 1')).rows[0].id;
  await client.query('UPDATE users SET wallet_balance = 100 WHERE id = $1', [userId]);
  auditCount = (await snapshot()).audits;
  connectSpy = vi.spyOn(pool, 'connect').mockResolvedValue({
    query: (sql, params) => client.query({
      BEGIN: 'SAVEPOINT api_request',
      COMMIT: 'RELEASE SAVEPOINT api_request',
      ROLLBACK: 'ROLLBACK TO SAVEPOINT api_request',
    }[sql] ?? sql, params),
    release: () => {},
  });
});

afterEach(async () => {
  connectSpy?.mockRestore();
  if (client) {
    await client.query('ROLLBACK');
    client.release();
    client = null;
  }
});
afterAll(() => pool.end());

async function expectAudit(entry, actionType, amountChanged, balanceAfter) {
  expect(entry).toEqual({ id: expect.any(String), changedAt: expect.any(String), actionType, amountChanged, balanceAfter });
  const row = (await client.query('SELECT * FROM wallet_audit_logs WHERE id = $1', [entry.id])).rows[0];
  expect(row.user_id).toBe(userId);
  expect(row.action_type).toBe(actionType);
  expect(row.amount_changed).toBe(amountChanged);
  expect(row.balance_after).toBe(balanceAfter);
}

describe('checkout workflow (real database)', () => {
  it('returns the persisted order, exact balances and its DEBIT row', async () => {
    const res = await checkout(10.25);
    expect(res.status).toBe(201);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.balanceBefore).toBe(100);
    expect(res.body.balanceAfter).toBe(89.75);
    expect(res.body.order).toMatchObject({ userId, restaurantId, totalAmount: 10.25, status: 'PREPARING' });
    expect(Object.keys(res.body.order).sort()).toEqual(['createdAt', 'id', 'restaurantId', 'restaurantName', 'status', 'totalAmount', 'userId', 'userName']);
    const saved = (await client.query('SELECT * FROM orders WHERE id = $1', [res.body.order.id])).rows[0];
    expect(saved.total_amount).toBe(10.25);
    await expectAudit(res.body.auditEntry, 'DEBIT', 10.25, 89.75);
    expect((await snapshot()).audits).toBe(auditCount + 1);
  });

  it('returns friendly 402 and changes nothing on insufficient balance', async () => {
    const before = await snapshot();
    const res = await checkout(101);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.error.message).toContain('Top up');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back a second active checkout, then permits checkout after delivery', async () => {
    const first = await checkout();
    expect(first.status).toBe(201);
    const before = await snapshot();
    for (const state of ['PREPARING', 'DELIVERING']) {
      const duplicate = await checkout();
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('ACTIVE_ORDER_EXISTS');
      expect(duplicate.body.error.message).toContain('order in progress');
      expect(await snapshot()).toEqual(before);
      const moved = await advance(first.body.order.id);
      expect(moved.status).toBe(200);
      expect(moved.headers['x-mock']).toBeUndefined();
      expect(moved.body).toEqual({ ...first.body.order, status: state === 'PREPARING' ? 'DELIVERING' : 'DELIVERED' });
    }
    const invalid = await advance(first.body.order.id);
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('INVALID_TRANSITION');
    expect(await snapshot()).toEqual(before);
    const second = await checkout();
    expect(second.status).toBe(201);
    expect(second.body.balanceBefore).toBe(90);
    expect(second.body.balanceAfter).toBe(80);
    expect(second.body.order.id).not.toBe(first.body.order.id);
    await expectAudit(second.body.auditEntry, 'DEBIT', 10, 80);
  });

  it('credits the wallet once and allows recovery from insufficient funds', async () => {
    expect((await checkout(150)).status).toBe(402);
    const res = await topup(50.25);
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.walletBalance).toBe(150.25);
    await expectAudit(res.body.auditEntry, 'CREDIT', 50.25, 150.25);
    expect((await snapshot()).audits).toBe(auditCount + 1);
    expect((await checkout(150)).body.balanceAfter).toBe(0.25);
  });

  it.each([undefined, null, 0, -1, '10', true, {}, [], 0.001, 1.005, 100000000])('rejects invalid amount %j without writes', async (amount) => {
    const before = await snapshot();
    for (const res of [await checkout(amount, { amount }), await topup(amount)]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_AMOUNT');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('returns 404 for missing records and 400 for malformed or missing IDs', async () => {
    const before = await snapshot();
    const missing = randomUUID();
    for (const res of [await checkout(10, { userId: missing }), await checkout(10, { restaurantId: missing }),
      await request(app).post(`/api/users/${missing}/topup`).send({ amount: 10 }), await advance(missing)]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    for (const res of [await checkout(10, { userId: null }), await checkout(10, { restaurantId: 'bad' }),
      await request(app).post('/api/users/bad/topup').send({ amount: 10 }), await advance('bad')]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back top-ups that exceed wallet capacity', async () => {
    const before = await snapshot();
    const res = await topup(99999999.99);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
    expect(await snapshot()).toEqual(before);
  });
});
