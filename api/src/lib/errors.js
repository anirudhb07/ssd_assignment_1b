// Every error response has the shape { error: { code, message } }.
// `message` is written for the person using the app, so the front end
// can show it as-is.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what) => new ApiError(404, 'NOT_FOUND', `${what} was not found.`);
export const badRequest = (message) => new ApiError(400, 'BAD_REQUEST', message);

// Turns errors raised by PostgreSQL (constraints, RAISE EXCEPTION in the
// stored procedures) into friendly ApiErrors. Returns null when the error
// is not one we recognise.
export function fromPgError(err) {
  if (err.code === '23505' && err.constraint === 'idx_active_user_order') {
    return new ApiError(
      409,
      'ACTIVE_ORDER_EXISTS',
      'This customer already has an order in progress. Mark it as delivered before placing a new one.',
    );
  }

  if (err.code === 'P0001') {
    const insufficient = /Insufficient balance\. Available: ([\d.]+), Required: ([\d.]+)/.exec(err.message);
    if (insufficient) {
      const [, available, required] = insufficient;
      return new ApiError(
        402,
        'INSUFFICIENT_BALANCE',
        `Not enough money in the wallet. Balance is ₹${available} but this order costs ₹${required}. Top up the wallet and try again.`,
      );
    }
    if (/^User does not exist/.test(err.message)) return notFound('That customer');
    if (/^Order does not exist/.test(err.message)) return notFound('That order');
    if (/^Order is already DELIVERED/.test(err.message)) {
      return new ApiError(409, 'INVALID_TRANSITION', 'This order has already been delivered and cannot be advanced further.');
    }
    if (/^Restaurant does not exist/.test(err.message)) return notFound('That restaurant');
    if (/must be greater than zero/.test(err.message)) {
      return new ApiError(400, 'INVALID_AMOUNT', 'The amount must be greater than zero.');
    }
  }

  if (err.code === '22P02') return badRequest('One of the IDs in the request is not a valid ID.');
  if (err.code === '22003') return new ApiError(400, 'INVALID_AMOUNT', 'The amount would exceed the wallet balance limit.');
  if (err.code === '23514') return badRequest('That change would break a database rule (for example, a negative wallet balance).');

  return null;
}
