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

describe('GET /api/restaurants/:id/menu', () => {
  it('returns the real menu of a restaurant', async () => {
    const list = await request(app).get('/api/restaurants?pageSize=1');
    const restaurant = list.body.items[0];

    const res = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body.restaurantId).toBe(restaurant.id);
    expect(res.body.restaurantName).toBe(restaurant.name);
    expect(res.body._id).toBeUndefined();
    expect(Number.isNaN(Date.parse(res.body.updatedAt))).toBe(false);

    expect(res.body.categories.length).toBeGreaterThan(0);
    for (const category of res.body.categories) {
      expect(typeof category.name).toBe('string');
      expect(category.items.length).toBeGreaterThan(0);

      for (const item of category.items) {
        expect(typeof item.name).toBe('string');
        expect(typeof item.price).toBe('number');
        expect(item.price).toBeGreaterThan(0);
        expect(typeof item.available).toBe('boolean');
        expect(Array.isArray(item.customizationAddOns)).toBe(true);
        for (const addOn of item.customizationAddOns) {
          expect(typeof addOn.name).toBe('string');
          expect(typeof addOn.price).toBe('number');
        }
      }
    }
  });

  it('every restaurant on a page has a menu that belongs to it', async () => {
    const list = await request(app).get('/api/restaurants?pageSize=25');
    const restaurants = list.body.items;

    const responses = await Promise.all(
      restaurants.map((r) => request(app).get(`/api/restaurants/${r.id}/menu`)),
    );

    responses.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.restaurantId).toBe(restaurants[i].id);
      expect(res.body.restaurantName).toBe(restaurants[i].name);
    });
  });

  it('returns 404 for a well-formed id that has no menu', async () => {
    const res = await request(app).get(
      '/api/restaurants/00000000-0000-0000-0000-000000000000/menu',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a malformed restaurant id', async () => {
    const res = await request(app).get('/api/restaurants/abc/menu');
    expect(res.status).toBe(400);
    expect(typeof res.body.error.code).toBe('string');
    expect(typeof res.body.error.message).toBe('string');
  });
});