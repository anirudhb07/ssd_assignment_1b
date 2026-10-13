// Issue #6: wallet_audit_logs rows have a reliable order (sql/08_audit_ordering.sql
// and the seeder). Issue #14: GET /api/users/:id/audit. Runs against the
// seeded database, so reseed with RESET=1 after pulling #6.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo } from '../src/db/mongo.js';
import { pool, query } from '../src/db/postgres.js';

const app = createApp();
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

describe('seeded wallet history', () => {
  it('spreads over the 30-day window instead of sharing one timestamp', async () => {
    const { rows: [r] } = await query(`
      SELECT COUNT(DISTINCT changed_at) AS times,
             EXTRACT(EPOCH FROM MAX(changed_at) - MIN(changed_at)) / 86400 AS days
        FROM wallet_audit_logs`);
    expect(r.times).toBeGreaterThan(1);
    expect(r.days).toBeGreaterThan(20);
  });

  it('chains: ordered by seq, each balance follows from the previous one, starting at 0', async () => {
    const { rows: [r] } = await query(`
      WITH x AS (
        SELECT action_type, amount_changed, balance_after, changed_at,
               LAG(balance_after, 1, 0) OVER w AS prev_balance,
               LAG(changed_at) OVER w AS prev_time
          FROM wallet_audit_logs
        WINDOW w AS (PARTITION BY user_id ORDER BY seq)
      )
      SELECT COUNT(*) FILTER (WHERE balance_after <> prev_balance
                                + CASE action_type WHEN 'CREDIT' THEN amount_changed ELSE -amount_changed END) AS broken,
             COUNT(*) FILTER (WHERE changed_at < prev_time) AS out_of_order
        FROM x`);
    expect(r).toEqual({ broken: 0, out_of_order: 0 });
  });

  it("ends at each customer's current wallet balance", async () => {
    const { rows: [r] } = await query(`
      SELECT COUNT(*) AS mismatched
        FROM users u
        LEFT JOIN LATERAL (
          SELECT balance_after FROM wallet_audit_logs a WHERE a.user_id = u.id ORDER BY seq DESC LIMIT 1
        ) last ON true
       WHERE last.balance_after IS DISTINCT FROM u.wallet_balance`);
    expect(r.mismatched).toBe(0);
  });
});

