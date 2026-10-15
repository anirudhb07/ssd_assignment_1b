// Integration tests: these call the real databases, so start them first
// with `docker compose up -d` from the repo root.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo } from '../src/db/mongo.js';
import { pool } from '../src/db/postgres.js';

const app = createApp();

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

const toDay = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

// The moving average is the mean of dailyRevenue over the days that have orders
// in [date - 6 days, date]. Recompute it here and compare.
function expectMovingAverageToMatch(points) {
  for (const point of points) {
    const day = toDay(point.date);
    const window = points.filter((p) => toDay(p.date) <= day && toDay(p.date) >= day - 6);
    const expected = window.reduce((sum, p) => sum + p.dailyRevenue, 0) / window.length;
    expect(Math.abs(point.movingAvg7d - expected)).toBeLessThanOrEqual(0.01);
  }
}

describe('GET /api/analytics/ranking', () => {
  it('returns one page of ranked restaurants, best first', async () => {
    const res = await request(app).get('/api/analytics/ranking?pageSize=10');
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.items).toHaveLength(10);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.total).toBeGreaterThan(10);

    const [first] = res.body.items;
    expect(first.rank).toBe(1);
    expect(typeof first.restaurantId).toBe('string');
    expect(typeof first.restaurantName).toBe('string');
    expect(typeof first.totalRevenue).toBe('number');
  });

  it('ranks by revenue, and equal revenue shares a rank (DENSE_RANK)', async () => {
    const res = await request(app).get('/api/analytics/ranking?pageSize=100');
    const items = res.body.items;

    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1];
      const current = items[i];
      expect(current.totalRevenue).toBeLessThanOrEqual(previous.totalRevenue);
      if (current.totalRevenue === previous.totalRevenue) {
        expect(current.rank).toBe(previous.rank);
      } else {
        expect(current.rank).toBe(previous.rank + 1);
      }
    }
  });

  it('pages do not overlap', async () => {
    const one = await request(app).get('/api/analytics/ranking?page=1&pageSize=5');
    const two = await request(app).get('/api/analytics/ranking?page=2&pageSize=5');
    const idsOne = one.body.items.map((r) => r.restaurantId);
    const idsTwo = two.body.items.map((r) => r.restaurantId);

    expect(two.body.page).toBe(2);
    expect(idsTwo.filter((id) => idsOne.includes(id))).toEqual([]);
    expect(two.body.items[0].rank).toBeGreaterThanOrEqual(one.body.items.at(-1).rank);
  });

  it('caps pageSize at 100', async () => {
    const res = await request(app).get('/api/analytics/ranking?pageSize=100000');
    expect(res.body.pageSize).toBe(100);
  });
});

