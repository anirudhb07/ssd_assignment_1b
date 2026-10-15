// Issue #66: the demo customers from sql/fixtures/demo_customers.sql. Each test
// runs inside a transaction that is rolled back, so the database is unchanged.
// Needs a seed run after pulling #66 (docker compose run --rm seed), which
// creates sp_reset_demo_customers().
import { afterAll, describe, expect, it } from 'vitest';
import { closeMongo } from '../src/db/mongo.js';
import { pool } from '../src/db/postgres.js';

const PLENTY = '00000000-0000-4000-8000-00000000d001';
const LOW = '00000000-0000-4000-8000-00000000d002';
const BUSY = '00000000-0000-4000-8000-00000000d003';

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

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

// Balance and whether an order is in progress, per demo customer.
async function demoState(client) {
  const { rows } = await client.query(
    `SELECT u.id, u.name, u.wallet_balance AS balance,
            EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status IN ('PREPARING', 'DELIVERING')) AS "inProgress"
       FROM users u WHERE u.id = ANY($1)`,
    [[PLENTY, LOW, BUSY]],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

function expectDemoState(state) {
  expect(state[PLENTY]).toMatchObject({ name: 'Demo - plenty of money', inProgress: false });
  expect(Number(state[PLENTY].balance)).toBeGreaterThanOrEqual(5000);
  expect(state[LOW]).toMatchObject({ name: 'Demo - low balance', inProgress: false });
  expect(Number(state[LOW].balance)).toBe(45);
  expect(state[BUSY]).toMatchObject({ name: 'Demo - order in progress', inProgress: true });
}

const restaurantId = async (client) =>
  (await client.query("SELECT id FROM restaurants WHERE name = 'Restaurant-1'")).rows[0].id;

const checkout = (client, userId, restaurant, amount) =>
  client.query('CALL sp_execute_checkout(gen_random_uuid(), $1, $2, $3)', [userId, restaurant, amount]);

describe('demo customers (sql/fixtures/demo_customers.sql)', () => {
  it('puts the three customers in their demo state', async () => {
    await inRollback(async (c) => {
      await c.query('CALL sp_reset_demo_customers()');
      expectDemoState(await demoState(c));
    });
  });

  it('gives each one its checkout outcome: success, not enough money, order in progress', async () => {
    await inRollback(async (c) => {
      await c.query('CALL sp_reset_demo_customers()');
      const restaurant = await restaurantId(c);

      await expect(checkout(c, PLENTY, restaurant, 240)).resolves.toBeDefined();
      await c.query('SAVEPOINT low');
      await expect(checkout(c, LOW, restaurant, 240)).rejects.toThrow(/Insufficient balance/);
      await c.query('ROLLBACK TO SAVEPOINT low');
      await expect(checkout(c, BUSY, restaurant, 240)).rejects.toThrow(/idx_active_user_order/);
    });
  });

  it('puts them back after a demo, and their wallet history still adds up', async () => {
    await inRollback(async (c) => {
      await c.query('CALL sp_reset_demo_customers()');
      const restaurant = await restaurantId(c);

      // A demo: the first orders, the second tops up, the third's order is delivered.
      await checkout(c, PLENTY, restaurant, 1261.17);
      await c.query('CALL sp_wallet_topup($1, 600)', [LOW]);
      const { rows: [order] } = await c.query(
        "SELECT id FROM orders WHERE user_id = $1 AND status IN ('PREPARING', 'DELIVERING')", [BUSY],
      );
      await c.query('CALL sp_advance_order_status($1)', [order.id]);
      await c.query('CALL sp_advance_order_status($1)', [order.id]);

      await c.query('CALL sp_reset_demo_customers()');
      expectDemoState(await demoState(c));

      const { rows: [chain] } = await c.query(
        `WITH x AS (
           SELECT user_id, action_type, amount_changed, balance_after,
                  LAG(balance_after, 1, 0) OVER (PARTITION BY user_id ORDER BY seq) AS prev
             FROM wallet_audit_logs WHERE user_id = ANY($1))
         SELECT COUNT(*) FILTER (WHERE balance_after <> prev
                  + CASE action_type WHEN 'CREDIT' THEN amount_changed ELSE -amount_changed END) AS broken
           FROM x`,
        [[PLENTY, LOW, BUSY]],
      );
      expect(chain.broken).toBe(0);
    });
  });
});
