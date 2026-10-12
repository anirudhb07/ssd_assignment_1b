import { Router } from 'express';
import { order, sendMock } from '../mocks.js';

export const ordersRouter = Router();

// GET /api/orders?userId=&restaurantId=&status=&page=&pageSize= — MOCK.
// TODO (Member B): paginated, newest first, join restaurant + user names.
ordersRouter.get('/', (req, res) => {
  const items = ['PREPARING', 'DELIVERING', 'DELIVERED'].map((status, i) => ({
    ...order, id: order.id.replace(/1$/, String(i + 1)), status,
  }));
  sendMock(res, { items, page: 1, pageSize: 20, total: items.length });
});

// GET /api/orders/:id — MOCK.
ordersRouter.get('/:id', (req, res) => {
  sendMock(res, { ...order, id: req.params.id });
});

// POST /api/orders/:id/advance — MOCK.
// TODO (Member A): add sp_advance_order_status (sql/07) and CALL it here.
// PREPARING -> DELIVERING -> DELIVERED; 409 INVALID_TRANSITION if already DELIVERED.
ordersRouter.post('/:id/advance', (req, res) => {
  sendMock(res, { ...order, id: req.params.id, status: 'DELIVERING' });
});
