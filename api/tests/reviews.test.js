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

describe('GET /api/reviews/stats restaurantId handling', () => {
  it('returns 400 for a malformed restaurantId', async () => {
    const res = await request(app).get('/api/reviews/stats?restaurantId=not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toBe('Restaurant ID must be a valid UUID.');
  });

  it('still covers all restaurants when no restaurantId is given', async () => {
    const res = await request(app).get('/api/reviews/stats');
    expect(res.status).toBe(200);
    expect(res.body.restaurantId).toBeNull();
    expect(res.body.totalReviews).toBeGreaterThan(0);
    expect(res.body.ratingDistribution).toHaveLength(5);
  });

  it('gives zero reviews, not an error, for a well-formed id with no reviews', async () => {
    const res = await request(app).get(
      '/api/reviews/stats?restaurantId=00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(0);
    expect(res.body.averageRating).toBeNull();
    expect(res.body.ratingDistribution).toHaveLength(5);
    expect(res.body.topTags).toEqual([]);
  });
});