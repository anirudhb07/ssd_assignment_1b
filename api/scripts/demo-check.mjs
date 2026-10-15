// Run only in the disposable Compose project documented in docs/demo_checklist.md.
// Uses real HTTP and database connections; leaves evidence rows for inspection.
import assert from 'node:assert/strict';
import { pool } from '../src/db/postgres.js';
import { getDb, closeMongo } from '../src/db/mongo.js';

assert.equal(process.env.DEMO_DISPOSABLE, '1', 'Set DEMO_DISPOSABLE=1 only after verifying the disposable project.');
const base = 'http://localhost:4000/api';
const evidence = { at: new Date().toISOString(), checks: {} };
async function request(path, body, expected = 200) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return { data, mock: response.headers.get('x-mock'), status: response.status };
}
async function snapshot(id) {
  return (await pool.query(`SELECT wallet_balance,
    (SELECT count(*) FROM orders WHERE user_id=u.id) AS orders,
    (SELECT count(*) FROM orders WHERE user_id=u.id AND status IN ('PREPARING','DELIVERING')) AS active,
    (SELECT count(*) FROM wallet_audit_logs WHERE user_id=u.id) AS audits
    FROM users u WHERE id=$1`, [id])).rows[0];
}
async function audit(entry, userId, type, amount, balance) {
  const row = (await pool.query('SELECT * FROM wallet_audit_logs WHERE id=$1', [entry.id])).rows[0];
  assert.equal(row.user_id, userId);
  assert.equal(row.action_type, type);
  assert.equal(row.amount_changed, amount);
  assert.equal(row.balance_after, balance);
}
try {
  evidence.health = (await request('/health')).data;
  const restaurant = (await pool.query('SELECT * FROM restaurants ORDER BY name LIMIT 1')).rows[0];
  const funded = (await pool.query(`SELECT u.* FROM users u WHERE wallet_balance >= 2160
    AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=u.id AND status <> 'DELIVERED') ORDER BY u.id LIMIT 1`)).rows[0];
  const poor = (await pool.query(`SELECT u.* FROM users u WHERE wallet_balance < 240
    AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=u.id AND status <> 'DELIVERED') ORDER BY u.id LIMIT 1`)).rows[0];
  assert.ok(funded && poor, 'Seed needs a funded and a low-balance customer with no active order.');
  evidence.records = { restaurant, funded, poor };
  const checkout = (user, amount, status = 201) => request('/checkout', { userId: user.id, restaurantId: restaurant.id, amount }, status);
  const before = await snapshot(funded.id);
  const first = await checkout(funded, 1080);
  assert.equal(first.mock, null);
  assert.equal(first.data.order.status, 'PREPARING');
  assert.equal(first.data.balanceBefore, before.wallet_balance);
  assert.equal(first.data.balanceAfter, before.wallet_balance - 1080);
  await audit(first.data.auditEntry, funded.id, 'DEBIT', 1080, first.data.balanceAfter);
  const after = await snapshot(funded.id);
  assert.deepEqual(after, { wallet_balance: before.wallet_balance - 1080, orders: before.orders + 1, active: 1, audits: before.audits + 1 });
  const conflict = await checkout(funded, 1080, 409);
  assert.equal(conflict.data.error.code, 'ACTIVE_ORDER_EXISTS');
  assert.deepEqual(await snapshot(funded.id), after);
  const index = (await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_active_user_order'")).rows[0];
  assert.ok(index?.indexdef.includes('UNIQUE') && index.indexdef.includes('user_id'));
  // Prove the invariant below the API, without persisting a direct insert.
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await assert.rejects(c.query(`INSERT INTO orders(id,user_id,restaurant_id,total_amount,status)
      VALUES(gen_random_uuid(),$1,$2,1,'PREPARING')`, [funded.id, restaurant.id]),
    (error) => error.code === '23505' && error.constraint === 'idx_active_user_order');
  } finally { await c.query('ROLLBACK'); c.release(); }
  const statuses = [];
  for (const expected of ['DELIVERING', 'DELIVERED']) {
    const moved = await request(`/orders/${first.data.order.id}/advance`, {});
    assert.equal(moved.data.status, expected);
    assert.equal((await request(`/orders/${first.data.order.id}`)).data.status, expected);
    statuses.push(expected);
  }
  const stale = await request(`/orders/${first.data.order.id}/advance`, {}, 409);
  assert.equal(stale.data.error.code, 'INVALID_TRANSITION');
  const second = await checkout(funded, 1080);
  assert.equal((await snapshot(funded.id)).active, 1);
  evidence.checks.checkout = { status: 'PASS', before, after, first: first.data, conflict: conflict.data, statuses, stale: stale.data, secondOrder: second.data.order.id };
  evidence.checks.partialIndex = { status: 'PASS', ...index, directInsert: '23505 idx_active_user_order; rolled back' };

  // Hold the wallet row until all five real HTTP requests are waiting on a lock.
  // This proves overlap rather than relying on Promise.all timing alone.
  const concurrentUser = (await pool.query(`SELECT u.* FROM users u WHERE wallet_balance >= 100 AND u.id <> $1
    AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=u.id AND status <> 'DELIVERED') ORDER BY u.id LIMIT 1`, [poor.id])).rows[0];
  const concurrentBefore = await snapshot(concurrentUser.id);
  const gate = await pool.connect();
  let waiting = 0;
  let requests;
  try {
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [concurrentUser.id]);
    requests = Promise.all(Array.from({ length: 5 }, async () => {
      const res = await fetch(base + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: concurrentUser.id, restaurantId: restaurant.id, amount: 10 }) });
      return { status: res.status, data: await res.json() };
    }));
    const deadline = Date.now() + 10000;
    while (waiting < 5 && Date.now() < deadline) {
      waiting = (await pool.query(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND query LIKE 'SELECT wallet_balance FROM users WHERE id%'`)).rows[0].count;
      if (waiting < 5) await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally { await gate.query('ROLLBACK'); gate.release(); }
  const concurrentResults = await requests;
  assert.equal(waiting, 5, 'Did not observe five overlapping locked requests.');
  assert.deepEqual(concurrentResults.map((r) => r.status).sort(), [201,409,409,409,409]);
  for (const result of concurrentResults.filter((r) => r.status === 409)) assert.equal(result.data.error.code, 'ACTIVE_ORDER_EXISTS');
  const concurrentAfter = await snapshot(concurrentUser.id);
  assert.deepEqual(concurrentAfter, { wallet_balance: concurrentBefore.wallet_balance - 10, orders: concurrentBefore.orders + 1, active: 1, audits: concurrentBefore.audits + 1 });
  evidence.checks.concurrentCheckout = { status: 'PASS', userId: concurrentUser.id, blockedRequestsObserved: waiting,
    httpStatuses: concurrentResults.map((r) => r.status), before: concurrentBefore, after: concurrentAfter };

  const poorBefore = await snapshot(poor.id);
  const insufficient = await checkout(poor, 240, 402);
  assert.equal(insufficient.data.error.code, 'INSUFFICIENT_BALANCE');
  assert.deepEqual(await snapshot(poor.id), poorBefore);
  const credit = (await request(`/users/${poor.id}/topup`, { amount: 500 })).data;
  assert.equal(credit.walletBalance, poorBefore.wallet_balance + 500);
  await audit(credit.auditEntry, poor.id, 'CREDIT', 500, credit.walletBalance);
  const retry = (await checkout(poor, 240)).data;
  await audit(retry.auditEntry, poor.id, 'DEBIT', 240, credit.walletBalance - 240);
  assert.deepEqual(await snapshot(poor.id), { wallet_balance: credit.walletBalance - 240, orders: poorBefore.orders + 1, active: 1, audits: poorBefore.audits + 2 });
  const history = (await request(`/users/${poor.id}/audit`)).data.items;
  assert.ok(history.some((row) => row.id === credit.auditEntry.id));
  assert.ok(history.some((row) => row.id === retry.auditEntry.id));
  evidence.checks.topup = { status: 'PASS', before: poorBefore, insufficient: insufficient.data, credit, retry };

  await pool.query('CALL sp_refresh_restaurant_summary()');
  const totals = (await pool.query(`SELECT count(*) AS count, coalesce(sum(total_amount),0) AS revenue
    FROM orders WHERE status='DELIVERED'`)).rows[0];
  const summary = (await pool.query(`SELECT sum(completed_order_count)::bigint AS count,
    sum(completed_revenue) AS revenue FROM restaurant_order_summary`)).rows[0];
  assert.deepEqual(summary, totals);
  const analytics = await request('/analytics/summary');
  evidence.checks.analytics = { status: analytics.mock ? 'BLOCKED' : 'NOT RUN', mock: analytics.mock, sqlTotals: totals, materializedViewMatches: true };

  const db = await getDb();
  const pgRestaurantStats = (await request(`/reviews/stats?restaurantId=${restaurant.id}`)).data;
  const sampleReview = await db.collection('Reviews').findOne();
  assert.ok(sampleReview, 'Seed must contain reviews.');
  const reviewStats = (await request(`/reviews/stats?restaurantId=${sampleReview.restaurantId}`)).data;
  const reviews = await db.collection('Reviews').find({ restaurantId: sampleReview.restaurantId }).toArray();
  assert.ok(reviews.length > 0);
  assert.equal(reviewStats.totalReviews, reviews.length);
  const average = reviews.length ? Math.round(reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length * 100) / 100 : null;
  assert.equal(reviewStats.averageRating, average);
  assert.deepEqual(reviewStats.ratingDistribution, [1,2,3,4,5].map((rating) => ({ rating, count: reviews.filter((row) => row.rating === rating).length })));
  const tags = new Map();
  for (const row of reviews) for (const tag of row.sentimentTags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  assert.deepEqual(reviewStats.topTags, [...tags].map(([tag,count]) => ({ tag,count })).sort((a,b) => b.count-a.count || a.tag.localeCompare(b.tag)));
  const empty = (await request('/reviews/stats?restaurantId=00000000-0000-4000-8000-000000000000')).data;
  assert.equal(empty.totalReviews, 0); assert.equal(empty.averageRating, null);
  const menu = await request(`/restaurants/${restaurant.id}/menu`);
  evidence.checks.reviews = { status: 'BLOCKED', apiStatistics: 'PASS', reviewStats, pgRestaurantStats, empty, menuMock: menu.mock, mongoMenuExists: !!await db.collection('Menus').findOne({ restaurantId: restaurant.id }) };

  const indexes = await db.collection('DriverPings').indexes();
  assert.ok(indexes.some((index) => index.key.location === '2dsphere'));
  assert.ok(indexes.some((index) => index.expireAfterSeconds === 7200));
  const cutoff = new Date(Date.now() - 7200000);
  const nearby = await db.collection('DriverPings').aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: [77.5946,12.9716] }, key: 'location', distanceField: 'distanceMeters', maxDistance: 5000, spherical: true, query: { active: true, createdAt: { $gte: cutoff } } } },
    { $limit: 5 }, { $project: { _id: 0, driverId: 1, createdAt: 1, distanceMeters: 1 } },
  ]).toArray();
  const map = await request('/drivers/nearby?lat=12.9716&lng=77.5946&radius=5000');
  evidence.checks.map = { status: 'BLOCKED', mock: map.mock, indexes, recentPingCount: await db.collection('DriverPings').countDocuments({ createdAt: { $gte: cutoff } }), nearby };
  evidence.checks.consistency = (await pool.query(`SELECT
    (SELECT count(*) FROM (SELECT user_id FROM orders WHERE status <> 'DELIVERED' GROUP BY user_id HAVING count(*)>1) x) AS duplicate_active,
    (SELECT count(*) FROM users u WHERE wallet_balance IS DISTINCT FROM
      (SELECT balance_after FROM wallet_audit_logs WHERE user_id=u.id ORDER BY seq DESC LIMIT 1)) AS balance_mismatches`)).rows[0];
  assert.deepEqual(evidence.checks.consistency, { duplicate_active: 0, balance_mismatches: 0 });
  console.log(JSON.stringify(evidence, null, 2));
} finally { await Promise.all([pool.end(), closeMongo()]); }
