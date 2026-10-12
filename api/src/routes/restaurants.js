import { Router } from 'express';
import { query } from '../db/postgres.js';
import { paged, parsePagination } from '../lib/pagination.js';
import { menu, restaurant, sendMock } from '../mocks.js';

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

// GET /api/restaurants/:id  — MOCK. TODO (Member B): read restaurants +
// restaurant_order_summary for this id; 404 if missing.
restaurantsRouter.get('/:id', (req, res) => {
  sendMock(res, { ...restaurant, id: req.params.id, summary: { completedOrderCount: 240, completedRevenue: 354950 } });
});

// GET /api/restaurants/:id/menu — MOCK. TODO (Member C): Menus.findOne({ restaurantId }).
// The real query finds nothing until seeder fix #1 links Mongo restaurant IDs
// to PostgreSQL; return 404 NOT_FOUND when there is no menu.
restaurantsRouter.get('/:id/menu', (req, res) => {
  sendMock(res, { ...menu, restaurantId: req.params.id });
});
