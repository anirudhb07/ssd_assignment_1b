# Issue #26 verification results

Verified on 15 October 2026 on `feature/issue-26-checkout-tests-demo`, at
`efca551` plus the PR #48 review fixes. This is the PR branch, not a new merge
with current main; suite totals therefore differ from the reviewer's merged-main run.

Environment: isolated Compose project `bitestream-issue48-review`, freshly seeded
PostgreSQL and MongoDB, with API, web and ping-simulator running. The ordinary
project's databases were not reset.

| Check | Result |
| --- | --- |
| API: `npm test` | PASS: 88/88 tests, 10 files |
| Web: `npm test -- --maxWorkers=2` | PASS: 108/108 tests, 10 files |
| Web: `npm run build` | PASS; bundle-size warning for a chunk over 500 kB |
| Runner: `DEMO_DISPOSABLE=1 node scripts/demo-check.mjs` | PASS; run started at 14:17:43 UTC |
| `node --check scripts/demo-check.mjs` and `git diff --check` | PASS |

Runner evidence:

- Checkout: 201, exact debit, 409 with no mutation, delivery transitions, then
  successful checkout again. Five overlapping requests produced one 201 and four
  409s, with one order and one debit. Direct duplicate insertion failed on the
  partial unique index and was rolled back.
- Low balance: 402 at INR 45; INR 500 top-up produced INR 545, then an INR 240
  checkout left INR 305 with matching CREDIT/DEBIT audit rows.
- Analytics: real API and materialized view matched SQL totals: 110,966 delivered
  orders and INR 143,323,363 revenue.
- Reviews/menu: real rating/tag statistics matched Mongo documents, empty statistics
  were correct, and the returned menu categories matched the linked Mongo menu.
- Map: real API returned 80 distinct drivers, sorted by distance within 5 km;
  geospatial and 7200-second TTL indexes were present.
- Analytics, reviews, menu and Map returned `mock: null`. Consistency checks found
  zero duplicate active orders and zero wallet/latest-audit balance mismatches.

The runner intentionally leaves evidence rows in the disposable database. Manual
browser steps in the checklist were not repeated during this documentation review;
these automated results do not claim a fresh visual or live-demo walkthrough.
