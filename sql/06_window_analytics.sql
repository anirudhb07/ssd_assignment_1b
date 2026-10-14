-- Workflow 2: Window function analytics (report query).
-- Uses RANGE BETWEEN '6 days'::INTERVAL PRECEDING AND CURRENT ROW to accurately
-- calculate the true 7-day calendar window moving average across date gaps.
-- (Note: function creation for API routes is handled in setup scripts by issue #10).

WITH daily_revenue AS (
    SELECT
        restaurant_id,
        DATE(created_at) AS order_date,
        SUM(total_amount)::DECIMAL(14,2) AS daily_revenue
    FROM orders
    WHERE status = 'DELIVERED'
    GROUP BY
        restaurant_id,
        DATE(created_at)
),
moving_average AS (
    SELECT
        restaurant_id,
        order_date,
        daily_revenue,
        AVG(daily_revenue) OVER (
            PARTITION BY restaurant_id
            ORDER BY order_date
            RANGE BETWEEN '6 days'::INTERVAL PRECEDING AND CURRENT ROW
        )::DECIMAL(14,2) AS seven_day_moving_average
    FROM daily_revenue
),
restaurant_totals AS (
    SELECT
        restaurant_id,
        SUM(daily_revenue)::DECIMAL(14,2) AS total_revenue
    FROM daily_revenue
    GROUP BY restaurant_id
),
ranked_restaurants AS (
    SELECT
        restaurant_id,
        total_revenue,
        DENSE_RANK() OVER (
            ORDER BY total_revenue DESC
        ) AS revenue_rank
    FROM restaurant_totals
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
