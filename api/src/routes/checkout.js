import { Router } from 'express';
import { auditEntry, order, sendMock, users } from '../mocks.js';

export const checkoutRouter = Router();

// POST /api/checkout  { userId, restaurantId, amount, items? } — MOCK.
//
// TODO (Member B): inside withTransaction():
//   1. SELECT wallet_balance (balanceBefore)
//   2. CALL sp_execute_checkout(gen_random_uuid(), userId, restaurantId, amount)
//   3. SELECT the new balance and the newest wallet_audit_logs row
// Errors from the procedure are mapped by lib/errors.js (402 / 409 / 404).
//
// While mocked, you can test the failure screens:
//   amount > 5000           -> 402 INSUFFICIENT_BALANCE
//   ?simulate=active-order  -> 409 ACTIVE_ORDER_EXISTS
checkoutRouter.post('/', (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  const balanceBefore = users[0].walletBalance;

  if (req.query.simulate === 'active-order') {
    sendMock(res, { error: { code: 'ACTIVE_ORDER_EXISTS', message: 'This customer already has an order in progress. Mark it as delivered before placing a new one.' } }, 409);
    return;
  }
  if (amount > 5000) {
    sendMock(res, { error: { code: 'INSUFFICIENT_BALANCE', message: `Not enough money in the wallet. Balance is ₹${balanceBefore} but this order costs ₹${amount}. Top up the wallet and try again.` } }, 402);
    return;
  }

  sendMock(res, {
    order: { ...order, totalAmount: amount, userId: req.body?.userId ?? order.userId, restaurantId: req.body?.restaurantId ?? order.restaurantId },
    balanceBefore,
    balanceAfter: balanceBefore - amount,
    auditEntry: { ...auditEntry, amountChanged: amount, balanceAfter: balanceBefore - amount },
  }, 201);
});
