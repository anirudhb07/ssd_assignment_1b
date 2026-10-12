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

  it('caps pageSize at 100', async () => {
    const res = await request(app).get('/api/restaurants?pageSize=100000');
    expect(res.body.pageSize).toBe(100);
  });

  it('filters by name', async () => {
    const res = await request(app).get('/api/restaurants?search=Restaurant-166');
    expect(res.body.items.map((r) => r.name)).toContain('Restaurant-166');
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

// TODO (Member A): when checkout is real, replace these with tests that use
// seeded users: one with enough balance, one without, one with an active order.
describe('POST /api/checkout (mock)', () => {
  it('returns 402 with a message when the balance is too low', async () => {
    const res = await request(app).post('/api/checkout').send({ amount: 999999 });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('returns 409 when the customer already has an active order', async () => {
    const res = await request(app).post('/api/checkout?simulate=active-order').send({ amount: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_ORDER_EXISTS');
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
