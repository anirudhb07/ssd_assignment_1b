// Unit tests: no database needed. These pin down the friendly messages the
// checkout screen shows when sp_execute_checkout fails.
import { describe, expect, it } from 'vitest';
import { fromPgError } from '../src/lib/errors.js';

describe('fromPgError', () => {
  it('maps the partial unique index to 409 ACTIVE_ORDER_EXISTS', () => {
    const err = fromPgError({ code: '23505', constraint: 'idx_active_user_order', message: 'duplicate key value' });
    expect(err.status).toBe(409);
    expect(err.code).toBe('ACTIVE_ORDER_EXISTS');
  });

  it('maps "Insufficient balance" to 402 and keeps both amounts', () => {
    const err = fromPgError({ code: 'P0001', message: 'Insufficient balance. Available: 180.00, Required: 640.00' });
    expect(err.status).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.message).toContain('180.00');
    expect(err.message).toContain('640.00');
  });

  it('maps a missing user to 404', () => {
    expect(fromPgError({ code: 'P0001', message: 'User does not exist: abc' }).status).toBe(404);
  });

  it('returns null for errors it does not recognise', () => {
    expect(fromPgError({ code: '42P01', message: 'relation does not exist' })).toBeNull();
  });

  it('maps a missing order to 404', () => {
    expect(fromPgError({ code: 'P0001', message: 'Order does not exist: abc' })).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('maps an already-delivered order to 409 INVALID_TRANSITION', () => {
    expect(fromPgError({ code: 'P0001', message: 'Order is already DELIVERED: abc' })).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
  });

  it('maps wallet overflow to 400 INVALID_AMOUNT', () => {
    expect(fromPgError({ code: '22003' })).toMatchObject({ status: 400, code: 'INVALID_AMOUNT' });
  });
});
