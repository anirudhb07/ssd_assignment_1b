# BiteStream: four-workflow demo checklist (#26)

Run from the repository root. This is an execution checklist, not a claim that
every feature is finished. Baseline inspected: `a8f8700` (Order Detail #45 merged).
Use **PASS / FAILED / BLOCKED / NOT RUN** for execution results and attach observed
HTTP status, response, SQL output or screenshot. `X-Mock: true` is **MOCKED**,
never evidence of a database-backed workflow. Dated results are at the end.

## 1. Scope, dependencies and coverage matrix

| Workflow | Current implementation | Database objects / endpoints |
| --- | --- | --- |
| 1 Checkout | Real Checkout, Wallet, Customer and Order Detail; menu still mocked | `POST /api/checkout`, `POST /api/users/:id/topup`, `GET /api/users/:id/audit`, `GET /api/orders/:id`, `POST /api/orders/:id/advance`; `sp_execute_checkout`, `sp_wallet_topup`, `sp_advance_order_status`, `fn_wallet_audit`, `wallet_audit_logs` |
| 2 Analytics | `AnalyticsPage.jsx` placeholder; all four analytics routes mocked | `GET /api/analytics/revenue?restaurantId=`, `/ranking`, `/summary`, `POST /summary/refresh`; `restaurant_order_summary`, `sp_refresh_restaurant_summary`, SQL 06 window query |
| 3 Map | `MapPage.jsx` placeholder; nearby API mocked | `GET /api/drivers/nearby?lat=&lng=&radius=`; `DriverPings`, `idx_driver_location_2dsphere`, `idx_driver_createdAt_ttl`, Mongo 02 `$geoNear` |
| 4 Reviews/menu | `ReviewsPage.jsx` placeholder; reviews statistics real; menu mocked | `GET /api/reviews/stats?restaurantId=`, `GET /api/restaurants/:id/menu`; `Reviews`, `Menus`, `$facet`, `$unwind` |

Restaurant/customer details from #39, Wallet #40, Checkout #41 and Order Detail
#45 are present. Remaining dependencies are Member C's analytics/reviews UI and
real analytics/menu routes, Member D's map UI/real nearby route, and the seed ID
linkage fix tracked by #5 (PostgreSQL restaurants must match Mongo restaurant IDs).
Do not change those implementations to make this demo appear to pass.

**Later dependency audit:** local `main` is now `549a361`, which includes merged
Map PR #44. The tested #26 branch remains at `a8f8700`; no automatic merge was
performed. Map's simulator, real route and UI exist on main and are
**IMPLEMENTED, UNVERIFIED** by this run, rather than unfinished team work. See the
matrix and source-access limitations in [demo_results.md](demo_results.md).

### Checkout Testing Library coverage

All tests below mock API functions from `web/src/api/endpoints.js`, not production
code. Existing suites were retained; assertions were strengthened and recovery
cases were added. API mocks cannot prove a database wasn't debited: use section 4.

| Required behavior | Existing test / verification | #26 work |
| --- | --- | --- |
| Acting as customer; missing customer; switching actor | `requires an Acting as customer`; `does not show the previous customer’s late payment result after switching actors`; test setup uses the real ActorProvider | Retained |
| Restaurant choice, menu, add-ons, total | `loads real restaurant choices...`; `loads the selected menu...`; `adds/removes items...` | Added checkout payload assertion for ₹280 including Extra Cheese |
| Integer paise / `0.1 + 0.2` | `sends 0.3 for 0.1 + 0.2...`; all 19 `lib/checkout.test.js` cases | Retained |
| Returned ID, before/after balance, DEBIT, PREPARING | `sends 0.3...` | Added explicit Preparing assertion |
| Pending, duplicates, cache invalidation, View order | `blocks duplicate submissions...`; `sends 0.3...` opens real DetailPage | Retained |
| 402 message, top-up action and validation | `handles the former >5000 mock scenario...`; helper validation tests | Retained |
| Top-up balance, stale error removed, cart retained | Same 402 case | Added balance and preserved Meal/subtotal assertions; existing stale-error assertion retained |
| No automatic retry; manual retry; user/audit invalidation | Same 402 case | Retained |
| 409 real active ID and message, no false success/debit | `handles the former active-order simulation...` opens real DetailPage | Added absent confirmation, DEBIT and View order assertions; retry button enabled |
| Recoverable 409 | `recovers from an active-order conflict by manually retrying the preserved cart` | New test; same payload, explicit retry, old error/link removed |
| Active order absent / customer lookup fails | `keeps the conflict recoverable...`; `shows a customer lookup error...` | New cases; no fabricated link, proper retry/disabled state |
| Quantity, unavailable items, customer switching, top-up failures | Remaining Checkout and helper tests | Retained |
| Order progression, refetch lock, late response, stale conflict | 12 `OrderDetail.test.jsx` tests | Unchanged |

## 2. Safe fresh seed (required)

Prerequisites: Docker Engine/Desktop running, Compose v2, free ports 25432,
47017, 14000 and 15173. No local PostgreSQL, MongoDB or Node installation required.
`docs/demo.env` supplies full default seed sizes and alternate ports, not secrets.

Use a **new project name** for each disposable run. The name below was used for
this run; on another machine use a new name if it already exists. Define `dc`
once in your shell, then all following `dc` commands are identical on both OSes.

PowerShell:

```powershell
function dc { docker compose --env-file docs/demo.env -p bitestream-issue26-20261015 @args }
```

Bash/zsh (macOS, Linux, WSL):

```bash
dc() { docker compose --env-file docs/demo.env -p bitestream-issue26-20261015 "$@"; }
```

- [ ] **Safety gate — result: ____** Run `git status`, `git branch --show-current`,
  `git log -8 --oneline`, `docker compose ps`, `docker compose config`, `dc ps -a`,
  `dc config`, and `docker volume ls --filter label=com.docker.compose.project=bitestream-issue26-20261015`.
  Expected: new demo project has no old containers/volumes; resolved published ports
  match `demo.env`; volumes/network carry the demo prefix. Shell environment values
  override env files: resolve any mismatch before proceeding. Never run the reset
  against the ordinary `bitestream` project. If existing demo volumes contain
  valuable/unknown data, choose a new name or get their owner's confirmation.
- [ ] **Reset scope — result: ____** Read `docker/seed/seed.sh`. `RESET=1` drops
  the PostgreSQL `public` schema and MongoDB `bitestream` database **inside this
  project's containers**. Numbered SQL is applied (06 excluded), then collections,
  indexes and seeders. Both database services use independent project volumes.
- [ ] **Execute seed — result: ____** Run these commands one at a time; stop on
  any nonzero exit code. Keep the terminal output as evidence.

```text
dc up -d postgres mongo
dc run --rm -e RESET=1 seed
dc up -d --no-deps api web
dc logs --tail 30 api web
dc ps -a
```

Expected seed ending: `==> Done. PostgreSQL and MongoDB are ready.` Defaults:
10,000 users, 500 restaurants, 120,000 orders, 130,000 audits, 500 menus and
10,000 reviews. 500,000 pings are generated, but their ages span three hours;
TTL deletion means retained ping counts can already be lower at seed completion.
`--no-deps` avoids reapplying setup after the one-shot seed. Wait for API and Vite
ready messages. Open <http://localhost:15173>; API is <http://localhost:14000/api>.

- [ ] **Health/counts — result: ____** Home must report both databases connected.
  Execute:

```text
dc exec -T postgres psql -X -U postgres -d bitestream -c "SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM restaurants) restaurants,(SELECT count(*) FROM orders) orders,(SELECT count(*) FROM wallet_audit_logs) audits;"
dc exec -T mongo mongosh bitestream --quiet --eval "printjson({menus:db.Menus.countDocuments(),reviews:db.Reviews.countDocuments(),pings:db.DriverPings.countDocuments()})"
```

Use browser Network or open `/api/health` on port 14000: HTTP 200 with
`{"status":"ok","postgres":true,"mongo":true}`. A connection error is a failure,
not an empty-data state.

## 3. Automated checks

Run these sequentially, before manual writes. API tests use real DB connections;
Checkout uses an outer transaction and savepoints, audit mutation tests roll back,
and Browse/API tests read seeded records. No test drops or reseeds a database.

```text
dc exec -T web npm test -- src/pages/CheckoutPage.test.jsx
dc exec -T web npm test
dc exec -T web npm run build
dc exec -T api npm test
dc exec -T -e DEMO_DISPOSABLE=1 api node scripts/demo-check.mjs
git diff --check
```

- [ ] **Checkout RTL — result: ____**, passed/total: ____.
- [ ] **Full frontend — result: ____**, passed/total: ____.
- [ ] **Build — result: ____**, exit code: ____.
- [ ] **API integration — result: ____**, passed/total: ____.
- [ ] **HTTP/DB demo runner — result: ____**, attach JSON output. This script
  uses the real local API, independently checks persisted rows, leaves real orders
  and wallet activity for inspection, refreshes the materialized view, and stops
  on assertion failure. It does **not** perform browser checks or mark mocked
  workflows PASS. Each rerun selects new eligible seed customers; reset for a
  pristine comparison. `DEMO_DISPOSABLE=1` is an acknowledgement, not automatic
  isolation: verify section 2 first.
- [ ] **Whitespace — result: ____** `git diff --check` exits 0.

## 4. Workflow 1: Checkout, wallet and Order Detail

Use an eligible seeded customer; never assume their balance from a previous run.
The API runner prints selected IDs and snapshots. For a separate manual UI run,
select candidates with this SQL and record their names/IDs/balances:

```text
dc exec -T postgres psql -X -U postgres -d bitestream -c "SELECT u.id,u.name,u.wallet_balance FROM users u WHERE NOT EXISTS (SELECT 1 FROM orders WHERE user_id=u.id AND status IN ('PREPARING','DELIVERING')) ORDER BY wallet_balance LIMIT 5;"
```

For a funded customer, add `AND wallet_balance >= 2160` before `ORDER BY` in the
above query. In the header select Customer, search the printed name, and select
the exact customer option. In Checkout select a restaurant. Record its actual menu
response and `X-Mock` header. Menu is currently MOCKED; financial endpoints are REAL.

### 4.1 Success

- [ ] **Cart — result: ____** Add an available item, increase/decrease quantity,
  select an add-on. Independently calculate total in integer paise. In the current
  mock menu, two Paneer Tikka with Extra Cheese and one Butter Chicken with Extra
  Spicy + Extra Naan total `2*(240+40)+(400+10+50)=1020`; use the displayed prices
  if the menu changes. Unavailable Veg Spring Roll cannot be added.
- [ ] **Payment — result: ____** Record wallet balance and SQL snapshot below.
  Press Place order once (also test rapid double-click on a separate attempt).
  Network must show exactly one `POST /api/checkout`, HTTP 201, no `X-Mock`, amount
  equal to the cart total. While pending, button/cart controls are disabled.
  Confirmation shows the returned ID, PREPARING, actual before/after balance and
  one returned DEBIT audit ID. Balance falls by exactly the total.
- [ ] **Persistence/navigation — result: ____** View order opens
  `/browse/orders/<returned-id>` with matching customer, restaurant, amount,
  timestamp and Preparing badge. Customer and restaurant links open real detail
  pages; back link returns to Browse orders. Wallet history contains exactly one
  matching DEBIT row (same ID, amount, resulting balance).

For independent snapshots, open an interactive shell:

```text
dc exec postgres psql -X -U postgres -d bitestream
```

Paste this SQL after replacing the two values with IDs printed by your run.
Keep the same session for later queries (`\q` exits).

```sql
\set uid 'PASTE_CUSTOMER_UUID'
\set rid 'PASTE_RESTAURANT_UUID'
SELECT wallet_balance FROM users WHERE id=:'uid';
SELECT count(*) AS orders, count(*) FILTER (WHERE status IN ('PREPARING','DELIVERING')) AS active FROM orders WHERE user_id=:'uid';
SELECT count(*) AS audits FROM wallet_audit_logs WHERE user_id=:'uid';
SELECT id,action_type,amount_changed,balance_after,changed_at FROM wallet_audit_logs WHERE user_id=:'uid' ORDER BY seq DESC LIMIT 5;
```

### 4.2 Insufficient funds and top-up

- [ ] **402 rollback — result: ____** Choose a low-balance customer from the query,
  build a cart greater than the displayed wallet, record SQL counts, press Place
  order. Expect HTTP 402 `INSUFFICIENT_BALANCE`, the API's exact message and Top up
  button. SQL balance/order/audit counts remain unchanged. No success/DEBIT appears.
- [ ] **Credit — result: ____** Open Top up. Blank, zero, negative and three-decimal
  values must disable confirmation. Enter enough to cover the shortfall (e.g. ₹500
  for a ₹240 cart with balance below ₹240). Confirm once: HTTP 200, exactly one
  CREDIT, balance increases by entered amount, returned audit ID matches SQL.
  Stale red payment error disappears, cart survives, no automatic checkout occurs.
- [ ] **Explicit retry — result: ____** Press Place order. Expect 201, one new
  PREPARING order and DEBIT. Wallet history must show both CREDIT and DEBIT with
  correct balances immediately, including when Wallet was previously cached.

### 4.3 Active-order conflict and PostgreSQL invariant

`sql/02_indexes.sql` defines **idx_active_user_order**, UNIQUE on **orders(user_id)**,
predicate **status IN ('PREPARING','DELIVERING')**. DELIVERED rows do not participate.
The database permits many delivered orders but at most one active order/customer.

- [ ] **Inspect metadata — result: ____** Run:

```sql
SELECT indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname='idx_active_user_order';
```

- [ ] **409 rollback — result: ____** With the successful order active and sufficient
  wallet balance for another cart, return to Checkout and attempt a second order.
  Expect HTTP 409 `ACTIVE_ORDER_EXISTS`, actual backend message and View active
  order pointing to the existing order UUID. Balance/order/audit counts from the
  SQL snapshot remain identical. No second DEBIT or confirmation is displayed.
  Repeat while DELIVERING if desired. Insufficient funds can take precedence over
  409, so fund the wallet before this particular demonstration.
- [ ] **Database enforcement — result: ____** In the SQL session, while the first
  order is active, execute these statements one at a time:

```sql
BEGIN;
INSERT INTO orders(id,user_id,restaurant_id,total_amount,status)
VALUES(gen_random_uuid(),:'uid',:'rid',1,'PREPARING');
-- Expected ERROR: duplicate key violates unique constraint idx_active_user_order.
ROLLBACK;
```

The deliberate error is expected, not a failed demo. Always ROLLBACK. This bypasses
React and Express and proves the invariant is PostgreSQL-enforced. The automated
runner checks SQLSTATE `23505` and the exact constraint name using the same approach.
This direct-insert demonstration is sequential. For real overlapping requests,
the demo runner additionally locks a fresh eligible customer's wallet row, starts
five HTTP checkouts, waits until `pg_stat_activity` shows all five waiting for locks,
then releases the lock. Expected: one 201, four 409 responses, one order and one
DEBIT; audit/order counts and balance must change only once. If five waiters are
not observed, the script fails rather than claiming concurrency was verified.

### 4.4 Advancement and another checkout

- [ ] **Preparing → Delivering — result: ____** Use View active order. Rapidly
  double-click Advance status: exactly one POST in Network, one transition, button
  disabled during request/refetch, refreshed badge Delivering, matching success
  message. SQL `SELECT status FROM orders WHERE user_id=:'uid' AND status <> 'DELIVERED';`
  confirms DELIVERING. No wallet/audit change.
- [ ] **Delivering → Delivered — result: ____** Click once after re-enable. Expect
  HTTP 200, Delivered badge and message, no Advance button, zero active rows.
  Customer Detail now shows no active order. No wallet/audit change.
- [ ] **Checkout allowed again — result: ____** Return to Checkout, build a funded
  cart and pay. Expect 201, a different UUID, exactly one active order and one new
  DEBIT. This completes the partial-index demonstration.

### 4.5 Stale page and error states

- [ ] **Stale 409 — result: ____** Open the same active order in two tabs. Keep
  tab A on its old status, use tab B to advance through delivery, then press Advance
  in A. If focus refetch updates A first, use a second browser session or advance
  via the API while keeping A focused. Expect 409 `INVALID_TRANSITION`, exact API
  message, then GET refresh to Delivered and no button. Blue delivered note plus
  red API error is the known optional #19 cosmetic duplication; do not change it here.
- [ ] **Failures — result: ____** Visit `/browse/orders/00000000-0000-4000-8000-000000000000`:
  expect friendly 404. Use browser DevTools Offline while loading a detail page:
  expect loading/error/retry rather than blank screen. Restore Online and retry.
  Test slow network for visible pending controls; do not alter shared database data.
- [ ] **Phone — result: ____** At about 400 px wide, verify no sideways scroll,
  usable cart/top-up/buttons, wrapping IDs, and no unexpected console errors.

## 5. Workflow 2: Analytics

- [ ] **Availability — result: ____** Open `/analytics`. If it says “To build”, mark
  the following UI steps BLOCKED. Inspect Network/HTTP headers for `/api/analytics/summary`,
  `/revenue?restaurantId=<id>`, `/ranking?page=1&pageSize=20` and POST `/summary/refresh`.
  `X-Mock: true` means the response and changing timestamp are not database evidence.
- [ ] **SQL verification — result: ____** Run the real report with no host psql:

PowerShell:

```powershell
Get-Content -Raw sql/06_window_analytics.sql | dc exec -T postgres psql -X -U postgres -d bitestream -v ON_ERROR_STOP=1
```

Bash/zsh:

```bash
dc exec -T postgres psql -X -U postgres -d bitestream -v ON_ERROR_STOP=1 < sql/06_window_analytics.sql
```

Verify delivered-only daily revenue; `DENSE_RANK()` gives equal totals equal ranks.
The inherited moving average is **seven rows with revenue**, not seven calendar days
when dates are missing (`ROWS BETWEEN 6 PRECEDING AND CURRENT ROW`). Record this
semantic limitation rather than relabelling it as a verified seven-calendar-day chart.
- [ ] **Materialized view — result: ____** In psql run `CALL sp_refresh_restaurant_summary();`
  then compare `SELECT sum(completed_order_count),sum(completed_revenue) FROM restaurant_order_summary;`
  with `SELECT count(*),sum(total_amount) FROM orders WHERE status='DELIVERED';`.
  Expected equal. The runner asserts this. The inherited SQL does not persist a
  last-refresh timestamp; the mocked API timestamp is not proof of a refresh.
- [ ] **UI after dependency merge — result: ____** Select a seeded restaurant,
  compare completed revenue/counts, daily trend and moving average to SQL 06;
  compare ranking and pagination; deliver an order, press Refresh, verify changed
  summary values and real timestamp contract. Change restaurant and verify new data.
  Exercise loading, API failure/retry and a restaurant with no delivered orders.
  Currently BLOCKED by #10 (calendar-window/refresh-log SQL), #15 (real analytics
  routes) and #22 (Analytics UI).

