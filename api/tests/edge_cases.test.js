// Edge cases found by comparing with another API: bad JSON, search wildcards,
// the Map radius limit, and the Wallet totals.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo } from '../src/db/mongo.js';
import { pool } from '../src/db/postgres.js';

const app = createApp();

afterAll(async () => {
  await Promise.all([pool.end(), closeMongo()]);
});

describe('edge cases', () => {
  it('answers a body that is not valid JSON with 400, not 500', async () => {
    const res = await request(app).post('/api/checkout').set('Content-Type', 'application/json').send('{"userId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('searches for % and _ literally instead of matching every name', async () => {
    for (const path of ['/api/restaurants', '/api/users']) {
      for (const text of ['%', '_']) {
        const res = await request(app).get(path).query({ search: text, pageSize: 1 });
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
      }
    }
  });

  it('rejects a Map radius over 50 km', async () => {
    const res = await request(app).get('/api/drivers/nearby').query({ lat: 12.97, lng: 77.59, radius: 50001 });
    expect(res.status).toBe(400);
  });

  it('returns credit and debit totals over every matching wallet row', async () => {
    const { rows: [u] } = await pool.query(
      `SELECT user_id,
              SUM(amount_changed) FILTER (WHERE action_type = 'CREDIT') AS c,
              COALESCE(SUM(amount_changed) FILTER (WHERE action_type = 'DEBIT'), 0) AS d
         FROM wallet_audit_logs GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1`,
    );
    const res = await request(app).get(`/api/users/${u.user_id}/audit`).query({ pageSize: 1 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.totalCredits).toBeCloseTo(Number(u.c), 2);
    expect(res.body.totalDebits).toBeCloseTo(Number(u.d), 2);
  });
});
