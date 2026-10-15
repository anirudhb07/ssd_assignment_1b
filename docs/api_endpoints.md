# API Endpoints

The contract between `web/` and `api/`. Agree changes here first, then change the code.

- Base URL: `http://localhost:4000/api` (the web app calls `/api/...` and Vite forwards it).
- Request and response bodies are JSON. Money is in rupees as a number (`640.5`), timestamps are ISO 8601 strings.
- **Status:** every route is `REAL`: it queries the databases. (During development, unfinished routes returned sample data marked `MOCK`; none are left.)

## Conventions

**Lists** accept `?page=` (default 1) and `?pageSize=` (default 20, max 100) and return (a `search` matches names literally, including `%` and `_`):

```json
{ "items": [ ... ], "page": 1, "pageSize": 20, "total": 120000 }
```

**Errors** always look like this, and `message` is written for the person using the app:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Not enough money in the wallet. ..." } }
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `INVALID_AMOUNT` | Missing or invalid input |
| 402 | `INSUFFICIENT_BALANCE` | `sp_execute_checkout` raised "Insufficient balance" |
| 404 | `NOT_FOUND` | Record or route doesn't exist |
| 409 | `ACTIVE_ORDER_EXISTS` | Partial unique index `idx_active_user_order` blocked a second active order |
| 409 | `INVALID_TRANSITION` | Advancing an order that is already `DELIVERED` |
| 500 | `INTERNAL` | Anything unexpected (details are in the API logs) |

The mapping from PostgreSQL errors lives in `api/src/lib/errors.js`.

## Endpoints

| Method & path | Status | Backed by | Screen |
| --- | --- | --- | --- |
| `GET /health` | REAL | `SELECT 1`, Mongo `ping` | Home |
| `GET /users` | REAL | `users` | Browse, actor switcher |
| `GET /users/:id` | REAL | `users`, `orders` | Browse detail |
| `GET /users/:id/audit` | REAL | `wallet_audit_logs` | Wallet |
| `POST /users/:id/topup` | REAL | `sp_wallet_topup` | Checkout |
| `GET /restaurants` | REAL | `restaurants` | Browse, actor switcher |
| `GET /restaurants/:id` | REAL | `restaurants`, `restaurant_order_summary` | Browse detail |
| `GET /restaurants/:id/menu` | REAL | Mongo `Menus` | Checkout, Reviews |
| `GET /orders` | REAL | `orders` | Browse |
| `GET /orders/:id` | REAL | `orders` | Browse detail |
| `POST /orders/:id/advance` | REAL | `sp_advance_order_status` | Browse detail |
| `POST /checkout` | REAL | `sp_execute_checkout` | Checkout |
| `GET /analytics/revenue` | REAL | `fn_restaurant_revenue_trend` (`sql/09`) | Analytics |
| `GET /analytics/ranking` | REAL | `fn_restaurant_revenue_ranking` (`sql/09`, `DENSE_RANK()`) | Analytics |
| `GET /analytics/summary` | REAL | `restaurant_order_summary` + `restaurant_summary_refresh_log` (`sql/09`) | Analytics |
| `POST /analytics/summary/refresh` | REAL | `sp_refresh_restaurant_summary` (`sql/09`) | Analytics |
| `GET /drivers/nearby` | REAL | Mongo `$geoNear`, `mongo/02` | Map |
| `GET /reviews/stats` | REAL | Mongo `$facet`, `mongo/03` | Reviews |

## Details

### `GET /health`
`200 { "status": "ok", "postgres": true, "mongo": true }`, or `503` with `"status": "degraded"` if a database is unreachable.

### `GET /users?search=&page=&pageSize=`
Search matches the name, case-insensitive.
Item: `{ "id", "name", "walletBalance" }`

### `GET /users/:id`
`{ "id", "name", "walletBalance", "activeOrder": Order | null }`. `activeOrder` is the order in `PREPARING` or `DELIVERING`, if there is one.

### `GET /users/:id/audit?from=&to=&page=&pageSize=`
`from` and `to` are dates (`2026-10-01`), both optional and both included (`to=2026-10-12` covers that whole day). They are Indian calendar days (`Asia/Kolkata`), the same days the app shows. Newest first (`changed_at`, then `seq`, both descending).
Item: `{ "id", "changedAt", "actionType": "DEBIT" | "CREDIT", "amountChanged", "balanceAfter" }`
`400 BAD_REQUEST` if a date isn't a real `YYYY-MM-DD` date or `from` is after `to`; `404` if the customer doesn't exist; an empty list if the range has no entries.
The response also has `totalCredits` and `totalDebits`: the sums over every row that matches the dates, not just this page.

### `POST /users/:id/topup`
Body: `{ "amount": 1000 }`
`200 { "walletBalance", "auditEntry": AuditEntry }`

