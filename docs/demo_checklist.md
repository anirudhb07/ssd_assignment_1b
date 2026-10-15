# BiteStream: four-workflow demo checklist (#26)

Run from the repository root on the integrated demo branch. Checkout, Analytics,
Map, Reviews and menus use real APIs and databases. Record PASS / FAILED / NOT RUN
for each step and retain HTTP responses, SQL output or screenshots. An `X-Mock`
header is a failed integration check. Results belong in [demo_results.md](demo_results.md),
not in a second, contradictory checklist.

## 1. Scope and coverage

| Workflow | Screen and API | Database evidence |
| --- | --- | --- |
| Checkout | Checkout, Wallet and Order Detail; checkout/top-up/advance routes | Orders, wallet audit trigger, partial unique active-order index |
| Analytics | Revenue trend, ranking, summary and Refresh | SQL 09 revenue functions, materialized view and refresh log |
| Map | Restaurant origin, nearby drivers and automatic polling | Latest fresh active pings, `$geoNear`, geospatial and TTL indexes |
| Reviews/menu | Ratings, sentiment tags and restaurant menu | Mongo Reviews aggregations and Menus linked to PostgreSQL restaurant IDs |

Checkout component tests mock API helpers to cover 201, 402, 409, recovery,
add-ons, integer-paise totals, pending controls, returned audit data, cache
invalidation and navigation. Database correctness is checked separately by API
tests and `api/scripts/demo-check.mjs`. The runner does not replace browser checks.

## 2. Safe fresh seed and live simulator

Docker Engine/Desktop and Compose v2 are required. No host database installation
is needed. `docs/demo.env` uses alternate ports 25432, 47017, 14000 and 15173.
Choose a new disposable project name if the example below already contains data.

PowerShell:

```powershell
function dc { docker compose --env-file docs/demo.env -p bitestream-issue48-review @args }
```

Bash/zsh (macOS, Linux, WSL):

```bash
dc() { docker compose --env-file docs/demo.env -p bitestream-issue48-review "$@"; }
```

- [ ] Record `git status`, branch and `git rev-parse HEAD`.
- [ ] Inspect `dc config`, `dc ps -a` and
  `docker volume ls --filter label=com.docker.compose.project=bitestream-issue48-review`.
  Confirm project-specific volumes and alternate ports; shell environment variables
  can override `demo.env`. Do not reset the ordinary `bitestream` project.
- [ ] Read `docker/seed/seed.sh`: `RESET=1` drops the databases inside the selected
  project's containers. Run the following sequentially, stopping on errors:

```text
dc up -d postgres mongo
dc run --rm -e RESET=1 seed
dc up -d --no-deps api web ping-simulator
dc logs --tail 30 api web ping-simulator
dc ps -a
```