## 6. Workflow 3: nearby drivers / Map

- [ ] **Availability — result: ____** Open `/map`; verify whether the map/selector
  exists. Inspect `/api/drivers/nearby?lat=12.9716&lng=77.5946&radius=5000`.
  Current header `X-Mock: true` blocks real radius/freshness/driver conclusions.
- [ ] **Indexes/freshness — result: ____** Open `dc exec mongo mongosh bitestream`:

```javascript
db.DriverPings.getIndexes()
db.DriverPings.find({}, {createdAt:1}).sort({createdAt:-1}).limit(1)
db.DriverPings.countDocuments({createdAt:{$gte:new Date(Date.now()-7200000)}})
db.DriverPings.aggregate([
  {$geoNear:{near:{type:'Point',coordinates:[77.5946,12.9716]},key:'location',distanceField:'distanceMeters',maxDistance:5000,spherical:true,query:{active:true,createdAt:{$gte:new Date(Date.now()-7200000)}}}},
  {$limit:5},{$project:{_id:0,driverId:1,distanceMeters:1,createdAt:1}}
]).toArray()
```

Expected `location: '2dsphere'` and `createdAt` TTL `expireAfterSeconds:7200`.
Distances are metres, coordinate order longitude then latitude. TTL is asynchronous;
explicit timestamp filtering matters. The two-hour window above checks unexpired
storage, not a product definition of “live”. Mongo 02 returns the closest active
ping only; it lacks recent-only filtering and latest-ping-per-driver deduplication.
- [ ] **Replenish if needed — result: ____** There is no simulator in this branch.
  After integrating already-merged PR #44 from main, use its real service instead:
  `dc up -d --no-deps ping-simulator`, then `dc logs --tail 20 ping-simulator` and
  inspect pings from the last minute. The following generator fallback applies to
  the older `a8f8700` baseline only.
  Existing generator can append pings without more menus/reviews, only in this
  disposable environment:

