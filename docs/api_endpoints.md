# API Endpoints

The contract between `web/` and `api/`. Agree changes here first, then change the code.

- Base URL: `http://localhost:4000/api` (the web app calls `/api/...` and Vite forwards it).
- Request and response bodies are JSON. Money is in rupees as a number (`640.5`), timestamps are ISO 8601 strings.
- **Status:** `REAL` means it queries the database. `MOCK` means it returns sample data in the final shape and sets the response header `X-Mock: true`. When you make a route real, update its status here.

## Conventions

**Lists** accept `?page=` (default 1) and `?pageSize=` (default 20, max 100) and return:

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
| `GET /users` | MOCK | `users` | Browse, actor switcher |
| `GET /users/:id` | MOCK | `users`, `orders` | Browse detail |
| `GET /users/:id/audit` | MOCK | `wallet_audit_logs` | Wallet |
| `POST /users/:id/topup` | MOCK | `sp_wallet_topup` (to add) | Checkout |
| `GET /restaurants` | REAL | `restaurants` | Browse, actor switcher |
| `GET /restaurants/:id` | MOCK | `restaurants`, `restaurant_order_summary` | Browse detail |
| `GET /restaurants/:id/menu` | MOCK | Mongo `Menus` | Checkout, Reviews |
| `GET /orders` | MOCK | `orders` | Browse |
| `GET /orders/:id` | MOCK | `orders` | Browse detail |
| `POST /orders/:id/advance` | MOCK | `sp_advance_order_status` (to add) | Browse detail |
| `POST /checkout` | MOCK | `sp_execute_checkout` | Checkout |
| `GET /analytics/revenue` | MOCK | Window query, `sql/06` | Analytics |
| `GET /analytics/ranking` | MOCK | Window query, `DENSE_RANK()` | Analytics |
| `GET /analytics/summary` | MOCK | `restaurant_order_summary` + refresh log | Analytics |
| `POST /analytics/summary/refresh` | MOCK | `sp_refresh_restaurant_summary` | Analytics |
| `GET /drivers/nearby` | MOCK | Mongo `$geoNear`, `mongo/02` | Map |
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
`from` and `to` are dates (`2026-10-01`), both optional. Newest first.
Item: `{ "id", "changedAt", "actionType": "DEBIT" | "CREDIT", "amountChanged", "balanceAfter" }`

### `POST /users/:id/topup`
Body: `{ "amount": 1000 }`
`200 { "walletBalance", "auditEntry": AuditEntry }`

### `GET /restaurants?search=&page=&pageSize=`
Item: `{ "id", "name", "latitude", "longitude" }`, sorted by name.

### `GET /restaurants/:id`
`{ "id", "name", "latitude", "longitude", "summary": { "completedOrderCount", "completedRevenue" } }`

### `GET /restaurants/:id/menu`
The Mongo `Menus` document:
`{ "restaurantId", "restaurantName", "updatedAt", "categories": [ { "name", "items": [ { "name", "description"?, "price", "available", "customizationAddOns": [ { "name", "price" } ] } ] } ] }`
`404` if the restaurant has no menu.

### Order object
`{ "id", "userId", "userName", "restaurantId", "restaurantName", "totalAmount", "status": "PREPARING" | "DELIVERING" | "DELIVERED", "createdAt" }`

### `GET /orders?userId=&restaurantId=&status=&page=&pageSize=`
All filters optional. Newest first. Item: Order.

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

While mocked: `amount > 5000` returns 402, and `?simulate=active-order` returns 409.

### `GET /analytics/revenue?restaurantId=`
`{ "restaurantId", "restaurantName", "points": [ { "date": "2026-09-12", "dailyRevenue", "movingAvg7d" } ] }`, oldest first.

### `GET /analytics/ranking?page=&pageSize=`
Item: `{ "rank", "restaurantId", "restaurantName", "totalRevenue" }`, best first. Ties share a rank (`DENSE_RANK`).

### `GET /analytics/summary` and `POST /analytics/summary/refresh`
```json
{
  "lastRefreshedAt": "2026-10-12T04:20:00Z",
  "totals": { "restaurants": 500, "completedOrders": 110965, "completedRevenue": 144501230 },
  "topRestaurants": [ { "restaurantId", "restaurantName", "completedOrderCount", "completedRevenue" } ]
}
```
`POST .../refresh` runs `CALL sp_refresh_restaurant_summary()` and returns the same shape.

### `GET /drivers/nearby?lat=&lng=&radius=5000`
`lat`, `lng` required. `radius` in metres, default 5000.
`{ "origin": { "lat", "lng" }, "radiusMeters", "drivers": [ { "driverId", "lat", "lng", "distanceMeters", "lastSeenAt" } ] }`, nearest first, one entry per driver.

### `GET /reviews/stats?restaurantId=`
`restaurantId` optional (all reviews when omitted).
`{ "restaurantId", "averageRating", "totalReviews", "ratingDistribution": [ { "rating": 1, "count" }, ...5 ], "topTags": [ { "tag", "count" } ] }`