The seed applies SQL (including SQL 09 and the #66 demo-customer fixtures), Mongo
indexes, and the linked restaurant/menu/review datasets. `--no-deps` avoids running
seed again. Keep ping-simulator running for fresh Map results.

- [ ] Open http://localhost:15173. Health at http://localhost:14000/api/health
  must confirm PostgreSQL and MongoDB connectivity.
- [ ] Record actual counts; fixtures add demo records and the simulator adds pings:

```text
dc exec -T postgres psql -X -U postgres -d bitestream -c "SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM restaurants) restaurants,(SELECT count(*) FROM orders) orders,(SELECT count(*) FROM wallet_audit_logs) audits;"
dc exec -T mongo mongosh bitestream --quiet --eval "printjson({menus:db.Menus.countDocuments(),reviews:db.Reviews.countDocuments(),pings:db.DriverPings.countDocuments()})"
```

## 3. Automated verification

Run before the manual demo and record actual totals instead of copying historical
counts. All database tests and the runner must target the disposable project.

```text
dc exec -T web npm test -- src/pages/CheckoutPage.test.jsx
dc exec -T web npm test
dc exec -T web npm run build
dc exec -T api npm test
dc exec -T -e DEMO_DISPOSABLE=1 api node scripts/demo-check.mjs
git diff --check
```

On resource-constrained machines, `npm test -- --maxWorkers=2` limits frontend
parallelism without changing assertions. Retain the runner's JSON: checkout,
concurrency, top-up, analytics, reviews/menu and Map must report PASS, with no mock
headers. Assertions stop execution on failures. An empty driver list can be a valid
query result; the live movement demonstration still requires fresh simulator pings.

The runner creates real orders/audits and refreshes the summary. It chooses eligible
seed customers each time. Before the browser scenarios, reset only the three demo
customers in this disposable database:

```text
dc exec -T postgres psql -X -U postgres -d bitestream -v ON_ERROR_STOP=1 -c "CALL sp_reset_demo_customers();"
```

## 4. Checkout, wallet and Order Detail

Use the named customers from #66. Explicitly select the intended actor in the
header; do not assume typing a search selects the payer.

| Scenario | Customer | Fresh fixture state |
| --- | --- | --- |
| 201 | Demo - plenty of money | At least ₹5,000, no active order |
| 402 | Demo - low balance | ₹45, no active order |
| 409 | Demo - order in progress | Existing active order |

Fixture IDs end in `d001`, `d002` and `d003` respectively. Record the actual IDs,
balances and active order before each scenario. Reset fixtures between repeated demos.

### Success (201)

- [ ] Select **Demo - plenty of money**, then a restaurant with a real menu.
  Confirm `GET /api/restaurants/:id/menu` has no `X-Mock` header.
- [ ] Build a cart from the actual available items and prices. Exercise quantity
  and add-ons where offered. Compute the total in integer paise; keep it within
  the displayed wallet balance. Use the displayed menu prices for the expected total.
- [ ] Place order: exactly one POST, HTTP 201, PREPARING, returned order ID and
  audit ID, balance reduced by the cart total. Pending controls prevent duplicates.
- [ ] View order opens `/browse/orders/:id`; customer, restaurant, amount and status
  match. Wallet shows one DEBIT with the returned ID and resulting balance.

### Insufficient balance (402), top-up and retry

- [ ] Select **Demo - low balance** and a cart exceeding ₹45. Record balance,
  order count and audit count. Payment returns 402 `INSUFFICIENT_BALANCE`; all
  three values remain unchanged, with no false success confirmation.
- [ ] Top up enough to cover the cart. Invalid zero/negative/three-decimal amounts
  cannot be submitted. A successful top-up returns one CREDIT and the correct
  balance; the cart remains and checkout does not retry automatically.
- [ ] Explicitly retry payment. Expect 201, one new order and one DEBIT. Wallet
  history immediately includes both CREDIT and DEBIT, even if previously cached.

### Active-order conflict (409) and delivery

- [ ] Select **Demo - order in progress**. Choose a cart within its current balance
  (top up if necessary so insufficient funds does not mask this scenario).
- [ ] Payment returns 409 `ACTIVE_ORDER_EXISTS`. The active-order link opens the
  existing order; balance, order count and audit count remain unchanged.
- [ ] Advance PREPARING → DELIVERING → DELIVERED, waiting for each refetch. A rapid
  double-click must send one request, not skip a step. Delivery removes the button
  and frees the customer for another checkout without changing its wallet.
- [ ] Checkout again: expect 201 with a new order ID and exactly one new DEBIT.

### Database invariant and error handling

Open `dc exec postgres psql -X -U postgres -d bitestream` and substitute real IDs:

```sql
\set uid 'PASTE_CUSTOMER_UUID'
\set rid 'PASTE_RESTAURANT_UUID'
SELECT wallet_balance FROM users WHERE id=:'uid';
SELECT count(*) AS orders, count(*) FILTER (WHERE status IN ('PREPARING','DELIVERING')) AS active FROM orders WHERE user_id=:'uid';
SELECT id,action_type,amount_changed,balance_after FROM wallet_audit_logs WHERE user_id=:'uid' ORDER BY seq DESC LIMIT 5;
SELECT indexdef FROM pg_indexes WHERE indexname='idx_active_user_order';
```

- [ ] With an active order, execute `BEGIN;`, then the following insert, then
  `ROLLBACK;` as separate statements. Expect SQLSTATE 23505 on the named partial
  unique index. Always roll back the deliberate error.

```sql
INSERT INTO orders(id,user_id,restaurant_id,total_amount,status)
VALUES(gen_random_uuid(),:'uid',:'rid',1,'PREPARING');
```

- [ ] The automated runner observes five simultaneous lock-waiting checkouts:
  one 201, four 409s, one order and one debit.
- [ ] Advance an already delivered order: 409 `INVALID_TRANSITION`, refreshed
  Delivered state. Check detail 404, API-down/retry and phone-width usability.

## 5. Analytics

- [ ] Open `/analytics`; verify real summary cards, revenue trend, seven-day
  moving average, ranking and refresh timestamp. All analytics responses lack `X-Mock`.
- [ ] Explicitly select a restaurant; compare its trend to
  `SELECT * FROM fn_restaurant_revenue_trend('<restaurant UUID>');`.
  SQL 09 uses a six-day lookback plus the current date; its average includes
  days with delivered orders in that window, not zero-filled missing days.
- [ ] Compare ranking/pagination to `SELECT * FROM fn_restaurant_revenue_ranking();`.
  Equal revenue totals share a DENSE_RANK. Summary/ranking use the materialized view.
- [ ] Deliver an order, click **Refresh**, and confirm the summary/ranking and
  last-refreshed timestamp update. Compare materialized-view totals to delivered
  orders; `restaurant_summary_refresh_log` records the refresh.
- [ ] Exercise restaurant changes, empty results and API-error/retry behavior.

```sql
SELECT sum(completed_order_count),sum(completed_revenue) FROM restaurant_order_summary;
SELECT count(*),sum(total_amount) FROM orders WHERE status='DELIVERED';
SELECT * FROM restaurant_summary_refresh_log ORDER BY refreshed_at DESC LIMIT 1;
```

## 6. Map and nearby drivers

- [ ] Confirm `dc logs --tail 20 ping-simulator` shows ongoing writes. Open `/map`.
- [ ] Filter/select an origin restaurant. Verify the restaurant marker, 5 km circle,
  driver markers, sorted nearby-driver list and distance/last-updated statistics.
  The screen uses a fixed 5 km radius; there is no radius control.
- [ ] Observe updates across successive five-second polls and use Refresh. Change
  origin restaurant and confirm the map recenters. Polling must not reset manual pan/zoom.
- [ ] Inspect `GET /api/drivers/nearby?lat=...&lng=...&radius=5000`: HTTP 200, no mock
  header, unique driver IDs, ascending distances within 5 km. Only each driver's
  latest fresh active ping qualifies; the API freshness window is ten minutes.
- [ ] Verify the DriverPings 2dsphere index and 7200-second TTL index. TTL cleanup
  is asynchronous and is distinct from the API's freshness filter.
- [ ] Exercise no-drivers and API-error/retry states and phone layout. Do not
  infer a broken map merely from an empty result; inspect simulator freshness.

```text
dc exec -T mongo mongosh bitestream --quiet --eval "printjson(db.DriverPings.getIndexes())"
```

## 7. Reviews and menu

- [ ] Open `/reviews`. Verify average rating, review count, rating distribution
  and top sentiment tags, initially across all restaurants.
- [ ] Explicitly select a restaurant. Verify charts and menu match that restaurant;
  both stats and menu endpoints return real data without `X-Mock`.
- [ ] Compare total/average, five rating buckets and tag counts to Mongo Reviews
  documents for the same PostgreSQL restaurant UUID. The runner independently
  computes these values and checks a linked Mongo Menus document.
- [ ] Inspect real categories, items, availability, prices and add-ons. Compare the
  same restaurant in Checkout; do not assume a fixed mock menu.
- [ ] Exercise no reviews, missing menu, loading and error/retry states. A missing
  menu is an explicit empty/not-found state, not a fabricated fallback menu.

## 8. Consistency, evidence and teardown

- [ ] Zero customers have more than one active order. Current wallet balances
  equal the most recent audit balances. The runner asserts both invariants.
- [ ] Record tested commit, date, project, exact suite totals, build outcome and
  JSON check statuses in `demo_results.md`. Distinguish automated checks from
  manual browser steps; leave unperformed steps NOT RUN.
- [ ] Record any failure with its actual response/output rather than an obsolete
  dependency label. All four workflows are implemented; no pending Map/menu/UI
  merge is part of this checklist.
- [ ] Stop the disposable environment when done: `dc down` preserves evidence
  volumes. Only use `dc down -v` when you deliberately want to discard this
  project's databases. Never run teardown against the ordinary project.

PR wording: **Closes #26**. Keep the body about the final test/checklist changes;
put dated execution totals in the results document instead of the PR body.
