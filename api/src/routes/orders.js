import { Router } from 'express';
import { ORDER_SELECT, ORDER_STATUSES } from '../db/orders.js';
import { query, withTransaction } from '../db/postgres.js';
import { requireId } from '../lib/checkoutInput.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';

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

// POST /api/orders/:id/advance — REAL.
ordersRouter.post('/:id/advance', async (req, res) => {
  const orderId = requireId(req.params.id, 'Order ID');
  const order = await withTransaction(async (client) => {
    await client.query('CALL sp_advance_order_status($1)', [orderId]);
    const result = await client.query(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
    return result.rows[0];
  });
  res.json(order);
});
