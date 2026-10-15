-- Captures EXPLAIN (ANALYZE, BUFFERS) for the PostgreSQL queries the app runs
-- (issue #67). Each query is the SQL the API sends (api/src/routes/*.js), with
-- real ids picked from the seeded data. Keep them in step if the routes change.
-- Run on the seeded database; it only reads. These three commands work the
-- same in bash and PowerShell (the file is written inside the container):
--
--   docker compose cp performance/capture_postgres_plans.sql postgres:/tmp/capture_postgres_plans.sql
--   docker compose exec -T postgres sh -c "psql -X -q -U postgres -d bitestream -f /tmp/capture_postgres_plans.sql > /tmp/postgres_explain_analyzes.txt"
--   docker compose cp postgres:/tmp/postgres_explain_analyzes.txt performance/postgres_explain_analyzes.txt

\pset pager off
\pset footer off

-- Ids for the queries: the customer with the longest wallet history, a
-- customer with an order in progress, and the top-earning restaurant.
SELECT user_id AS busy_user FROM wallet_audit_logs GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 1 \gset
SELECT user_id AS active_user FROM orders WHERE status IN ('PREPARING', 'DELIVERING') ORDER BY user_id LIMIT 1 \gset
SELECT restaurant_id AS top_restaurant FROM restaurant_order_summary ORDER BY completed_revenue DESC, restaurant_id LIMIT 1 \gset
SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date - 14 AS from_day, (now() AT TIME ZONE 'Asia/Kolkata')::date AS to_day \gset

\echo 'PostgreSQL query plans for BiteStream (issue #67)'
SELECT 'Captured ' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST on ' || split_part(version(), ',', 1) AS "Run",
       (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM restaurants) AS restaurants,
       (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM wallet_audit_logs) AS audit_rows;

\echo
\echo '=== 1. Browse > Orders, newest first (GET /api/orders, page 1). Index: idx_orders_created_at (sql/08_orders_recent_index.sql)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.user_id, u.name, o.restaurant_id, r.name, o.total_amount, o.status, o.created_at
  FROM orders o
  JOIN users u       ON u.id = o.user_id
  JOIN restaurants r ON r.id = o.restaurant_id
 ORDER BY o.created_at DESC, o.id DESC
 LIMIT 20 OFFSET 0;

\echo
\echo '=== 2. Browse > Orders for one customer (GET /api/orders?userId=). Index: idx_orders_user_id'
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.user_id, u.name, o.restaurant_id, r.name, o.total_amount, o.status, o.created_at
  FROM orders o
  JOIN users u       ON u.id = o.user_id
  JOIN restaurants r ON r.id = o.restaurant_id
 WHERE o.user_id = :'busy_user'
 ORDER BY o.created_at DESC, o.id DESC
 LIMIT 20 OFFSET 0;

\echo
\echo '=== 3. Browse > Orders filtered by status (GET /api/orders?status=PREPARING)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.user_id, u.name, o.restaurant_id, r.name, o.total_amount, o.status, o.created_at
  FROM orders o
  JOIN users u       ON u.id = o.user_id
  JOIN restaurants r ON r.id = o.restaurant_id
 WHERE o.status = 'PREPARING'
 ORDER BY o.created_at DESC, o.id DESC
 LIMIT 20 OFFSET 0;

\echo
\echo '=== 4. Customer page: the order in progress (GET /api/users/:id). Index: idx_active_user_order (the partial unique index)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.user_id, u.name, o.restaurant_id, r.name, o.total_amount, o.status, o.created_at
  FROM orders o
  JOIN users u       ON u.id = o.user_id
  JOIN restaurants r ON r.id = o.restaurant_id
 WHERE o.user_id = :'active_user' AND o.status = ANY (ARRAY['PREPARING', 'DELIVERING'])
 LIMIT 1;

\echo
\echo '=== 5. Wallet: one customer''s history for a date range, newest first (GET /api/users/:id/audit?from=&to=). Index: idx_wallet_audit_user_time'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, changed_at, action_type, amount_changed, balance_after
  FROM wallet_audit_logs
 WHERE user_id = :'busy_user'
   AND changed_at >= (:'from_day'::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
   AND changed_at <  (:'to_day'::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
 ORDER BY changed_at DESC, seq DESC
 LIMIT 20 OFFSET 0;

\echo
\echo '=== 6. Restaurant page: totals from the materialized view (GET /api/restaurants/:id). Index: idx_restaurant_order_summary_id'
EXPLAIN (ANALYZE, BUFFERS)
SELECT r.id, r.name, r.latitude, r.longitude, s.completed_order_count, s.completed_revenue
  FROM restaurants r
  LEFT JOIN restaurant_order_summary s ON s.restaurant_id = r.id
 WHERE r.id = :'top_restaurant';

\echo
\echo '=== 7. Analytics: one restaurant''s daily revenue and 7-day average (GET /api/analytics/revenue). fn_restaurant_revenue_trend (sql/09), inlined; index: idx_orders_delivered_restaurant_date'
EXPLAIN (ANALYZE, BUFFERS)
SELECT order_date, daily_revenue, seven_day_moving_average
  FROM fn_restaurant_revenue_trend(:'top_restaurant')
 ORDER BY order_date;

\echo
\echo '=== 8. Analytics: DENSE_RANK ranking, page 1 (GET /api/analytics/ranking). fn_restaurant_revenue_ranking (sql/09) reads the 500-row materialized view'
EXPLAIN (ANALYZE, BUFFERS)
SELECT revenue_rank, restaurant_id, restaurant_name, total_revenue
  FROM fn_restaurant_revenue_ranking()
 ORDER BY revenue_rank, restaurant_name, restaurant_id
 LIMIT 20 OFFSET 0;

\echo
\echo '=== 9. Analytics: last refresh time (GET /api/analytics/summary). Index: idx_restaurant_summary_refresh_log_time'
EXPLAIN (ANALYZE, BUFFERS)
SELECT refreshed_at FROM restaurant_summary_refresh_log ORDER BY refreshed_at DESC LIMIT 1;

\echo
\echo '=== 10. The inherited Workflow 2 report query (sql/06_window_analytics.sql), all restaurants, for comparison'
EXPLAIN (ANALYZE, BUFFERS)
WITH daily_revenue AS (
    SELECT restaurant_id, DATE(created_at) AS order_date, SUM(total_amount)::DECIMAL(14,2) AS daily_revenue
      FROM orders
     WHERE status = 'DELIVERED'
     GROUP BY restaurant_id, DATE(created_at)
),
moving_average AS (
    SELECT restaurant_id, order_date, daily_revenue,
           AVG(daily_revenue) OVER (
               PARTITION BY restaurant_id ORDER BY order_date
               RANGE BETWEEN '6 days'::INTERVAL PRECEDING AND CURRENT ROW
           )::DECIMAL(14,2) AS seven_day_moving_average
      FROM daily_revenue
),
restaurant_totals AS (
    SELECT restaurant_id, SUM(daily_revenue)::DECIMAL(14,2) AS total_revenue
      FROM daily_revenue
     GROUP BY restaurant_id
),
ranked_restaurants AS (
    SELECT restaurant_id, total_revenue, DENSE_RANK() OVER (ORDER BY total_revenue DESC) AS revenue_rank
      FROM restaurant_totals
)
SELECT ma.restaurant_id, r.name, ma.order_date, ma.daily_revenue, ma.seven_day_moving_average, rr.total_revenue, rr.revenue_rank
  FROM moving_average ma
  JOIN ranked_restaurants rr ON ma.restaurant_id = rr.restaurant_id
  JOIN restaurants r ON ma.restaurant_id = r.id
 ORDER BY rr.revenue_rank, ma.restaurant_id, ma.order_date;
