# Issue #26 execution results — 15 October 2026 (Asia/Kolkata)

## Scope and source audit

Tested branch: `feature/issue-26-checkout-tests-demo`, starting at `a8f8700`.
No production code, schema, procedures or API contracts changed. No commit, push,
merge, PR creation or issue closure was performed.

The later audit found local `main` at `549a361`, including Map PR #44. That merge
is **not in this feature branch**. The tests and running containers below use
`a8f8700` plus the #26 test/docs/helper changes, not the newer main. This distinction
is necessary: a mock on this branch is not proof that a teammate has no implementation.

Inspected README, API/design contracts, Compose, seed scripts, SQL procedures,
triggers/indexes/window report, Mongo scripts, current API/routes/pages/helpers/tests,
local main and available branches. Git history confirms merged PRs #37/#38
(procedures/API), #39/#40/#41/#45 (detail/wallet/checkout/order) and #44 (Map on main).

GitHub API issue bodies/states were read for #5, #7, #8, #9, #10, #13, #15, #16,
#17, #18 and #19. These responses had no comments. #20 and #26 bodies were also
read through the web tool. The unauthenticated API then hit its rate limit; live
metadata for #20–#26 and the open-PR listing could not all be confirmed. Web fallback
for #21–#25 and the PR list failed. No open PR status is invented. Issues #22/#23/#24
are dependency references supplied in the task and corroborated by source ownership.
The [Claude tracker](https://claude.ai/artifact/B2J4ohyxD98RHaQReKeT6p) was inaccessible;
none of its contents were used. Cached GitHub state may be stale, so readiness below
is based on inspected code, merge history and actual behavior.

## Dependency/readiness matrix

READY means implemented and relevant verification passed. IMPLEMENTED, UNVERIFIED
means code was inspected but that version was not executed. MOCK means simulated
responses. BLOCKED identifies a missing dependency in the tested checkout. No
PENDING MERGE claim is made without a verified open implementation PR.

| Workflow | Database | API | Frontend | Tests | Demo readiness | Pending issue/PR |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Checkout | READY: procedures, audit trigger, partial unique index | READY: checkout/top-up/advance | READY: Checkout/Order Detail/Wallet | READY: 92 web, 55 API overall; live financial checks | READY for Member A financial lifecycle, using MOCK menu | Real catalog integration still #5/#17 |
| 2 Analytics | READY for inherited SQL report and materialized view; calendar-day average/refresh log BLOCKED | MOCK | BLOCKED: placeholder | NOT RUN for missing analytics UI/API | BLOCKED | #10, #15, #22 |
| 3 Map, tested branch | READY: geo/TTL indexes and seeded geo query; simulator absent | MOCK | BLOCKED: placeholder | NOT RUN for real Map on this branch | BLOCKED by branch integration | #44 already merged on main, covers #7/#8/#16/#23 |
| 3 Map, local main | IMPLEMENTED, UNVERIFIED: simulator and recent/latest-driver pipeline | IMPLEMENTED, UNVERIFIED: real route | IMPLEMENTED, UNVERIFIED: Leaflet/polling UI | Map and drivers tests present, NOT RUN on main | Must integrate and retest | PR #44 is not pending upstream merge |
| 4 Reviews/menu | READY: statistics aggregation; linkage BLOCKED | READY: review stats; MOCK: menu | BLOCKED: placeholder | API statistics verified; UI NOT RUN | BLOCKED | #5, #17, #24 |

## Fresh reset and isolation

Executed `docker compose ps` and `docker compose config`, inspected reset script,
and verified no containers or volumes existed for `bitestream-issue26-20261015`.
Created new project-labelled PostgreSQL/MongoDB volumes and alternate published ports
using `docs/demo.env`. Existing `bitestream` databases were not reset.

Commands (repository root; `dc` is defined in the checklist):

```text
dc up -d postgres mongo
dc run --rm -e RESET=1 seed
dc up -d --no-deps api web
```

**RESET=1: PASS**, real run completed. Seed output: 10,000 users, 500 restaurants,
120,000 orders, 130,000 audit rows; 500 menus, 10,000 reviews, 500,000 generated
pings, 494,278 retained at completion because TTL deletion was already occurring.
Home/API health confirmed PostgreSQL and MongoDB connectivity.

The work continued later the same day after Docker stopped. Existing demo containers
were restarted with `dc start postgres mongo api web`, preserving volumes; no second
reset was performed. Pings had expired by the later check, as expected after two hours.
Early evidence below belongs to the freshly seeded run; later concurrency/browser
checks used that same disposable database with the earlier demo writes retained.

## Automated results (actually executed)

| Command | Result |
| --- | --- |
| `dc exec -T web npm test -- src/pages/CheckoutPage.test.jsx` | PASS, final 20/20 |
| `dc exec -T web npm test` | PASS, 90/90 before the final two missing-order-lookup tests |
| `npm.cmd test` from `web/` | PASS, final full suite 92/92 across 7 files, no skips |
| `dc exec -T web npm run build` | PASS, final build: 174 modules, 2.67 seconds |
| `dc exec -T api npm test` | PASS, 55/55 across 5 files, no skips; repeated after demo writes |
| `dc exec -T -e DEMO_DISPOSABLE=1 api node scripts/demo-check.mjs` | PASS, final run 10:28 IST; real HTTP/SQL/Mongo assertions including five overlapping requests |
| SQL 06 streamed into container psql with `ON_ERROR_STOP=1` | PASS; report saved in demo PostgreSQL container `/tmp/issue26-window-report.txt` |
| `git diff --check` | PASS |

Historical 89/89 reviewer results were not substituted for these runs. Existing
17 Checkout tests and 19 helper tests already covered the mandatory three outcomes.
#26 added meaningful assertions plus three cases: manual recovery from 409, absent
active-order data and failed customer lookup. Final Checkout count is 20.

During development the concurrency monitor initially matched `id=` while the API
SQL contains `id =`; it correctly refused to claim overlap. The monitoring pattern
was fixed and rerun successfully. No application bug was implicated. Docker's
temporary unavailability caused one invocation to fail before any check ran.

## Measured workflow results

Run-specific IDs/balances here are evidence, **not reusable expected constants**.

| Workflow/check | Result | Evidence | Limits |
| --- | --- | --- | --- |
| Checkout financial lifecycle | PASS | API snapshots and browser flows below | Menu remains MOCK; this is not real Mongo menu integration |
| Partial unique index | PASS | Installed definition, direct SQLSTATE 23505, 409 rollback, checkout after delivery, concurrent requests | Disposable data only |
| Analytics | BLOCKED overall; SQL PASS | Materialized view totals equal delivered orders after real procedure call; SQL 06 executes | UI placeholder; API X-Mock:true; #10/#15/#22 |
| Map | BLOCKED on tested branch | Geo/TTL indexes verified; nearby stored pings found in initial run | Real implementation exists on newer main; not tested here |
| Reviews/menu | BLOCKED overall; review API PASS | Nonempty review statistics independently match documents | UI placeholder, menu mocked, PG/Mongo IDs unlinked; #5/#17/#24 |

### Real HTTP and SQL

- Successful ₹1,080 checkout: latest runner used customer `017c6c7e-3a07-47ad-ba1b-ccbe7e434b06`,
  balance ₹13,377 → ₹12,297. One PREPARING order and one DEBIT, audit count 12 → 13.
  A second checkout returned 409 with unchanged balance/order/audit snapshot.
  Both advance calls returned DELIVERING then DELIVERED; another advance returned
  409 INVALID_TRANSITION. A new checkout then succeeded with a different UUID.
- Insufficient balance: customer `06631d41-e9cf-4355-9f68-bf7246f307be`, ₹89 wallet,
  ₹240 request returned 402 and identical SQL snapshot. ₹500 top-up gave ₹589 and
  exactly one CREDIT; retry gave ₹349 and exactly one new order/DEBIT. Both audit
  IDs appeared in the real wallet-history response.
- Installed index: UNIQUE btree on `public.orders(user_id)`, predicate includes
  PREPARING and DELIVERING only. A direct duplicate SQL INSERT raised SQLSTATE
  `23505`, constraint `idx_active_user_order`, then rolled back.
- Genuine concurrent checkout: customer `011e8eed-3e33-4471-a15f-f2554b429fdc`;
  **five lock-waiting HTTP requests observed in pg_stat_activity** before releasing
  the row lock. Statuses `[201,409,409,409,409]`, balance ₹254 → ₹244, orders 7 → 8,
  audit rows 8 → 9, exactly one active order. No frontend was involved in this proof.
- Final runner consistency: zero duplicate-active customers and zero mismatches
  between customer balances and their latest audit balances.

### Live browser (port 15173)

- Selected actual seeded customer `User-a1c4fed2` through Acting as/search.
  ₹0 wallet and ₹240 cart produced the actual insufficient-funds banner. `0.001`
  disabled top-up confirmation; ₹500 top-up showed CREDIT and cleared the old red
  message. Cart stayed ₹240; checkout did not automatically retry.
- Manual retry showed PREPARING, ₹500 → ₹260, ₹240 DEBIT, and order
  `115174e7-7faf-412a-a5fa-a1ba3d64fd91`. Second checkout showed the active-order
  message and View active order opened that real page. Double-click advancement
  stopped at DELIVERING. Exact browser network request count was not captured;
  the unit test separately asserts a single API call.
- Stale-page scenario reproduced on `5171ba8d-bc27-4989-878c-d40415fdd9c1`: browser
  still showed Preparing while two API calls delivered it. Browser Advance then
  displayed the real already-delivered error and refreshed to Delivered with no
  button. Both blue note and red error appeared; optional cosmetic issue left alone.
- Customer link showed no active order after delivery. Selected that funded
  customer (`User-017c6c7e`), built two Paneer Tikka + Extra Cheese, and Butter Chicken
  + Extra Spicy + Extra Naan. Total ₹1,020. Double-click Place order resulted in one
  visible confirmation, ₹11,217 → ₹10,197, one persisted ₹1,020 DEBIT, order
  `de405a24-69b6-468e-8a4f-36e0753a23d9`. View order worked; both transitions were
  exercised in the UI and ended at Delivered with no Advance button. SQL matched.
- Restaurant detail navigation worked. Checkout and Order Detail at requested
  400px viewport had `scrollWidth === clientWidth === 385` (scrollbar excluded).
  Screenshot evidence was captured during the run; viewport override was reset.
- `/analytics`, `/map`, `/reviews` were visited and visibly showed their respective
  “To build” placeholders on this branch. Their UI demos are BLOCKED, not PASS.
- Browser offline/retry simulation and a complete Wallet UI filter walkthrough:
  **NOT RUN** in this execution. Existing unit/API tests cover those states;
  they are not claimed as live-browser evidence.

### Independent database checks for blocked workflows

- Real materialized-view refresh matched delivered totals: 110,970 orders,
  ₹143,326,843 at the final helper snapshot (before subsequent browser deliveries).
  Analytics summary still returned `X-Mock:true`. SQL 06 ran successfully; its first
  sample row was Restaurant-166, 2026-09-15, daily ₹13,351, moving average ₹13,351,
  total ₹354,950, rank 1. Calendar-day semantics/refresh logging remain #10 work.
- At 01:15 IST the geo query found five active unexpired pings within 5km, with
  distances approximately 14.69, 27.02, 30.38, 31.79 and 34.20 metres. Indexes were
  `idx_driver_location_2dsphere` and `idx_driver_createdAt_ttl` (7200 seconds).
  323,597 pings were within the two-hour window then; at 10:28 IST count was zero.
  This expected expiration is not a failed Map implementation. No simulator exists
  in the tested baseline; main's #44 simulator must be included in the final retest.
- Real reviews API for Mongo restaurant `bf4b0b03-6707-4380-b9c3-0ff30126efd8`:
  18 reviews, average 3.00, 1–5 star counts `[6,3,0,3,6]`. Tag counts matched independent
  document computation. Unknown restaurant returned null average, zero total,
  five zero buckets and no tags. PostgreSQL Restaurant-1's ID had no Mongo menu
  and no reviews; its menu API nevertheless returned a mocked menu. This confirms
  the #5/#17 integration dependency, not a defect in the review-statistics pipeline.

## Remaining work and proposed review

The test/documentation work is ready for review, but **the entire issue is not
complete**. Integrate latest main with explicit branch-owner approval, then wait
for #5/#10/#15/#17/#22/#24 to be implemented/merged. Re-audit headers, seed linkage,
calendar analytics and simulator freshness. Run all four workflows on a new
disposable RESET=1 seed, execute the NOT RUN steps and rerun all suites/build.

Suggested commit: `test(checkout): strengthen coverage and document four-workflow demo`

Suggested **Draft PR** title: `test: checkout coverage and reproducible demo checklist (#26)`

Suggested description:

> Strengthens existing Checkout tests for returned status, add-ons, top-up/cart
> preservation and active-order recovery/lookup failures. Adds a four-workflow
> checklist, isolated demo environment and repeatable HTTP/database verification.
>
> Validated: 92 frontend tests, 20 focused Checkout tests, 55 API tests, production
> build, real RESET=1, checkout/top-up/status lifecycle and partial-index enforcement
> with five overlapping requests. Execution evidence distinguishes mocked/blocked
> workflows from passing Member A functionality.
>
> Draft pending integration of already-merged Map PR #44 into this branch and final
> full-workflow retest after #5, #10, #15, #17, #22 and #24. No production behavior changed.
>
> Refs #26
