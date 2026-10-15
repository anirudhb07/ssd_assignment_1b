import { ApiError, badRequest } from './errors.js';

export function requireId(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(`${label} must be a valid UUID.`);
  }
  return value;
}

export function requireAmount(value) {
  // Reject fractional paise so checkout cannot round the order and wallet
  // independently. The API contract accepts JSON numbers, not strings.
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0
      || value > 99999999.99 || value !== Number(value.toFixed(2))) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a positive number with at most two decimal places, up to ₹99999999.99.');
  }
  return value;
}
