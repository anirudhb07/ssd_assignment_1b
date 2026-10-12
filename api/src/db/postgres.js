import pg from 'pg';
import { config } from '../config.js';

// NUMERIC/DECIMAL columns arrive as strings by default. Money here is
// DECIMAL(10,2), so a JS number is precise enough for display.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// COUNT(*) is BIGINT; our counts fit comfortably in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export const pool = new pg.Pool(config.pg);

export function query(text, params) {
  return pool.query(text, params);
}

// Runs fn(client) inside BEGIN/COMMIT and rolls back if it throws.
// Use this when several statements must succeed or fail together,
// e.g. read balance -> CALL sp_execute_checkout -> read new audit row.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
