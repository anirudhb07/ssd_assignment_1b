import { ApiError, fromPgError } from '../lib/errors.js';

export function notFoundRoute(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.originalUrl}.` } });
}

// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // A request body that isn't valid JSON is the caller's mistake, not a server error.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The request body is not valid JSON.' } });
    return;
  }
  const apiError = err instanceof ApiError ? err : fromPgError(err);
  if (apiError) {
    res.status(apiError.status).json({ error: { code: apiError.code, message: apiError.message } });
    return;
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server. Check the API logs.' } });
}
