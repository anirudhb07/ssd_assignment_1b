import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo, getDb } from '../src/db/mongo.js';
import { pool } from '../src/db/postgres.js';

const app = createApp();

const testFixtureDrivers = [
  'driver-suite-active-1',
  'driver-suite-active-2',
  'driver-suite-active-3',
];

describe('GET /api/drivers/nearby', () => {
  const centerLat = 12.9716;
  const centerLng = 77.5946;

  beforeAll(async () => {
    const db = await getDb();
    const now = new Date();
    // Deterministic fixtures: ~350m, ~1.5km, ~3.5km from origin
    await db.collection('DriverPings').insertMany([
      {
        driverId: 'driver-suite-active-1',
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat + 0.003] }, // ~330m
        createdAt: now,
      },
      {
        driverId: 'driver-suite-active-2',
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat + 0.014] }, // ~1.55km
        createdAt: now,
      },
      {
        driverId: 'driver-suite-active-3',
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat + 0.032] }, // ~3.55km
        createdAt: now,
      },
    ]);
  });

  afterAll(async () => {
    const db = await getDb();
    await db.collection('DriverPings').deleteMany({
      driverId: { $in: testFixtureDrivers },
    });
    await Promise.all([pool.end(), closeMongo()]);
  });

  // These two tests query the full nearby drivers API against the seeded dataset.
  // With ~500K pings (growing via simulator) and ~29K recent pings, the deduplication
  // and $geoNear aggregation can take 3-5 seconds. 10s timeout accommodates this realistic load.

  it('answers real query with correct structure and without X-Mock header', { timeout: 10000 }, async () => {
    const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-mock']).toBeUndefined();
    expect(res.body).toHaveProperty('origin', { lat: centerLat, lng: centerLng });
    expect(res.body).toHaveProperty('radiusMeters', 5000);
    expect(Array.isArray(res.body.drivers)).toBe(true);

    expect(res.body.drivers.length).toBeGreaterThanOrEqual(3);
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
    expect(drivers.length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < drivers.length - 1; i += 1) {
      expect(drivers[i + 1].distanceMeters).toBeGreaterThanOrEqual(drivers[i].distanceMeters);
    }
  });

  it('returns at most one entry per driver (latest ping)', { timeout: 10000 }, async () => {
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

  it('does not show driver whose newest ping is inactive, even if older ping was active and in range', async () => {
    const db = await getDb();
    const driverId = 'driver-test-went-offline';

    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    const thirtySecAgo = new Date(Date.now() - 30 * 1000);

    await db.collection('DriverPings').insertMany([
      {
        driverId,
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat] },
        createdAt: twoMinAgo,
      },
      {
        driverId,
        active: false, // Driver went offline
        location: { type: 'Point', coordinates: [centerLng, centerLat] },
        createdAt: thirtySecAgo,
      },
    ]);

    try {
      const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
      expect(res.status).toBe(200);
      const driverIds = res.body.drivers.map((d) => d.driverId);
      expect(driverIds).not.toContain(driverId);
    } finally {
      await db.collection('DriverPings').deleteMany({ driverId });
    }
  });

  it('does not show driver whose newest ping moved outside the radius, even if older ping was within range', async () => {
    const db = await getDb();
    const driverId = 'driver-test-moved-outside';

    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    const thirtySecAgo = new Date(Date.now() - 30 * 1000);

    await db.collection('DriverPings').insertMany([
      {
        driverId,
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat] }, // inside
        createdAt: twoMinAgo,
      },
      {
        driverId,
        active: true,
        location: { type: 'Point', coordinates: [centerLng, centerLat + 0.15] }, // ~16.6 km away (outside)
        createdAt: thirtySecAgo,
      },
    ]);

    try {
      const res = await request(app).get(`/api/drivers/nearby?lat=${centerLat}&lng=${centerLng}`);
      expect(res.status).toBe(200);
      const driverIds = res.body.drivers.map((d) => d.driverId);
      expect(driverIds).not.toContain(driverId);
    } finally {
      await db.collection('DriverPings').deleteMany({ driverId });
    }
  });
});