```text
dc run --rm --no-deps seed python3 /work/data_generation/mongo_seeder.py --pings 10000 --menus 0 --reviews 0
```

It still generates timestamps over the preceding three hours; inspect timestamps
again. Do not assume all new rows are live. For a short freshness policy, measure
the count in that policy's window instead of changing old timestamps.
- [ ] **UI after dependency merge — result: ____** Choose a restaurant or map point,
  verify origin marker, radius circle, unique available drivers, increasing distance
  order, all within radius, and real API/Mongo agreement. Change radius/origin and
  verify results; choose a distant point for empty state. Confirm five-second polling,
  latest ping per driver and the documented freshness policy. Exercise slow/offline
  loading/error recovery. On this tested branch, BLOCKED until PR #44 (issues #7,
  #8, #16, #23) is integrated from main. It is already merged upstream; do not
  describe it as unfinished Member D work. Main's real API uses a ten-minute
  window and latest-ping-per-driver selection; verify those contracts on retest.

## 7. Workflow 4: Reviews and menu

- [ ] **Availability/linkage — result: ____** Open `/reviews?restaurantId=<PostgreSQL-id>`.
  Current page is a placeholder; menu API sends `X-Mock: true`. In mongosh compare
  `db.Menus.findOne({restaurantId:'PASTE_POSTGRES_UUID'})` and
  `db.Reviews.countDocuments({restaurantId:'PASTE_POSTGRES_UUID'})` to the API.
  Seed ID mismatch is a blocker, not evidence that every restaurant has no reviews.
