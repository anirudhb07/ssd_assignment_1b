import { Router } from 'express';
import { getDb } from '../db/mongo.js';
import { badRequest } from '../lib/errors.js';

export const driversRouter = Router();

// GET /api/drivers/nearby?lat=&lng=&radius=5000
// REAL (Workflow 3 / Issue #16).
// Runs the Workflow 3 $geoNear aggregation pipeline against DriverPings in MongoDB.
// Returns active drivers with fresh pings (within the last 10 minutes), deduplicated
// to each driver's latest ping, sorted by distance from the origin.
driversRouter.get('/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw badRequest('lat and lng are required numbers.');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw badRequest('lat must be between -90 and 90, lng between -180 and 180.');
  }

  const radiusRaw = req.query.radius;
  let radiusMeters = 5000;
  if (radiusRaw !== undefined && radiusRaw !== '') {
    const parsed = Number(radiusRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw badRequest('radius must be a positive number.');
    }
    if (parsed > 50000) {
      throw badRequest('radius can be at most 50000 metres (50 km).');
    }
    radiusMeters = parsed;
  }

  const db = await getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Step 1: Deduplicate pings to each driver's single most recent ping in the last 10 minutes.
  // This ensures drivers who went offline or moved outside the radius are not matched on an older ping.
  const latest = await db.collection('DriverPings').aggregate([
    { $match: { createdAt: { $gte: tenMinutesAgo } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$driverId', pingId: { $first: '$_id' } } },
  ]).toArray();

  if (latest.length === 0) {
    return res.json({
      origin: { lat, lng },
      radiusMeters,
      drivers: [],
    });
  }

  const pingIds = latest.map((l) => l.pingId);

  // Step 2: Run $geoNear matching only latest pings that are active and within radius.
  // Results are sorted by distance ascending by $geoNear automatically.
  const drivers = await db.collection('DriverPings').aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat], // GeoJSON order: [longitude, latitude]
        },
        key: 'location',
        distanceField: 'distanceMeters',
        maxDistance: radiusMeters,
        spherical: true,
        query: {
          _id: { $in: pingIds },
          active: true,
        },
      },
    },
    {
      $project: {
        _id: 0,
        driverId: 1,
        lat: { $arrayElemAt: ['$location.coordinates', 1] },
        lng: { $arrayElemAt: ['$location.coordinates', 0] },
        distanceMeters: { $round: ['$distanceMeters', 0] },
        lastSeenAt: '$createdAt',
      },
    },
  ]).toArray();

  res.json({
    origin: { lat, lng },
    radiusMeters,
    drivers: drivers.map((d) => ({
      driverId: d.driverId,
      lat: d.lat,
      lng: d.lng,
      distanceMeters: d.distanceMeters,
      lastSeenAt: d.lastSeenAt instanceof Date ? d.lastSeenAt.toISOString() : new Date(d.lastSeenAt).toISOString(),
    })),
  });
});