describe('fn_wallet_audit', () => {
  // Rolled back, so the database is unchanged.
  async function inRollback(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('gives two changes in one transaction their own real times, in order', async () => {
    const rows = await inRollback(async (c) => {
      const { rows: [u] } = await c.query('SELECT id FROM users WHERE wallet_balance > 100 LIMIT 1');
      await c.query('UPDATE users SET wallet_balance = wallet_balance - 10 WHERE id = $1', [u.id]);
      await c.query('UPDATE users SET wallet_balance = wallet_balance + 25 WHERE id = $1', [u.id]);
      return (await c.query(
        'SELECT seq, action_type, changed_at FROM wallet_audit_logs WHERE user_id = $1 ORDER BY seq DESC LIMIT 2',
        [u.id],
      )).rows.reverse();
    });
    expect(rows.map((r) => r.action_type)).toEqual(['DEBIT', 'CREDIT']);
    expect(rows[1].changed_at.getTime()).toBeGreaterThan(rows[0].changed_at.getTime());
    expect(Date.now() - rows[1].changed_at.getTime()).toBeLessThan(60_000);
  });

  it('uses bitestream.audit_at only inside the transaction that set it', async () => {
    const backdated = await inRollback(async (c) => {
      const { rows: [u] } = await c.query('SELECT id FROM users LIMIT 1');
      await c.query("SELECT set_config('bitestream.audit_at', '2020-01-01T00:00:00Z', true)");
      await c.query('UPDATE users SET wallet_balance = wallet_balance + 1 WHERE id = $1', [u.id]);
      return (await c.query(
        'SELECT changed_at FROM wallet_audit_logs WHERE user_id = $1 ORDER BY seq DESC LIMIT 1',
        [u.id],
      )).rows[0].changed_at;
    });
    expect(backdated.toISOString()).toBe('2020-01-01T00:00:00.000Z');

    const { rows: [s] } = await query("SELECT COALESCE(current_setting('bitestream.audit_at', true), '') AS value");
    expect(s.value).toBe('');
  });
});

describe('GET /api/users/:id/audit', () => {
  // The customer with the longest history, and the Indian calendar day
  // (YYYY-MM-DD) of one of their middle rows.
  async function busyCustomer() {
    const { rows: [r] } = await query(`
      SELECT a.user_id AS "userId", u.wallet_balance AS "walletBalance", COUNT(*) AS total,
             to_char((ARRAY_AGG(a.changed_at ORDER BY a.seq))[COUNT(*) / 2] AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "midDay"
        FROM wallet_audit_logs a JOIN users u ON u.id = a.user_id
       GROUP BY a.user_id, u.wallet_balance
       ORDER BY COUNT(*) DESC, a.user_id
       LIMIT 1`);
    return r;
  }

  it("returns the customer's real history, newest first, ending at their balance", async () => {
    const c = await busyCustomer();
    const res = await request(app).get(`/api/users/${c.userId}/audit?pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.total).toBe(c.total);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['actionType', 'amountChanged', 'balanceAfter', 'changedAt', 'id']);
    const times = res.body.items.map((a) => Date.parse(a.changedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.items[0].balanceAfter).toBe(c.walletBalance);
    expect(res.body.items.at(-1).actionType).toBe('CREDIT'); // the opening credit
  });

  it('filters by Indian calendar day, with both ends included', async () => {
    const c = await busyCustomer();
    const res = await request(app).get(`/api/users/${c.userId}/audit?from=${c.midDay}&to=${c.midDay}&pageSize=100`);
    expect(res.status).toBe(200);
    const { rows: [r] } = await query(
      `SELECT COUNT(*) AS n FROM wallet_audit_logs
        WHERE user_id = $1 AND (changed_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
      [c.userId, c.midDay],
    );
    expect(r.n).toBeGreaterThan(0);
    expect(res.body.total).toBe(r.n);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(res.body.items.every((a) => day.format(new Date(a.changedAt)) === c.midDay)).toBe(true);
  });

  it('accepts only one side of the range', async () => {
    const c = await busyCustomer();
    const [after, before] = await Promise.all([
      request(app).get(`/api/users/${c.userId}/audit?from=${c.midDay}&pageSize=1`),
      request(app).get(`/api/users/${c.userId}/audit?to=${c.midDay}&pageSize=1`),
    ]);
    expect(after.body.total).toBeGreaterThan(0);
    expect(before.body.total).toBeGreaterThan(0);
    expect(after.body.total + before.body.total).toBeGreaterThan(c.total); // midDay counted in both
  });

  it('is empty for a range with no entries', async () => {
    const c = await busyCustomer();
    const res = await request(app).get(`/api/users/${c.userId}/audit?from=2030-01-01`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it('rejects bad dates with a readable message', async () => {
    const c = await busyCustomer();
    const get = (q) => request(app).get(`/api/users/${c.userId}/audit?${q}`);
    const [reversed, impossible, format] = await Promise.all([
      get('from=2026-10-05&to=2026-10-01'),
      get('from=2026-02-30'),
      get('to=12-10-2026'),
    ]);
    expect(reversed.status).toBe(400);
    expect(reversed.body.error.message).toBe('The start date must be on or before the end date.');
    expect(impossible.status).toBe(400);
    expect(format.status).toBe(400);
    expect(format.body.error.message).toContain('end date');
  });

  it('returns 404 for an unknown customer and 400 for a malformed id', async () => {
    expect((await request(app).get(`/api/users/${UNKNOWN_ID}/audit`)).status).toBe(404);
    expect((await request(app).get('/api/users/not-an-id/audit')).status).toBe(400);
  });
});
