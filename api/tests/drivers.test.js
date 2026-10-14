import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo, getDb } from '../src/db/mongo.js';
import { pool } from '../src/db/postgres.js';

const app = createApp();

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

describe('GET /api/drivers/nearby', () => {
  const centerLat = 12.9716;
  const centerLng = 77.5946;

  it('answers real query with correct structure and without X-Mock header', async () => {
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body).toHaveProperty('origin', { lat: centerLat, lng: centerLng });
    expect(res.body).toHaveProperty('radiusMeters', 5000);
    expect(Array.isArray(res.body.drivers)).toBe(true);

    if (res.body.drivers.length > 0) {
      const first = res.body.drivers[0];
      expect(first).toHaveProperty('driverId');
      expect(typeof first.driverId).toBe('string');
      expect(first).toHaveProperty('lat');
      expect(typeof first.lat).toBe('number');
      expect(first).toHaveProperty('lng');
      expect(typeof first.lng).toBe('number');
      expect(first).toHaveProperty('distanceMeters');
      expect(typeof first.distanceMeters).toBe('number');
      expect(first).toHaveProperty('lastSeenAt');
      expect(typeof first.lastSeenAt).toBe('string');
      expect(new Date(first.lastSeenAt).toString()).not.toBe('Invalid Date');
    }
  });

  it('rejects missing or non-numeric lat/lng with 400 and friendly message', async () => {
    const resNoParams = await request(app).get('/api/drivers/nearby');
    expect(resNoParams.status).toBe(400);
    expect(resNoParams.body.error.code).toBe('BAD_REQUEST');
    expect(resNoParams.body.error.message).toMatch(/lat and lng are required/i);

    const resMissingLng = await request(app).get(`/api/drivers/nearby?lat=${centerLat}`);
    expect(resMissingLng.status).toBe(400);

    const resInvalidLat = await request(app).get(`/api/drivers/nearby?lat=invalid&lng=${centerLng}`);
    expect(resInvalidLat.status).toBe(400);

    const resOutOfRange = await request(app).get(`/api/drivers/nearby?lat=95&lng=${centerLng}`);
    expect(resOutOfRange.status).toBe(400);
  });

  it('rejects negative or invalid radius with 400', async () => {
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}&radius=-50`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sorts drivers by distance in ascending order', async () => {
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
    expect(res.status).toBe(200);
    const { drivers } = res.body;
    expect(drivers.length).toBeGreaterThan(0);

    for (let i = 0; i < drivers.length - 1; i += 1) {
      expect(drivers[i + 1].distanceMeters).toBeGreaterThanOrEqual(drivers[i].distanceMeters);
    }
  });

  it('returns at most one entry per driver (latest ping)', async () => {
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
    expect(res.status).toBe(200);
    const driverIds = res.body.drivers.map((d) => d.driverId);
    const uniqueIds = new Set(driverIds);
    expect(uniqueIds.size).toBe(driverIds.length);
  });

  it('ensures all drivers are within the specified radius', async () => {
    const radius = 2500;
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}&radius=${radius}`);
    expect(res.status).toBe(200);
    expect(res.body.radiusMeters).toBe(radius);

    for (const d of res.body.drivers) {
      expect(d.distanceMeters).toBeLessThanOrEqual(radius);
    }
  });

  it('excludes stale pings older than 10 minutes and inactive drivers', async () => {
    const db = await getDb();
    const staleDriverId = 'driver-test-stale-ping';
    const inactiveDriverId = 'driver-test-inactive-ping';

    // Insert test pings: one 15 minutes old, one inactive
    await db.collection('DriverPings').insertMany([
      {
        driverId: staleDriverId,
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat] },
        createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins old
      },
      {
        driverId: inactiveDriverId,
        active: false,
        location: { type: 'Point', coordinates: [centerLng, centerLat] },
        createdAt: new Date(), // fresh but inactive
      },
    ]);

    try {
      const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
      expect(res.status).toBe(200);
      const driverIds = res.body.drivers.map((d) => d.driverId);
      expect(driverIds).not.toContain(staleDriverId);
      expect(driverIds).not.toContain(inactiveDriverId);
    } finally {
      await db.collection('DriverPings').deleteMany({
        driverId: { $in: [staleDriverId, inactiveDriverId] },
      });
    }
  });
});
