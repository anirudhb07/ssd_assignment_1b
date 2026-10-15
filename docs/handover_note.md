# Handover Note

> **Draft.** Written from a first test run on 12 Oct 2026. Member D keeps this file tidy and about one page long. Whoever makes a fix adds it to "What we changed".

We inherited the BiteStream backend (P1) from https://github.com/charmin-v/ssd_assignment_1. We ran it end to end on PostgreSQL 16 and MongoDB 7 using the original README's order.

## What worked

- All SQL scripts (`sql/01`–`05`) run cleanly and can be re-run safely.
- Both seeders work at full size: 10k users, 500 restaurants, 120k orders and 120k audit rows in about 30 s; 500 menus, 10k reviews and 500k driver pings in about 10 s.
- `sp_execute_checkout` debits the wallet, and the trigger writes the DEBIT audit row.
- Insufficient balance raises an error and nothing changes.
- The partial unique index `idx_active_user_order` blocks a second active order, and the wallet debit is rolled back with it.
- Audit rows cannot be updated or deleted.
- `sp_refresh_restaurant_summary` refreshes the materialized view concurrently.
- The window-function query (7-day moving average + `DENSE_RANK`) returns 15,455 rows.
- `$geoNear` (2dsphere index) and `$facet` both run; the TTL index exists.

## What did not work

1. **Mongo data is not linked to PostgreSQL.** The Mongo seeder invents random restaurant IDs for `Menus` and `Reviews`, so none match a real restaurant. A restaurant's menu or reviews cannot be shown.
2. **Audit rows cannot be ordered.** The trigger uses `NOW()`, which is the transaction start time. The seeder writes everything in one transaction, so all 120k seeded audit rows share one timestamp. A running balance or date filter is impossible.
3. **Driver pings expire before a demo.** Pings are seeded up to 3 hours old but the TTL is 2 hours. About 40k were deleted during the seed itself, and the rest are gone within 2 hours.
4. **`$geoNear` returns pings, not drivers.** It stops at `$limit: 1` and has no freshness filter, so a 2-hour-old ping counts as a nearby driver.
5. **Missing procedures.** There is no way to change an order's status, to top up a wallet, or to know when the materialized view was last refreshed.
6. **Raw errors.** A second active order surfaces as `23505 duplicate key`, which the UI cannot show to a user.

Smaller issues:

- The moving average uses `ROWS 6 PRECEDING`, which counts rows, not days. There are 15 restaurant/day gaps where it isn't a true 7-day window.
- The window query and `$facet` pipeline aren't parameterised by restaurant.
- `performance/mongo_execution_stats.json` refers to an index `idx_reviews_rating` that no script creates.
- The seeders aren't idempotent: running them again duplicates every row.
- The README's "final commit" (`7022714`) is not the latest commit (`60a9b01`).

## What we changed and why

| Change | Why |
| --- | --- |
| Added `sp_advance_order_status(UUID)` and `sp_wallet_topup(UUID, DECIMAL)` in `sql/07_order_status_and_topup.sql`, with rollback-only psql regression tests in `sql/tests/order_status_and_topup.sql` | Addresses the status and wallet parts of #5 (issue #9). Status advances lock the order and reject missing/already-delivered orders. Top-ups atomically add a positive finite amount rounded to cents (minimum rounded credit 0.01), reject missing users, and let the existing trigger write CREDIT. Apply with `docker compose run --rm seed` without resetting data. Materialized-view refresh tracking is in `sql/09`. |
| Added `docker-compose.yml`, `docker/seed/`, `.env.example` | One command gives every team member the same databases and data. The seed step skips when data exists, so it is safe to re-run. |
| Added `.gitattributes` (`*.sh` with LF endings) | The seed script must keep Unix line endings to run in Linux containers when checked out on Windows. |
| Seed runs every numbered SQL file (except `06`) | New scripts (`sql/07`–`10`, one per member) are applied without editing the seed or each other's files. |
| Added index `idx_orders_created_at` (`sql/08_orders_recent_index.sql`) | No index covered “newest orders first”, so each page of the order list scanned and sorted all 120,000 orders: 128 ms per request, down to 1.5 ms with the index. |
| Fixed audit row ordering (`sql/08_audit_ordering.sql`, `postgres_seeder.py`): `seq BIGSERIAL` column; `fn_wallet_audit()` uses `clock_timestamp()`, or `bitestream.audit_at` when the seeder sets it for its transaction; the seeder applies orders oldest first and gives each customer an opening CREDIT | Fixes "What did not work" #2. Audit rows now span 30 days, and for every customer the rows ordered by `seq` chain from ₹0 to the current balance (checked by `api/tests/audit.test.js`). |
| Linked Mongo data to PostgreSQL (`data_generation/mongo_seeder.py`): reads restaurants and `DELIVERED` orders from Postgres; one menu per real restaurant, one review per delivered order (unique index on `orderId`), dated after its order; stops with a clear message if Postgres is not seeded | Fixes "What did not work" #1. Menus and reviews now belong to real restaurants and orders, so a restaurant's menu and reviews can be shown. After pulling, clear the Mongo collections (`deleteMany`) and run the seed again. |
| Added `sql/09_restaurant_window_and_refresh_log.sql`: `fn_restaurant_revenue_trend(restaurant_id)` (7-day moving average with `RANGE INTERVAL '6 days'`), `fn_restaurant_revenue_ranking()` (`DENSE_RANK`), `restaurant_summary_refresh_log`, and `sp_refresh_restaurant_summary()` now writes one log row per refresh | Fixes the moving-average issue under "Smaller issues" (rows are not days when a restaurant has gaps), the window query not being parameterised by restaurant, and the "when was the view last refreshed" part of #5. The ranking reads the materialized view, so it always agrees with the summary and the last-refreshed time. Apply with `docker compose run --rm seed`; no reset needed. |
| *(Whoever makes a fix: add it here, with the reason)* | |

## Suggestions for the original authors

- Test the system the way a user would use it, not only script by script. Most of the issues above only appear when the pieces are used together.
- Seed cross-database references from the source of truth (PostgreSQL), not from fresh random IDs.
- Use `clock_timestamp()` in audit triggers, or add a sequence column, whenever row order matters.
- Make seed timestamps consistent with TTL indexes.
- Raise errors with distinct SQLSTATE codes (or check the active-order rule explicitly) so callers can tell failures apart.