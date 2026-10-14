-- Member D (Issue #11 / DB fix 1 & 5 helpers).
-- Defines fn_restaurant_window_analytics() which parameterises the window analytics
-- query by optional restaurant_id and uses RANGE INTERVAL '6 days' for accurate 7-day windows.

CREATE OR REPLACE FUNCTION fn_restaurant_window_analytics(p_restaurant_id UUID DEFAULT NULL)
RETURNS TABLE (
    restaurant_id UUID,
    restaurant_name VARCHAR,
    order_date DATE,
    daily_revenue DECIMAL(14,2),
    seven_day_moving_average DECIMAL(14,2),
    total_revenue DECIMAL(14,2),
    revenue_rank BIGINT
)
LANGUAGE sql
AS $$
    WITH daily_revenue AS (
        SELECT
            o.restaurant_id,
            DATE(o.created_at) AS order_date,
            SUM(o.total_amount)::DECIMAL(14,2) AS daily_revenue
        FROM orders o
        WHERE o.status = 'DELIVERED'
          AND (p_restaurant_id IS NULL OR o.restaurant_id = p_restaurant_id)
        GROUP BY
            o.restaurant_id,
            DATE(o.created_at)
    ),
    moving_average AS (
        SELECT
            dr.restaurant_id,
            dr.order_date,
            dr.daily_revenue,
            AVG(dr.daily_revenue) OVER (
                PARTITION BY dr.restaurant_id
                ORDER BY dr.order_date
                RANGE BETWEEN '6 days'::INTERVAL PRECEDING AND CURRENT ROW
            )::DECIMAL(14,2) AS seven_day_moving_average
        FROM daily_revenue dr
    ),
    restaurant_totals AS (
        SELECT
            dr.restaurant_id,
            SUM(dr.daily_revenue)::DECIMAL(14,2) AS total_revenue
        FROM daily_revenue dr
        GROUP BY dr.restaurant_id
    ),
    ranked_restaurants AS (
        SELECT
            rt.restaurant_id,
            rt.total_revenue,
            DENSE_RANK() OVER (
                ORDER BY rt.total_revenue DESC
            ) AS revenue_rank
        FROM restaurant_totals rt
    )
    SELECT
        ma.restaurant_id,
        r.name AS restaurant_name,
        ma.order_date,
        ma.daily_revenue,
        ma.seven_day_moving_average,
        rr.total_revenue,
        rr.revenue_rank
    FROM moving_average ma
    JOIN ranked_restaurants rr ON ma.restaurant_id = rr.restaurant_id
    JOIN restaurants r ON ma.restaurant_id = r.id
    ORDER BY
        rr.revenue_rank,
        ma.restaurant_id,
        ma.order_date;
$$;
