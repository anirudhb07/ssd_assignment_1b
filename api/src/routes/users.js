import { Router } from 'express';
import { auditEntry, auditLog, order, sendMock, users } from '../mocks.js';

export const usersRouter = Router();

// GET /api/users?search=&page=&pageSize= — MOCK.
// TODO (Member B): copy the pattern in routes/restaurants.js.
usersRouter.get('/', (req, res) => {
  sendMock(res, { items: users, page: 1, pageSize: 20, total: users.length });
});

// GET /api/users/:id — MOCK. TODO (Member B): user + their PREPARING/DELIVERING order (or null).
usersRouter.get('/:id', (req, res) => {
  sendMock(res, { ...users[0], id: req.params.id, activeOrder: order });
});

// GET /api/users/:id/audit?from=&to=&page=&pageSize= — MOCK.
// TODO (Member B): wallet_audit_logs for this user, newest first, filtered by
// changed_at. Needs seeder fix #2 before the order is meaningful.
usersRouter.get('/:id/audit', (req, res) => {
  sendMock(res, { items: auditLog, page: 1, pageSize: 20, total: auditLog.length });
});

// POST /api/users/:id/topup  { amount } — MOCK.
// TODO (Member B): CALL sp_wallet_topup (Member A adds it), return new balance + CREDIT row.
usersRouter.post('/:id/topup', (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  sendMock(res, {
    walletBalance: users[0].walletBalance + amount,
    auditEntry: { ...auditEntry, actionType: 'CREDIT', amountChanged: amount, balanceAfter: users[0].walletBalance + amount },
  });
});
