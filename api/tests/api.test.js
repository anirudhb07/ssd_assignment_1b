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

describe('GET /api/health', () => {
  it('reaches both databases', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', postgres: true, mongo: true });
  });
});

describe('GET /api/restaurants', () => {
  it('returns one page, not the whole table', async () => {
    const res = await request(app).get('/api/restaurants?page=2&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.page).toBe(2);
    expect(res.body.total).toBeGreaterThan(10);
  });

  it('gives each restaurant its totals from the summary view', async () => {
    const res = await request(app).get('/api/restaurants?pageSize=5');
    const [first] = res.body.items;
    expect(Object.keys(first).sort()).toEqual(['completedOrderCount', 'completedRevenue', 'id', 'latitude', 'longitude', 'name']);
    // The same numbers as the restaurant page, which reads the same view.
    const detail = await request(app).get(`/api/restaurants/${first.id}`);
    expect(first.completedOrderCount).toBe(detail.body.summary.completedOrderCount);
    expect(first.completedRevenue).toBe(detail.body.summary.completedRevenue);
  });

  it('caps pageSize at 100', async () => {
    const res = await request(app).get('/api/restaurants?pageSize=100000');
    expect(res.body.pageSize).toBe(100);
  });

  it('filters by name', async () => {
    // Search for a restaurant that exists, whatever the seed size.
    const first = await request(app).get('/api/restaurants?pageSize=1');
    const { name } = first.body.items[0];

    const res = await request(app).get(`/api/restaurants?search=${encodeURIComponent(name)}`);
    expect(res.body.items.map((r) => r.name)).toContain(name);
    expect(res.body.total).toBeLessThan(first.body.total);
  });
});

describe('GET /api/reviews/stats', () => {
  it('returns all five rating buckets from the $facet pipeline', async () => {
    const res = await request(app).get('/api/reviews/stats');
    expect(res.status).toBe(200);
    expect(res.body.ratingDistribution.map((r) => r.rating)).toEqual([1, 2, 3, 4, 5]);
    expect(res.body.totalReviews).toBeGreaterThan(0);
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
