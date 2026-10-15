import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ORDER_SELECT } from '../db/orders.js';
import { withTransaction } from '../db/postgres.js';
import { readWalletChange } from '../db/wallet.js';
import { requireAmount, requireId } from '../lib/checkoutInput.js';
import { notFound } from '../lib/errors.js';

export const checkoutRouter = Router();

// POST /api/checkout { userId, restaurantId, amount, items? } — REAL.
checkoutRouter.post('/', async (req, res) => {
  const userId = requireId(req.body?.userId, 'Customer ID');
  const restaurantId = requireId(req.body?.restaurantId, 'Restaurant ID');
  const amount = requireAmount(req.body?.amount);
  const result = await withTransaction(async (client) => {
    // Lock before reading so balanceBefore belongs to this checkout even
    // when another request is changing the same wallet concurrently.
    const before = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!before.rowCount) throw notFound('That customer');
    const orderId = randomUUID();
    await client.query('CALL sp_execute_checkout($1, $2, $3, $4)', [orderId, userId, restaurantId, amount]);
    const order = await client.query(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
    const { walletBalance, auditEntry } = await readWalletChange(client, userId);
    return { order: order.rows[0], balanceBefore: before.rows[0].wallet_balance, balanceAfter: walletBalance, auditEntry };
  });
  res.status(201).json(result);
});
