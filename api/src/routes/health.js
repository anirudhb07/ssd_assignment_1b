import { Router } from 'express';
import { query } from '../db/postgres.js';
import { getDb } from '../db/mongo.js';

export const healthRouter = Router();

// GET /api/health — is the API up, and can it reach both databases?
healthRouter.get('/', async (req, res) => {
  const [postgres, mongo] = await Promise.all([
    query('SELECT 1').then(() => true, () => false),
    getDb().then((db) => db.command({ ping: 1 })).then(() => true, () => false),
  ]);
  res.status(postgres && mongo ? 200 : 503).json({ status: postgres && mongo ? 'ok' : 'degraded', postgres, mongo });
});
