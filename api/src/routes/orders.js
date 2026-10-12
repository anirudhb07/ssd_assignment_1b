import { Router } from 'express';
import { ORDER_SELECT, ORDER_STATUSES } from '../db/orders.js';
import { query } from '../db/postgres.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';
import { order, sendMock } from '../mocks.js';

export const ordersRouter = Router();

// GET /api/orders?userId=&restaurantId=&status=&page=&pageSize= — REAL.
// Every filter is optional. Newest first; idx_orders_created_at
// (sql/08_orders_recent_index.sql) keeps this fast on 120k rows.
ordersRouter.get('/', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);

  // Build "WHERE a AND b" from whichever filters were sent, always with
  // $n placeholders so request values never become part of the SQL text.
  const conditions = [];
  const params = [];
  const filter = (column, value) => {
    params.push(value);
    conditions.push(`${column} = $${params.length}`);
  };
  if (req.query.userId) filter('o.user_id', String(req.query.userId));
  if (req.query.restaurantId) filter('o.restaurant_id', String(req.query.restaurantId));
  if (req.query.status) {
    const status = String(req.query.status).toUpperCase();
    if (!ORDER_STATUSES.includes(status)) {
      throw badRequest(`Status must be one of ${ORDER_STATUSES.join(', ')}.`);
    }
    filter('o.status', status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, count] = await Promise.all([
    query(
      `${ORDER_SELECT} ${where}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    query(`SELECT COUNT(*) AS total FROM orders o ${where}`, params),
  ]);

  res.json(paged(rows.rows, count.rows[0].total, { page, pageSize }));
});

// GET /api/orders/:id — REAL.
ordersRouter.get('/:id', async (req, res) => {
  const result = await query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
  if (result.rowCount === 0) throw notFound('That order');
  res.json(result.rows[0]);
});

// POST /api/orders/:id/advance — MOCK.
// TODO (Member A): add sp_advance_order_status (sql/07) and CALL it here.
// PREPARING -> DELIVERING -> DELIVERED; 409 INVALID_TRANSITION if already DELIVERED.
ordersRouter.post('/:id/advance', (req, res) => {
  sendMock(res, { ...order, id: req.params.id, status: 'DELIVERING' });
});
