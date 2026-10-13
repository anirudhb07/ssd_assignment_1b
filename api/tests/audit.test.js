// Issue #6: wallet_audit_logs rows have a reliable order (sql/08_audit_ordering.sql
// and the seeder). Runs against the seeded database, so reseed with RESET=1
// after pulling the change.
import { afterAll, describe, expect, it } from 'vitest';
import { closeMongo } from '../src/db/mongo.js';
import { pool, query } from '../src/db/postgres.js';

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
