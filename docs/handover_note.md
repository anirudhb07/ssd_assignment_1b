# Handover Note

> **Draft.** Written from a first test run on 12 Oct 2026. Member A owns this file: update the "What we changed" section as fixes land, and keep it to about one page.

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
| Added `docker-compose.yml`, `docker/seed/`, `.env.example` | One command gives every team member the same databases and data. The seed step skips when data exists, so it is safe to re-run. |
| Added `.gitattributes` (`*.sh` with LF endings) | The seed script must keep Unix line endings to run in Linux containers when checked out on Windows. |
| *(Member A: add each SQL / seeder fix here)* | |

## Suggestions for the original authors

- Test the system the way a user would use it, not only script by script. Most of the issues above only appear when the pieces are used together.
- Seed cross-database references from the source of truth (PostgreSQL), not from fresh random IDs.
- Use `clock_timestamp()` in audit triggers, or add a sequence column, whenever row order matters.
- Make seed timestamps consistent with TTL indexes.
- Raise errors with distinct SQLSTATE codes (or check the active-order rule explicitly) so callers can tell failures apart.