### `GET /restaurants?search=&page=&pageSize=`
Item: `{ "id", "name", "latitude", "longitude", "completedOrderCount", "completedRevenue" }`, sorted by name. The two totals come from `restaurant_order_summary` (0 for a restaurant not in it yet), so they are as fresh as its last refresh.

### `GET /restaurants/:id`
`{ "id", "name", "latitude", "longitude", "summary": { "completedOrderCount", "completedRevenue" } }`

### `GET /restaurants/:id/menu`
The Mongo `Menus` document:
`{ "restaurantId", "restaurantName", "updatedAt", "categories": [ { "name", "items": [ { "name", "description"?, "price", "available", "customizationAddOns": [ { "name", "price" } ] } ] } ] }`
`404` if the restaurant has no menu.

### Order object
`{ "id", "userId", "userName", "restaurantId", "restaurantName", "totalAmount", "status": "PREPARING" | "DELIVERING" | "DELIVERED", "createdAt" }`

### `GET /orders?userId=&restaurantId=&status=&page=&pageSize=`
All filters optional; they combine with AND. `status` is case-insensitive; any other value returns 400 `BAD_REQUEST`. Newest first (`created_at`, then `id`, both descending). Item: Order.

### `GET /orders/:id`
Order.

### `POST /orders/:id/advance`
Moves `PREPARING → DELIVERING → DELIVERED`. Returns the updated Order. `409 INVALID_TRANSITION` if it is already `DELIVERED`.

### `POST /checkout`
Body: `{ "userId", "restaurantId", "amount", "items"?: [ { "name", "price", "quantity", "addOns"?: [ ... ] } ] }`
`items` is only for display; the procedure charges `amount`.

`201`:
```json
{
  "order": { "...": "Order" },
  "balanceBefore": 4250,
  "balanceAfter": 3610,
  "auditEntry": { "id": "...", "changedAt": "...", "actionType": "DEBIT", "amountChanged": 640, "balanceAfter": 3610 }
}
```
Errors: `402 INSUFFICIENT_BALANCE`, `409 ACTIVE_ORDER_EXISTS`, `404 NOT_FOUND`, `400 INVALID_AMOUNT`.

Checkout and top-up amounts must be positive JSON numbers with at most two decimal places, up to 99999999.99. Invalid amounts (including a top-up that exceeds wallet capacity) return `400 INVALID_AMOUNT`; malformed or missing IDs return `400 BAD_REQUEST`, and unknown IDs return `404 NOT_FOUND`. Both wallet routes return the audit entry created by that request. Checkout, top-up, and advancement run in transactions; failed requests leave balances, orders, and audit rows unchanged.

### `GET /analytics/revenue?restaurantId=`
`{ "restaurantId", "restaurantName", "points": [ { "date": "2026-09-12", "dailyRevenue", "movingAvg7d" } ] }`, oldest first.
`restaurantId` is optional; without it, the top-ranked restaurant is used. `movingAvg7d` is the average of `dailyRevenue` over the days that have delivered orders in the 7 days up to and including that date (days with no orders are not counted as zeros). Dates are `DATE(created_at)`, as in `sql/06`.
`400 BAD_REQUEST` if `restaurantId` isn't a valid ID; `404 NOT_FOUND` if the restaurant doesn't exist.

### `GET /analytics/ranking?page=&pageSize=`
Item: `{ "rank", "restaurantId", "restaurantName", "totalRevenue" }`, best first. Ties share a rank (`DENSE_RANK`). Restaurants with no delivered orders are left out. Revenue comes from `restaurant_order_summary`, so it is as fresh as the last refresh.

### `GET /analytics/summary` and `POST /analytics/summary/refresh`
```json
{
  "lastRefreshedAt": "2026-10-12T04:20:00Z",
  "totals": { "restaurants": 500, "completedOrders": 110965, "completedRevenue": 144501230 },
  "topRestaurants": [ { "restaurantId", "restaurantName", "completedOrderCount", "completedRevenue" } ]
}
```
`lastRefreshedAt` is `null` until the first refresh through `sp_refresh_restaurant_summary()` is logged (the seeder's own refresh isn't). `topRestaurants` lists the top 5 by revenue.
`POST .../refresh` runs `CALL sp_refresh_restaurant_summary()` and returns the same shape.

### `GET /drivers/nearby?lat=&lng=&radius=5000`
`lat`, `lng` required. `radius` in metres, default 5000, at most 50000 (400 otherwise).
`{ "origin": { "lat", "lng" }, "radiusMeters", "drivers": [ { "driverId", "lat", "lng", "distanceMeters", "lastSeenAt" } ] }`, nearest first, one entry per driver.

### `GET /reviews/stats?restaurantId=`
`restaurantId` optional (all reviews when omitted).
`{ "restaurantId", "averageRating", "totalReviews", "ratingDistribution": [ { "rating": 1, "count" }, ...5 ], "topTags": [ { "tag", "count" } ] }`