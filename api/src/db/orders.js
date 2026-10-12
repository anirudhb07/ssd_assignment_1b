// The columns every order response uses (see "Order object" in
// docs/api_endpoints.md), shared by the orders and users routes.
// Append WHERE / ORDER BY / LIMIT after it.
export const ORDER_SELECT = `
  SELECT o.id,
         o.user_id       AS "userId",
         u.name          AS "userName",
         o.restaurant_id AS "restaurantId",
         r.name          AS "restaurantName",
         o.total_amount  AS "totalAmount",
         o.status,
         o.created_at    AS "createdAt"
    FROM orders o
    JOIN users u       ON u.id = o.user_id
    JOIN restaurants r ON r.id = o.restaurant_id`;

// Orders that count as "in progress" for the partial unique index
// idx_active_user_order (sql/02_indexes.sql).
export const ACTIVE_STATUSES = ['PREPARING', 'DELIVERING'];
export const ORDER_STATUSES = ['PREPARING', 'DELIVERING', 'DELIVERED'];
