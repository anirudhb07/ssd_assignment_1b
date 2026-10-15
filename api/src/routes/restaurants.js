import { Router } from 'express';
import { getDb } from '../db/mongo.js';
import { query } from '../db/postgres.js';
import { requireId } from '../lib/checkoutInput.js';
import { notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';

export const restaurantsRouter = Router();

// GET /api/restaurants?search=&page=&pageSize=
// REAL. Reference pattern for every paginated PostgreSQL list.
restaurantsRouter.get('/', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const search = String(req.query.search ?? '').trim();

  // Always use $1, $2… placeholders. Never build SQL by pasting in user input.
  const where = search ? 'WHERE name ILIKE $1' : '';
  const params = search ? [`%${search}%`] : [];

  const [rows, count] = await Promise.all([
    query(
      `SELECT id, name, latitude, longitude
         FROM restaurants ${where}
        ORDER BY name
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    query(`SELECT COUNT(*) AS total FROM restaurants ${where}`, params),
  ]);

  res.json(paged(rows.rows, count.rows[0].total, { page, pageSize }));
});

// GET /api/restaurants/:id — REAL.
// Totals come from the materialized view restaurant_order_summary, so they
// are as fresh as its last refresh (Analytics has the Refresh button).
restaurantsRouter.get('/:id', async (req, res) => {
  const result = await query(
    `SELECT r.id, r.name, r.latitude, r.longitude,
            s.completed_order_count AS "completedOrderCount",
            s.completed_revenue     AS "completedRevenue"
       FROM restaurants r
       LEFT JOIN restaurant_order_summary s ON s.restaurant_id = r.id
      WHERE r.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) throw notFound('That restaurant');

  const { completedOrderCount, completedRevenue, ...restaurant } = result.rows[0];
  // A restaurant added after the last refresh isn't in the view yet.
  res.json({ ...restaurant, summary: { completedOrderCount: completedOrderCount ?? 0, completedRevenue: completedRevenue ?? 0 } });
});

// GET /api/restaurants/:id/menu — REAL.
// The Menus document for the restaurant. Menus use the PostgreSQL restaurant id
// (mongo_seeder.py reads it from PostgreSQL), so any id from /restaurants works.
// A malformed id is a 400 (same as the other routes). A well-formed id with no
// menu, including an id that isn't a restaurant, is a 404.
restaurantsRouter.get('/:id/menu', async (req, res) => {
  requireId(req.params.id, 'Restaurant ID');

  const db = await getDb();
  const menu = await db
    .collection('Menus')
    .findOne({ restaurantId: req.params.id }, { projection: { _id: 0 } });

  if (!menu) throw notFound('The menu for that restaurant');
  res.json(menu);
});