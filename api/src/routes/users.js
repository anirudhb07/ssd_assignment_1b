import { Router } from 'express';
import { ACTIVE_STATUSES, ORDER_SELECT } from '../db/orders.js';
import { query } from '../db/postgres.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';
import { auditEntry, sendMock, users } from '../mocks.js';

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

// Dates in the wallet filter are Indian calendar days, matching the times the
// app shows; the database stores UTC.
const AUDIT_TIME_ZONE = 'Asia/Kolkata';

// Reads an optional YYYY-MM-DD query value. Rejects impossible dates such
// as 2026-02-30 instead of letting them roll over into March.
function parseDay(value, label) {
  if (value == null || value === '') return null;
  const text = String(value);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text)
    && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
  if (!valid) throw badRequest(`The ${label} date must look like 2026-10-01.`);
  return text;
}

// GET /api/users/:id/audit?from=&to=&page=&pageSize= — REAL.
// The customer's wallet_audit_logs rows, newest first. `from` and `to` are
// both optional and both included (to=2026-10-12 covers that whole day).
// seq breaks ties between rows with the same time (sql/08_audit_ordering.sql).
usersRouter.get('/:id/audit', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const from = parseDay(req.query.from, 'start');
  const to = parseDay(req.query.to, 'end');
  if (from && to && from > to) throw badRequest('The start date must be on or before the end date.');

  const conditions = ['user_id = $1'];
  const params = [req.params.id];
  if (from) {
    params.push(from);
    conditions.push(`changed_at >= ($${params.length}::date)::timestamp AT TIME ZONE '${AUDIT_TIME_ZONE}'`);
  }
  if (to) {
    params.push(to);
    conditions.push(`changed_at < ($${params.length}::date + 1)::timestamp AT TIME ZONE '${AUDIT_TIME_ZONE}'`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const [user, rows, count] = await Promise.all([
    query('SELECT 1 FROM users WHERE id = $1', [req.params.id]),
    query(
      `SELECT id,
              changed_at     AS "changedAt",
              action_type    AS "actionType",
              amount_changed AS "amountChanged",
              balance_after  AS "balanceAfter"
         FROM wallet_audit_logs ${where}
        ORDER BY changed_at DESC, seq DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    query(`SELECT COUNT(*) AS total FROM wallet_audit_logs ${where}`, params),
  ]);
  if (user.rowCount === 0) throw notFound('That customer');

  res.json(paged(rows.rows, count.rows[0].total, { page, pageSize }));
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
