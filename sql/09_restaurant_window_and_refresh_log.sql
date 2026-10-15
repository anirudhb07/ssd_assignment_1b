-- =====================================================
-- 09_restaurant_window_and_refresh_log.sql   (issue #10)
--
-- 1. fn_restaurant_revenue_trend(restaurant_id)
--      Per-restaurant daily revenue and 7-day moving average.
--      Uses RANGE over an INTERVAL instead of ROWS 6 PRECEDING:
--      "6 rows back" is not "6 days back" when a restaurant has
--      days with no delivered orders.
--
-- 2. restaurant_summary_refresh_log
--      One row per refresh of restaurant_order_summary, so the
--      Analytics screen can show a "last refreshed" time.
--
-- 3. sp_refresh_restaurant_summary()  (redefined)
--      Same concurrent refresh as in 05, now also writes a log row.
--
-- Safe to run more than once (CREATE OR REPLACE / IF NOT EXISTS).
-- Must run after 05_materialized_views.sql, which the seed script
-- already guarantees by running files in numeric order.
-- =====================================================


-- -----------------------------------------------------
-- Supporting index for the per-restaurant query.
-- Only DELIVERED orders are ever aggregated.
-- -----------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_delivered
ON orders (restaurant_id, created_at)
WHERE status = 'DELIVERED';


-- -----------------------------------------------------
-- 1. Per-restaurant revenue trend
--
-- A view cannot take a parameter, so this is a function.
-- Call it like a table:
--
--   SELECT * FROM fn_restaurant_revenue_trend('<restaurant uuid>');
--
-- seven_day_moving_average is the average of daily_revenue over
-- the days that have delivered orders in the window
-- [order_date - 6 days, order_date]. Days with no orders are not
-- counted as zeros.
--
-- Days are DATE(created_at), the same as sql/06_window_analytics.sql.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION fn_restaurant_revenue_trend(
    p_restaurant_id UUID
)
RETURNS TABLE (
    order_date               DATE,
    order_count              BIGINT,
    daily_revenue            DECIMAL(14,2),
    seven_day_moving_average DECIMAL(14,2)
)
LANGUAGE sql
STABLE
AS $$

    WITH daily AS (

        SELECT
            DATE(o.created_at)
                AS order_date,

            COUNT(*)::BIGINT
                AS order_count,

            SUM(o.total_amount)::DECIMAL(14,2)
                AS daily_revenue

        FROM orders o

        WHERE o.restaurant_id = p_restaurant_id
          AND o.status = 'DELIVERED'

        GROUP BY DATE(o.created_at)
    )

    SELECT
        d.order_date,
        d.order_count,
        d.daily_revenue,

        AVG(d.daily_revenue) OVER (

            ORDER BY d.order_date

            RANGE BETWEEN
                INTERVAL '6 days' PRECEDING
                AND CURRENT ROW

        )::DECIMAL(14,2)
            AS seven_day_moving_average

    FROM daily d

    ORDER BY d.order_date;

$$;


-- -----------------------------------------------------
-- 2. Refresh log
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS restaurant_summary_refresh_log (

    id BIGINT
        GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    refreshed_at TIMESTAMPTZ
        NOT NULL
        DEFAULT clock_timestamp(),

    duration_ms INTEGER
        NOT NULL,

    -- What the view contained right after this refresh.
    restaurant_count BIGINT
        NOT NULL,

    completed_order_count BIGINT
        NOT NULL,

    completed_revenue DECIMAL(14,2)
        NOT NULL
);


CREATE INDEX IF NOT EXISTS idx_restaurant_summary_refresh_log_time
ON restaurant_summary_refresh_log (refreshed_at DESC);


-- -----------------------------------------------------
-- 3. Refresh procedure that logs each run
--
-- The log row is written in the caller's transaction: if the
-- refresh fails, nothing is logged.
-- -----------------------------------------------------

CREATE OR REPLACE PROCEDURE sp_refresh_restaurant_summary()
LANGUAGE plpgsql
AS $$
DECLARE
    v_started TIMESTAMPTZ := clock_timestamp();
BEGIN

    REFRESH MATERIALIZED VIEW CONCURRENTLY
        restaurant_order_summary;


    INSERT INTO restaurant_summary_refresh_log (
        refreshed_at,
        duration_ms,
        restaurant_count,
        completed_order_count,
        completed_revenue
    )

    SELECT
        clock_timestamp(),

        (
            EXTRACT(
                EPOCH FROM clock_timestamp() - v_started
            ) * 1000
        )::INTEGER,

        COUNT(*),

        COALESCE(
            SUM(completed_order_count),
            0
        ),

        COALESCE(
            SUM(completed_revenue),
            0
        )::DECIMAL(14,2)

    FROM restaurant_order_summary;

END;
$$;


-- =====================================================
-- Quick checks (run by hand, not part of the seed)
-- =====================================================
--
-- Trend for the top-earning restaurant:
--
--   SELECT *
--   FROM fn_restaurant_revenue_trend(
--       (SELECT restaurant_id
--        FROM restaurant_order_summary
--        ORDER BY completed_revenue DESC
--        LIMIT 1)
--   )
--   LIMIT 10;
--
-- Refresh and read the log:
--
--   CALL sp_refresh_restaurant_summary();
--
--   SELECT *
--   FROM restaurant_summary_refresh_log
--   ORDER BY refreshed_at DESC
--   LIMIT 5;