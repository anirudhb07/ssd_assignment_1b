import { Router } from 'express';
import { query } from '../db/postgres.js';
import { notFound } from '../lib/errors.js';
import { paged, parsePagination } from '../lib/pagination.js';

export const analyticsRouter = Router();

// How many restaurants the summary card lists.
const TOP_RESTAURANTS = 5;

// The pg driver returns NUMERIC and BIGINT as strings; the API contract says numbers.
const num = (value) => (value === null || value === undefined ? value : Number(value));

// GET /api/analytics/revenue?restaurantId= — REAL.
// Daily revenue and 7-day moving average for one restaurant (fn_restaurant_revenue_trend, sql/09).
// restaurantId is optional: without it, the top-ranked restaurant is used.
analyticsRouter.get('/revenue', async (req, res) => {
  const requestedId = String(req.query.restaurantId ?? '').trim();

  let restaurant;
  if (requestedId) {
    // A malformed id raises a PostgreSQL error that lib/errors.js turns into 400 BAD_REQUEST.
    const found = await query('SELECT id, name FROM restaurants WHERE id = $1', [requestedId]);
    if (found.rowCount === 0) throw notFound('That restaurant');
    restaurant = found.rows[0];
  } else {
    const top = await query(
      `SELECT restaurant_id AS id, restaurant_name AS name
         FROM fn_restaurant_revenue_ranking()
        ORDER BY revenue_rank, restaurant_name, restaurant_id
        LIMIT 1`,
    );
    if (top.rowCount === 0) throw notFound('A restaurant with completed orders');
    restaurant = top.rows[0];
  }

  const trend = await query(
    `SELECT order_date::text            AS "date",
            daily_revenue               AS "dailyRevenue",
            seven_day_moving_average    AS "movingAvg7d"
       FROM fn_restaurant_revenue_trend($1)
      ORDER BY order_date`,
    [restaurant.id],
  );

  res.json({
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    points: trend.rows.map((row) => ({
      date: row.date,
      dailyRevenue: num(row.dailyRevenue),
      movingAvg7d: num(row.movingAvg7d),
    })),
  });
});

// GET /api/analytics/ranking?page=&pageSize= — REAL.
// DENSE_RANK() by total revenue (fn_restaurant_revenue_ranking, sql/09). Ties share a rank.
analyticsRouter.get('/ranking', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);

  const [rows, count] = await Promise.all([
    query(
      `SELECT revenue_rank     AS "rank",
              restaurant_id    AS "restaurantId",
              restaurant_name  AS "restaurantName",
              total_revenue    AS "totalRevenue"
         FROM fn_restaurant_revenue_ranking()
        ORDER BY revenue_rank, restaurant_name, restaurant_id
        LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    ),
    query('SELECT COUNT(*) AS total FROM fn_restaurant_revenue_ranking()'),
  ]);

  const items = rows.rows.map((row) => ({ ...row, totalRevenue: num(row.totalRevenue) }));
  res.json(paged(items, count.rows[0].total, { page, pageSize }));
});

// One statement, so the totals, the top list and the refresh time all come from the same snapshot.
// json_build_object keeps NUMERIC values as JSON numbers.
const SUMMARY_SQL = `
  WITH totals AS (
    SELECT COUNT(*)::int                           AS restaurants,
           COALESCE(SUM(completed_order_count), 0) AS completed_orders,
           COALESCE(SUM(completed_revenue), 0)     AS completed_revenue
      FROM restaurant_order_summary
  ), top_rows AS (
    SELECT revenue_rank, restaurant_id, restaurant_name, completed_order_count, total_revenue
      FROM fn_restaurant_revenue_ranking()
     ORDER BY revenue_rank, restaurant_name, restaurant_id
     LIMIT $1
  )
  SELECT
    (SELECT refreshed_at
       FROM restaurant_summary_refresh_log
      ORDER BY refreshed_at DESC
      LIMIT 1) AS "lastRefreshedAt",

    (SELECT json_build_object(
              'restaurants',      restaurants,
              'completedOrders',  completed_orders,
              'completedRevenue', completed_revenue)
       FROM totals) AS "totals",

    COALESCE(
      (SELECT json_agg(
                json_build_object(
                  'restaurantId',        restaurant_id,
                  'restaurantName',      restaurant_name,
                  'completedOrderCount', completed_order_count,
                  'completedRevenue',    total_revenue)
                ORDER BY revenue_rank, restaurant_name, restaurant_id)
         FROM top_rows),
      '[]'::json) AS "topRestaurants"
`;

async function readSummary() {
  const result = await query(SUMMARY_SQL, [TOP_RESTAURANTS]);
  const row = result.rows[0];
  // lastRefreshedAt is null until the first refresh through sp_refresh_restaurant_summary() is logged.
  return { lastRefreshedAt: row.lastRefreshedAt, totals: row.totals, topRestaurants: row.topRestaurants };
}

// GET /api/analytics/summary — REAL. Totals from restaurant_order_summary + last logged refresh.
analyticsRouter.get('/summary', async (req, res) => {
  res.json(await readSummary());
});

// POST /api/analytics/summary/refresh — REAL.
// CALL sp_refresh_restaurant_summary() refreshes the view and writes a refresh-log row (sql/09).
analyticsRouter.post('/summary/refresh', async (req, res) => {
  await query('CALL sp_refresh_restaurant_summary()');
  res.json(await readSummary());
});