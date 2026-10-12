import { Router } from 'express';
import { badRequest } from '../lib/errors.js';
import { nearbyDrivers, sendMock } from '../mocks.js';

export const driversRouter = Router();

// GET /api/drivers/nearby?lat=&lng=&radius=5000 — MOCK.
// TODO (Member D): the Workflow 3 $geoNear pipeline (mongo/02), with the
// fixes from the plan: recent pings only, one row per driver, all within radius.
driversRouter.get('/nearby', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest('lat and lng are required numbers.');
  const radiusMeters = Number(req.query.radius) || 5000;
  sendMock(res, { origin: { lat, lng }, radiusMeters, drivers: nearbyDrivers(lat, lng) });
});