- [ ] **Real statistics — result: ____** In mongosh obtain
  `db.Reviews.findOne().restaurantId`, then open
  `/api/reviews/stats?restaurantId=<that-id>` on port 14000. Independently aggregate:

```javascript
const rid = db.Reviews.findOne().restaurantId;
db.Reviews.aggregate([
  {$match:{restaurantId:rid}},
  {$facet:{
    ratings:[{$group:{_id:'$rating',count:{$sum:1}}},{$sort:{_id:1}}],
    tags:[{$unwind:'$sentimentTags'},{$group:{_id:'$sentimentTags',count:{$sum:1}}},{$sort:{count:-1,_id:1}}],
    overall:[{$group:{_id:null,total:{$sum:1},average:{$avg:'$rating'}}}]
  }}
]).toArray()
```

Compare count, average rounded to two decimals, all five star buckets (missing SQL-
style groups become zero), tag frequencies and tie ordering. Also verify unfiltered
`/api/reviews/stats` against all Reviews, and an unknown valid UUID gives null average,
zero total, five zero buckets and empty tags. The runner independently recomputes
nonempty restaurant results from documents, rather than reusing the API pipeline.
- [ ] **UI after dependency merge — result: ____** Select a restaurant and then all
  restaurants; verify average/count, distribution and tags against the above.
  Verify menu categories/items/prices/availability/add-ons against `Menus.findOne`.
  Review text is stored in MongoDB but there is no individual-review-list endpoint
  in this branch; do not invent one or claim it was rendered. Test empty menu/reviews,
  loading and API error/retry. BLOCKED by #24 (Reviews UI), #17 (real menu route)
  and #5 (PostgreSQL/Mongo seed linkage).

