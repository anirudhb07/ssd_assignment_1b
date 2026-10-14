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
    radiusMeters = parsed;
  }

  const db = await getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

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
          active: true,
          createdAt: { $gte: tenMinutesAgo },
        },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $group: {
        _id: '$driverId',
        location: { $first: '$location' },
        distanceMeters: { $first: '$distanceMeters' },
        lastSeenAt: { $first: '$createdAt' },
      },
    },
    {
      $sort: { distanceMeters: 1 },
    },
    {
      $project: {
        _id: 0,
        driverId: '$_id',
        lat: { $arrayElemAt: ['$location.coordinates', 1] },
        lng: { $arrayElemAt: ['$location.coordinates', 0] },
        distanceMeters: { $round: ['$distanceMeters', 0] },
        lastSeenAt: 1,
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