describe('GET /api/analytics/revenue', () => {
  it('defaults to the top-ranked restaurant', async () => {
    const ranking = await request(app).get('/api/analytics/ranking?pageSize=1');
    const top = ranking.body.items[0];

    const res = await request(app).get('/api/analytics/revenue');
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.restaurantId).toBe(top.restaurantId);
    expect(res.body.restaurantName).toBe(top.restaurantName);
  });

  it('returns daily points, oldest first, with numeric values', async () => {
    const res = await request(app).get('/api/analytics/revenue');
    const { points } = res.body;

    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof point.dailyRevenue).toBe('number');
      expect(typeof point.movingAvg7d).toBe('number');
    }

    const days = points.map((p) => toDay(p.date));
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it('daily revenue adds up to the restaurant total in the ranking', async () => {
    const res = await request(app).get('/api/analytics/revenue');
    const ranking = await request(app).get('/api/analytics/ranking?pageSize=1');
    const sum = res.body.points.reduce((total, p) => total + p.dailyRevenue, 0);

    expect(Math.abs(sum - ranking.body.items[0].totalRevenue)).toBeLessThanOrEqual(0.01);
  });

  it('moving average covers 6 calendar days back, including restaurants with gaps', async () => {
    const first = await request(app).get('/api/analytics/ranking?pageSize=100');
    const lastPage = Math.ceil(first.body.total / 100);
    const last = await request(app).get(`/api/analytics/ranking?pageSize=100&page=${lastPage}`);

    // The lowest-earning restaurants are the most likely to have days without orders.
    const ids = [first.body.items[0], ...last.body.items.slice(-3)].map((r) => r.restaurantId);

    for (const id of ids) {
      const res = await request(app).get(`/api/analytics/revenue?restaurantId=${id}`);
      expect(res.status).toBe(200);
      expect(res.body.restaurantId).toBe(id);
      expectMovingAverageToMatch(res.body.points);
    }
  });

  it('rejects a malformed restaurantId with 400', async () => {
    const res = await request(app).get('/api/analytics/revenue?restaurantId=abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 404 for a restaurant that does not exist', async () => {
    const res = await request(app).get(
      '/api/analytics/revenue?restaurantId=00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/analytics/summary', () => {
  it('returns totals and the top restaurants', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();

    const { totals, topRestaurants, lastRefreshedAt } = res.body;
    expect(totals.restaurants).toBeGreaterThan(0);
    expect(totals.completedOrders).toBeGreaterThan(0);
    expect(totals.completedRevenue).toBeGreaterThan(0);

    // null until the first refresh is logged; otherwise an ISO timestamp.
    if (lastRefreshedAt !== null) {
      expect(Number.isNaN(Date.parse(lastRefreshedAt))).toBe(false);
    }

    expect(topRestaurants.length).toBeGreaterThan(0);
    expect(topRestaurants.length).toBeLessThanOrEqual(5);
    for (const item of topRestaurants) {
      expect(typeof item.completedOrderCount).toBe('number');
      expect(typeof item.completedRevenue).toBe('number');
    }
  });

  it('lists the top restaurants in ranking order', async () => {
    const summary = await request(app).get('/api/analytics/summary');
    const ranking = await request(app).get(
      `/api/analytics/ranking?pageSize=${summary.body.topRestaurants.length}`,
    );

    expect(summary.body.topRestaurants.map((r) => r.restaurantId)).toEqual(
      ranking.body.items.map((r) => r.restaurantId),
    );
    expect(summary.body.topRestaurants.map((r) => r.completedRevenue)).toEqual(
      ranking.body.items.map((r) => r.totalRevenue),
    );
  });

  it('totals are at least the sum of the top restaurants', async () => {
    const res = await request(app).get('/api/analytics/summary');
    const topRevenue = res.body.topRestaurants.reduce((sum, r) => sum + r.completedRevenue, 0);
    expect(res.body.totals.completedRevenue).toBeGreaterThanOrEqual(topRevenue);
  });
});

describe('POST /api/analytics/summary/refresh', () => {
  it('refreshes the view, logs it, and moves lastRefreshedAt forward', async () => {
    const before = await request(app).get('/api/analytics/summary');
    const logBefore = await pool.query('SELECT COUNT(*)::int AS n FROM restaurant_summary_refresh_log');
    const startedAt = Date.now();

    const res = await request(app).post('/api/analytics/summary/refresh');
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();

    // Same shape as GET /summary.
    expect(res.body.totals.completedOrders).toBeGreaterThan(0);
    expect(Array.isArray(res.body.topRestaurants)).toBe(true);

    const refreshedAt = Date.parse(res.body.lastRefreshedAt);
    expect(Number.isNaN(refreshedAt)).toBe(false);
    // A few seconds of slack in case the database clock is slightly off.
    expect(refreshedAt).toBeGreaterThanOrEqual(startedAt - 5000);
    if (before.body.lastRefreshedAt !== null) {
      expect(refreshedAt).toBeGreaterThan(Date.parse(before.body.lastRefreshedAt));
    }

    const logAfter = await pool.query('SELECT COUNT(*)::int AS n FROM restaurant_summary_refresh_log');
    expect(logAfter.rows[0].n).toBeGreaterThan(logBefore.rows[0].n);

    // The summary now reports the refresh that was just logged.
    const after = await request(app).get('/api/analytics/summary');
    expect(Date.parse(after.body.lastRefreshedAt)).toBeGreaterThanOrEqual(refreshedAt);
  });
});