## 8. Final consistency and teardown

- [ ] **Invariant — result: ____** SQL below returns no rows:

```sql
SELECT user_id,count(*) FROM orders WHERE status IN ('PREPARING','DELIVERING')
GROUP BY user_id HAVING count(*)>1;
SELECT u.id FROM users u WHERE wallet_balance IS DISTINCT FROM
(SELECT balance_after FROM wallet_audit_logs WHERE user_id=u.id ORDER BY seq DESC LIMIT 1);
```

- [ ] **Regression — result: ____** Re-run API tests after the demo writes; wallet
  chains should remain valid. Check browser console, phone layout and `git status`.
  Changes should be tests/docs/demo tooling only. No UI/schema/API changes required.
- [ ] **Teardown — result: ____** After saving evidence, `dc down` stops only the demo
  project and retains its volumes. Do not use the unqualified default-project command.
  Delete demo volumes only when you explicitly no longer need evidence; never delete
  the ordinary development volumes as part of this checklist.

## 9. Execution record — 2026-10-15 Asia/Kolkata

Source: `a8f8700` plus #26 test/documentation changes, branch
`feature/issue-26-checkout-tests-demo`. Disposable project
`bitestream-issue26-20261015`, fresh project-labelled volumes verified absent before
creation. Existing `bitestream` project preserved. RESET=1 completed successfully
with full default seed sizes. PostgreSQL seed counts matched section 2; Mongo output
was 500 menus, 10,000 reviews, 494,278 retained pings (TTL already active).

Measured results, exact limitations and the later-main dependency matrix are in
[demo_results.md](demo_results.md). Do not interpret unchecked template boxes as PASS.

## 10. Final integration retest before closing #26

- [ ] With the branch owner's authorization, bring the latest main into the review
  branch. Do not cherry-pick or reimplement teammates' features. Recheck PR #44 and
  #5, #10, #15, #17, #22, #24 against code, not only issue state.
- [ ] Update the dependency matrix and verify real endpoints no longer send X-Mock.
- [ ] Use a new disposable project and repeat RESET=1, then start the simulator if
  present. Confirm PostgreSQL/Mongo restaurant linkage and fresh pings.
- [ ] Execute every previously BLOCKED/NOT RUN UI/API step, including offline/retry
  and map polling, and record evidence separately from these reusable instructions.
- [ ] Run all frontend/API tests and build again; totals may grow after merges.
- [ ] Only when all four workflows pass the full fresh-seed run, use `Closes #26`.
  Until then, use a **Draft PR with `Refs #26`**. No automatic close, merge or push.
