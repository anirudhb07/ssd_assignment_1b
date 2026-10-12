// Issue #12: the Browse routes (users, orders, restaurant detail) against
// the real seeded databases. Start them first with `docker compose up -d`.
// Expected values are read from the database itself, so the tests work at
// any seed size.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo } from '../src/db/mongo.js';
import { pool, query } from '../src/db/postgres.js';

const app = createApp();
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const ORDER_KEYS = ['createdAt', 'id', 'restaurantId', 'restaurantName', 'status', 'totalAmount', 'userId', 'userName'];

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

const firstRow = async (sql) => (await query(sql)).rows[0];

describe('GET /api/users', () => {
  it('returns one page of real users with camelCase fields', async () => {
    const res = await request(app).get('/api/users?pageSize=5');
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.items).toHaveLength(5);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['id', 'name', 'walletBalance']);
    expect(typeof res.body.items[0].walletBalance).toBe('number');
    const { total } = await firstRow('SELECT COUNT(*) AS total FROM users');
    expect(res.body.total).toBe(total);
  });

  it('narrows the list with a name search', async () => {
    const all = await request(app).get('/api/users?pageSize=1');
    const { name } = all.body.items[0];
    const res = await request(app).get(`/api/users?search=${encodeURIComponent(name)}`);
    expect(res.body.items.map((u) => u.name)).toContain(name);
    expect(res.body.total).toBeLessThan(all.body.total);
  });
});

describe('GET /api/users/:id', () => {
  it("includes the customer's order in progress", async () => {
    const order = await firstRow("SELECT id, user_id FROM orders WHERE status = 'PREPARING' LIMIT 1");
    const res = await request(app).get(`/api/users/${order.user_id}`);
    expect(res.status).toBe(200);
    expect(res.body.activeOrder.id).toBe(order.id);
    expect(res.body.activeOrder.status).toBe('PREPARING');
  });

  it('has activeOrder null when nothing is in progress', async () => {
    const user = await firstRow(`
      SELECT id FROM users u
       WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status IN ('PREPARING', 'DELIVERING'))
       LIMIT 1`);
    const res = await request(app).get(`/api/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.activeOrder).toBeNull();
  });

  it('returns 404 for an unknown customer and 400 for a malformed id', async () => {
    expect((await request(app).get(`/api/users/${UNKNOWN_ID}`)).status).toBe(404);
    const bad = await request(app).get('/api/users/not-an-id');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /api/orders', () => {
  it('lists orders newest first, with names, without loading the whole table', async () => {
    const res = await request(app).get('/api/orders?pageSize=20');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(ORDER_KEYS);
    const times = res.body.items.map((o) => Date.parse(o.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('pages do not overlap', async () => {
    const [p1, p2] = await Promise.all([
      request(app).get('/api/orders?page=1&pageSize=10'),
      request(app).get('/api/orders?page=2&pageSize=10'),
    ]);
    const ids = new Set(p1.body.items.map((o) => o.id));
    expect(p2.body.items.some((o) => ids.has(o.id))).toBe(false);
  });

  it('filters by status and counts the matching rows', async () => {
    const res = await request(app).get('/api/orders?status=delivering&pageSize=50');
    expect(res.body.items.every((o) => o.status === 'DELIVERING')).toBe(true);
    const { total } = await firstRow("SELECT COUNT(*) AS total FROM orders WHERE status = 'DELIVERING'");
    expect(res.body.total).toBe(total);
  });

  it("filters by customer", async () => {
    const { user_id: userId } = await firstRow('SELECT user_id FROM orders LIMIT 1');
    const res = await request(app).get(`/api/orders?userId=${userId}&pageSize=100`);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items.every((o) => o.userId === userId)).toBe(true);
  });

  it('rejects an unknown status with a readable message', async () => {
    const res = await request(app).get('/api/orders?status=COOKING');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('PREPARING');
  });
});

describe('GET /api/orders/:id', () => {
  it('returns the same order the list shows', async () => {
    const list = await request(app).get('/api/orders?pageSize=1');
    const res = await request(app).get(`/api/orders/${list.body.items[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(list.body.items[0]);
  });

  it('returns 404 for an unknown order', async () => {
    expect((await request(app).get(`/api/orders/${UNKNOWN_ID}`)).status).toBe(404);
  });
});

describe('GET /api/restaurants/:id', () => {
  it('includes the totals from the materialized view', async () => {
    const row = await firstRow('SELECT restaurant_id, completed_order_count, completed_revenue FROM restaurant_order_summary LIMIT 1');
    const res = await request(app).get(`/api/restaurants/${row.restaurant_id}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      completedOrderCount: row.completed_order_count,
      completedRevenue: row.completed_revenue,
    });
  });

  it('returns 404 for an unknown restaurant', async () => {
    expect((await request(app).get(`/api/restaurants/${UNKNOWN_ID}`)).status).toBe(404);
  });
});
