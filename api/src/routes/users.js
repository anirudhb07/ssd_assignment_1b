import { Router } from 'express';
import { ACTIVE_STATUSES, ORDER_SELECT } from '../db/orders.js';
import { query } from '../db/postgres.js';
import { notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';
import { auditEntry, auditLog, sendMock, users } from '../mocks.js';

export const usersRouter = Router();

// GET /api/users?search=&page=&pageSize= — REAL.
// Same pattern as GET /api/restaurants: optional name search, one page.
usersRouter.get('/', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const search = String(req.query.search ?? '').trim();

  const where = search ? 'WHERE name ILIKE $1' : '';
  const params = search ? [`%${search}%`] : [];

  const [rows, count] = await Promise.all([
    query(
      `SELECT id, name, wallet_balance AS "walletBalance"
         FROM users ${where}
        ORDER BY name, id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    query(`SELECT COUNT(*) AS total FROM users ${where}`, params),
  ]);

  res.json(paged(rows.rows, count.rows[0].total, { page, pageSize }));
});

// GET /api/users/:id — REAL.
// The customer plus their order in progress (PREPARING or DELIVERING), or
// null. The partial unique index guarantees there is at most one.
usersRouter.get('/:id', async (req, res) => {
  const [user, active] = await Promise.all([
    query('SELECT id, name, wallet_balance AS "walletBalance" FROM users WHERE id = $1', [req.params.id]),
    query(`${ORDER_SELECT} WHERE o.user_id = $1 AND o.status = ANY($2) LIMIT 1`, [req.params.id, ACTIVE_STATUSES]),
  ]);
  if (user.rowCount === 0) throw notFound('That customer');

  res.json({ ...user.rows[0], activeOrder: active.rows[0] ?? null });
});

// GET /api/users/:id/audit?from=&to=&page=&pageSize= — MOCK.
// TODO (Member B): wallet_audit_logs for this user, newest first, filtered by
// changed_at. Needs seeder fix #2 before the order is meaningful.
usersRouter.get('/:id/audit', (req, res) => {
  sendMock(res, { items: auditLog, page: 1, pageSize: 20, total: auditLog.length });
});

// POST /api/users/:id/topup  { amount } — MOCK.
// TODO (Member A): add sp_wallet_topup (sql/07) and CALL it here; return new balance + CREDIT row.
usersRouter.post('/:id/topup', (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  sendMock(res, {
    walletBalance: users[0].walletBalance + amount,
    auditEntry: { ...auditEntry, actionType: 'CREDIT', amountChanged: amount, balanceAfter: users[0].walletBalance + amount },
  });
});
