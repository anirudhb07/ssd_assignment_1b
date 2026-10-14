# BiteStream – Food Delivery & Real-Time Logistics

BiteStream is a food delivery system built on **PostgreSQL** (orders, wallets, audit trail, analytics) and **MongoDB** (menus, reviews, live driver locations).

Assignment 2 adds a **web front end** and a small **API layer** on top of the Assignment 1 database we inherited, so a user can run all four workflows from a browser. The original Assignment 1 documentation is kept unchanged at the [end of this file](#assignment-1-documentation-inherited).

## Repository

- **GitHub repository:** https://github.com/anirudhb07/ssd_assignment_1b
- **Final submission commit:** _TODO before submitting_
- **Demo video:** _TODO_
- **Inherited from:** https://github.com/charmin-v/ssd_assignment_1 (Assignment 1 final commit `7022714778d3a1a8e6a39a619c7cdabc642db7e9`)

## Quick Start

With Docker installed (see [Development Setup](#development-setup-docker) if it isn't):

```bash
git clone https://github.com/anirudhb07/ssd_assignment_1b.git
cd ssd_assignment_1b
docker compose up -d
```

Wait a few minutes on the first run, then open **http://localhost:5173**. The home page shows whether the API and both databases are connected.

## Development Setup (Docker)

Docker gives every team member the same PostgreSQL, MongoDB, API and web app, with the same seeded data. You don't need PostgreSQL, MongoDB, Python or Node.js on your machine.

### 1. Install Docker

| Your OS | What to install |
| --- | --- |
| Windows 10/11 | [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/). Keep the **WSL 2** option ticked during install, and restart when asked. |
| macOS | [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/). Pick the Apple Silicon or Intel download to match your Mac. |
| Linux | [Docker Engine](https://docs.docker.com/engine/install/) (or Docker Desktop). After installing Engine, run `sudo usermod -aG docker $USER`, then log out and back in so you can run `docker` without `sudo`. |

On Windows and macOS, open Docker Desktop and wait until it says **Engine running** before you continue. Give it at least 4 GB of memory (Settings → Resources).

Check that it works:

```bash
docker --version
docker compose version      # needs v2 or later ("docker compose", not "docker-compose")
docker run --rm hello-world # prints "Hello from Docker!"
```

### 2. Get the code

```bash
git clone https://github.com/anirudhb07/ssd_assignment_1b.git
cd ssd_assignment_1b
```

On Windows, clone inside WSL (for example in your Ubuntu home folder) if you can. File changes are picked up faster there.

### 3. Start everything

```bash
docker compose up -d
```

This starts five containers in order: `postgres` and `mongo`, then `seed` (loads the data and exits), then `api` and `web`. The first run downloads images, seeds the databases and installs npm packages, which takes a few minutes. To watch progress:

```bash
docker compose logs -f seed        # ends with "==> Done. PostgreSQL and MongoDB are ready."
docker compose logs -f api web     # ends with "BiteStream API listening..." and Vite's "ready"
```

Press `Ctrl+C` to stop following a log; the containers keep running.

### 4. Check it works

- Open **http://localhost:5173**. The green bar should say *API is up · PostgreSQL connected · MongoDB connected*.
- Go to **Browse**. The Restaurants tab lists 500 restaurants from PostgreSQL, 20 per page.

From a terminal (no database tools needed on your machine):

```bash
docker compose exec postgres psql -U postgres -d bitestream -c "SELECT COUNT(*) FROM orders;"   # 120000
docker compose exec mongo mongosh bitestream --quiet --eval "db.Menus.countDocuments()"         # 500
curl http://localhost:4000/api/health                                                           # {"status":"ok",...}
```

### 5. Addresses and connections

| Service | From your machine | From another Compose service |
| --- | --- | --- |
| Web app | http://localhost:5173 | `web:5173` |
| API | http://localhost:4000/api | `api:4000` |
| PostgreSQL | `postgresql://postgres:postgres@localhost:15432/bitestream` | `postgres:5432` |
| MongoDB | `mongodb://localhost:37017/bitestream` | `mongo:27017` |

To browse the data in your web browser, start the optional tools:

```bash
docker compose --profile tools up -d
```

- **Adminer** (PostgreSQL): http://localhost:8080. Choose System **PostgreSQL**, Server `postgres`, Username `postgres`, Password `postgres`, Database `bitestream`.
- **mongo-express** (MongoDB): http://localhost:8081

### Everyday commands

| Task | Command |
| --- | --- |
| Start everything | `docker compose up -d` |
| Stop (data is kept) | `docker compose down` |
| See what is running | `docker compose ps -a` |
| Follow API / web logs | `docker compose logs -f api web` |
| Restart one service | `docker compose restart api` |
| Wipe both databases and reseed | `docker compose run --rm -e RESET=1 seed` |
| Stop and delete all data | `docker compose down -v` |
| Open a SQL shell | `docker compose exec postgres psql -U postgres -d bitestream` |
| Open a Mongo shell | `docker compose exec mongo mongosh bitestream` |
| Run API tests | `docker compose exec api npm test` |
| Run web tests | `docker compose exec web npm test` |

### How the seed works

The `seed` service runs every numbered `sql/NN_*.sql` file in order (except `06_window_analytics.sql`, which is a report query, not setup), then `mongo/01_collections_and_indexes.js`, then both seeders. It only seeds a database that is empty, so running `docker compose up -d` again won't duplicate data.

The `sql/`, `mongo/` and `data_generation/` folders are read straight from your copy of the repo. After you pull a teammate's changes:

- **Changed SQL procedures, triggers or views:** run `docker compose run --rm seed`. The scripts are applied again and existing data is kept.
- **Changed tables or seeders:** run `docker compose run --rm -e RESET=1 seed` to rebuild the data from scratch.
- **Changed `data_generation/requirements.txt` or `docker/seed/Dockerfile`:** run `docker compose build seed` first.
- **Changed `api/package.json` or `web/package.json`:** run `docker compose restart api web`. They run `npm install` on start.

Driver pings expire 2 hours after they are created (TTL index). If the map shows no drivers, reset and reseed.

### Changing ports or seed size

Copy `.env.example` to `.env` and edit the values. `.env` is git-ignored, so your settings stay on your machine. Use smaller `SEED_*` numbers for a faster seed while developing.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop (or `sudo systemctl start docker` on Linux) and try again. |
| `permission denied ... docker.sock` (Linux) | Run `sudo usermod -aG docker $USER`, then log out and back in. |
| `Bind for 0.0.0.0:<port> failed: port is already allocated` | Something else uses that port. Set the matching `*_HOST_PORT` in `.env` to a free port. |
| Home page says the API is not reachable | Run `docker compose ps -a`. If `api` isn't running, `docker compose logs api` shows why. If `seed` exited with an error, `api` won't start; see the next row. |
| Seed container exited with an error | Run `docker compose logs seed` to see which script failed. |
| Seed fails with `$'\r': command not found` (Windows) | `docker/seed/seed.sh` has Windows line endings. Pull the latest `main` (it includes `.gitattributes`), then run `rm docker/seed/seed.sh` and `git checkout -- docker/seed/seed.sh` to get a copy with Unix line endings. |
| Saving a file doesn't reload the web app (Windows) | Set `WEB_POLLING=true` in `.env`, then `docker compose up -d web`. |
| The app shows old data or mock data after `git checkout` or `git pull` (e.g. a route marked REAL still sends the `X-Mock` header) | The API's auto-restart can fire halfway through a branch switch and load a mix of old and new files. Run `docker compose restart api` (and `docker compose restart web` if a screen looks out of date). |
| Data looks wrong or half-loaded | Run `docker compose run --rm -e RESET=1 seed`. |

## Working on Your Part

### Team

Agree who takes which letter, then have **one person** fill in all four rows in a single commit to `main`. If each person edits their own row on a separate branch, Git reports conflicts because the rows sit next to each other. Everything else in this README, the code `TODO`s and the screen placeholders refers to members by letter.

| Member | Name | Roll number | GitHub username | Owns |
| --- | --- | --- | --- | --- |
| A | Nithin | 2026201038 | innith | Checkout (Workflow 1) |
| B | Anirudh | 2026201058 | anirudhb07 | Browse & Wallet |
| C |Sanjana |2026204012|Sanjana-Venkatesan | Analytics & Reviews (Workflows 2, 4) |
| D | Dhavla Ravi | 2026204004 | cptOreo | Map (Workflow 3) & release |

### Who owns what

Each member owns one workflow end to end: the database fix, the API routes and the screens for it, plus its wireframes (in `docs/design/`), its tests and its part of the demo. Nobody waits on another layer, and everyone does both design and code. The fix numbers refer to "What did not work" in `docs/handover_note.md`.

| Member | Owns | Database | API routes (`api/src/routes/`) | Screens (`web/src/pages/`) |
| --- | --- | --- | --- | --- |
| A | Checkout (Workflow 1) | Add `sp_advance_order_status` and `sp_wallet_topup` (fix 5) · `sql/07_*.sql` | `POST /checkout`, `POST /orders/:id/advance`, `POST /users/:id/topup` | `CheckoutPage`, order detail with "Advance status" in `DetailPage` |
| B | Browse & Wallet | Fix 2: audit row ordering (trigger, `seq` column, backdated seed rows) · `sql/08_*.sql`, `postgres_seeder.py` | `GET /users`, `/users/:id`, `/orders`, `/orders/:id`, `/restaurants/:id`, `/users/:id/audit` | `BrowsePage` (Users, Orders tabs), user and restaurant detail in `DetailPage`, `WalletPage`, search in `ActorSwitcher` |
| C | Analytics & Reviews (Workflows 2, 4) | Fix 1: link Mongo data to Postgres; per-restaurant window view (`RANGE '6 days'`); refresh log for the materialized view (fix 5) · `sql/09_*.sql`, `mongo_seeder.py` | `/analytics/*`, `GET /restaurants/:id/menu` | `AnalyticsPage`, `ReviewsPage` |
| D | Map (Workflow 3) & release | Fix 3: ping simulator; fix 4: `$geoNear` per driver · `sql/10_*.sql` if needed, `mongo/`, new `data_generation/ping_simulator.py` | `GET /drivers/nearby` | `MapPage` |

D also owns the release work: `docs/handover_note.md`, this README's Assumptions, Changes and Contribution sections, the demo video and the final zip.

**Where to start:** A adds the two procedures, then makes checkout real. B does fix 2, then the users and orders routes and tabs (copy the Restaurants route and tab). C builds the Reviews screen (its endpoint is already real), then fix 1. D writes the ping simulator, then the Map screen against the mock route.

Some files are **shared**: `web/src/styles/tokens.css`, `web/src/components/ui/`, `web/src/api/endpoints.js`, `docs/api_endpoints.md` and `docker-compose.yml`. Tell the team before changing them, and keep those changes in small, separate commits.

### Mock data: build screens before the API is finished

Every endpoint in `docs/api_endpoints.md` already answers. Routes marked `MOCK` return sample data in the **final** shape, so a screen built against them keeps working when its owner switches the route to real queries.

- Mock responses carry the header `X-Mock: true`, and the browser console logs `[mock data] GET /users`.
- Checkout's mock can show both failures: an amount over 5000 returns `402 INSUFFICIENT_BALANCE`, and `?simulate=active-order` returns `409 ACTIVE_ORDER_EXISTS`.
- Real so far: `GET /health`, `GET /users`, `GET /users/:id`, `GET /users/:id/audit`, `GET /orders`, `GET /orders/:id`, `GET /restaurants`, `GET /restaurants/:id`, `GET /reviews/stats`.

### Building a screen

1. Open your page in `web/src/pages/`. The `ScreenPlaceholder` on it lists what to build and which API functions to use. Delete it when the screen is done.
2. Fetch data with TanStack Query and the functions in `web/src/api/endpoints.js`. Never call `fetch` directly.
3. Wrap every query in `QueryState` so loading, empty and error states are handled.
4. Build from the components in `web/src/components/ui/` and the variables in `web/src/styles/tokens.css`, so all screens look the same.
5. Show `error.message` from failed requests as-is. The API already writes it for users.
6. `BrowsePage.jsx` (Restaurants tab) is the reference: search, pagination in the URL, `QueryState`, `DataTable`.

The web app reloads in the browser when you save a file.

### Making a route real

1. Open the route file in `api/src/routes/`. Each `MOCK` route has a `TODO` describing the query.
2. Follow `restaurants.js` (PostgreSQL list) or `reviews.js` (MongoDB pipeline). Use `$1` placeholders, never string-built SQL.
3. Use `withTransaction()` from `api/src/db/postgres.js` when several statements must succeed together (checkout).
4. Throw `ApiError` (or let PostgreSQL errors reach `lib/errors.js`) instead of sending error responses by hand.
5. Remove the `sendMock` call, and change the route's status to `REAL` in `docs/api_endpoints.md`.
6. Add a test in `api/tests/`.

The API restarts when you save a file.

### Changing the database

1. Put new SQL in **your own numbered file** so two people never edit the same script: A uses `sql/07_*.sql`, B `08`, C `09`, D `10`. Use `CREATE OR REPLACE`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and similar, so the file can run more than once. To change something from an older file (for example the audit trigger in `03`), redefine it in your file.
2. Seeder changes go in `data_generation/` (B: `postgres_seeder.py`, C: `mongo_seeder.py`, D: new `ping_simulator.py`).
3. Apply them with `docker compose run --rm seed`, or `docker compose run --rm -e RESET=1 seed` if tables or seed data changed.
4. Record the change and the reason in [Changes to the Inherited Code](#changes-to-the-inherited-code) and in `docs/handover_note.md`.
5. Tell the team to run the same seed command after they pull.

### Adding an npm package

Run it inside the container so `package.json` and `package-lock.json` update together:

```bash
docker compose exec web npm install some-package
docker compose exec api npm install some-package
```

Commit both files. If `package-lock.json` has a merge conflict, don't edit it by hand: take the version from `main`, then run the install command again.

### Running the API or web app outside Docker (optional)

If you have Node.js 20 or later, you can run the API and web app directly for faster reloads. Keep the databases in Docker:

```bash
docker compose up -d postgres mongo seed     # databases only
docker compose stop api web                  # free ports 4000 and 5173 if they were running

cd api && npm install && npm run dev         # terminal 1
cd web && npm install && npm run dev         # terminal 2
```

The defaults in `api/src/config.js` already point at the Docker databases on ports 15432 and 37017.

### Tests

```bash
docker compose exec api npm test   # API: error mapping (unit) + endpoints against the seeded databases
docker compose exec web npm test   # Web: component tests with Testing Library
```

The issue #9 database regression script runs against an initialized PostgreSQL database and rolls back its fixtures. With Docker running, use this from PowerShell:

```powershell
Get-Content -Raw sql/tests/order_status_and_topup.sql | docker compose exec -T postgres psql -X -U postgres -d bitestream -v ON_ERROR_STOP=1
```

macOS, Linux or WSL:

```bash
docker compose exec -T postgres psql -X -U postgres -d bitestream -v ON_ERROR_STOP=1 < sql/tests/order_status_and_topup.sql
```

Or with a local psql connection: `psql -X -d bitestream -v ON_ERROR_STOP=1 -f sql/tests/order_status_and_topup.sql`.
The script checks both procedures, their errors, exact CREDIT audit rows, and checkout before and after delivery.

Example calls (replace the UUID placeholders with existing IDs):

```sql
CALL sp_wallet_topup('USER_UUID', 100.00);
CALL sp_advance_order_status('ORDER_UUID'); -- PREPARING -> DELIVERING
CALL sp_advance_order_status('ORDER_UUID'); -- DELIVERING -> DELIVERED
```

Top-ups must be positive and finite, and round to at least 0.01. Values are rounded to two decimal places to match the wallet; exceeding its `DECIMAL(10,2)` capacity fails without changing the wallet or audit history. Both procedures participate in the caller's transaction.

### Git workflow

- Never commit straight to `main`. Make a branch per task: `git checkout -b feature/checkout-form`.
- Pull `main` at least once a day: `git pull origin main`, then merge it into your branch.
- Open a pull request into `main`; another member reviews it before merging.
- Commit messages say what changed: "Add wallet date filter", not "update".

## Project Structure

```text
ssd_assignment_1b/
├── README.md
├── docker-compose.yml           # postgres, mongo, seed, api, web (+ adminer, mongo-express)
├── .env.example                 # copy to .env to change ports / seed size
├── docker/seed/                 # seed image + script (runs sql/, mongo/, data_generation/)
├── docs/
│   ├── handover_note.md         # what we inherited, what we fixed
│   ├── api_endpoints.md         # API contract (shapes, errors, REAL/MOCK status)
│   └── design/                  # users, wireframes, visual language
├── sql/  mongo/  data_generation/  performance/   # from Assignment 1 (+ our fixes)
├── api/                         # Express API
│   ├── src/
│   │   ├── app.js               # builds the Express app
│   │   ├── index.js             # starts the server
│   │   ├── config.js            # DB connection settings (env vars)
│   │   ├── db/                  # postgres.js (pool, withTransaction), mongo.js
│   │   ├── lib/                 # errors.js (friendly DB errors), pagination.js
│   │   ├── middleware/          # error handler
│   │   ├── routes/              # one file per area
│   │   └── mocks.js             # sample data for routes not built yet
│   └── tests/
└── web/                         # React + Vite front end
    └── src/
        ├── api/                 # client.js (fetch wrapper), endpoints.js (one function per endpoint)
        ├── components/          # Layout, ActorSwitcher
        │   └── ui/              # shared components: Button, Card, DataTable, QueryState, ...
        ├── context/             # ActorContext ("acting as" for the demo)
        ├── hooks/  lib/         # useDebouncedValue, formatting helpers
        ├── pages/               # one file per screen
        └── styles/              # tokens.css (design tokens), base.css, components.css
```

## Tech Choices

| Choice | Why |
| --- | --- |
| **Node.js + Express** for the API | One language (JavaScript) across API and UI, so any member can work on either. Express is small and well known. The API stays thin: the database does the real work through procedures, triggers, views and pipelines. |
| **`pg` and the official `mongodb` driver** | Direct, parameterised SQL and native aggregation pipelines, with no ORM hiding what runs. |
| **React + Vite** | Widely known, fast dev server with instant reload, simple build. |
| **TanStack Query** | Handles loading, error, caching and polling (`refetchInterval` for the map) with little code. |
| **React Router** | Each screen has its own URL, so pages and filters can be bookmarked and the back button works. |
| **Recharts** | React-friendly charts for the revenue trend and review breakdowns. |
| **Leaflet + react-leaflet with OpenStreetMap** | Free map tiles with no API key, so anyone can run the project. |
| **Plain CSS with design tokens** | No extra framework to learn. Shared variables keep the look consistent across screens built by different people. |
| **Vitest, Supertest, Testing Library** | One test runner for API and web; tests run against the real seeded databases. |
| **Docker Compose** | One command starts the whole system with identical data on every machine. |

## Assumptions

1. There is no real login. The "Acting as" switcher in the header picks the customer, restaurant or dispatcher role for the demo.
2. Prices are in Indian rupees (₹).
3. The checkout total is calculated in the browser from the menu; `sp_execute_checkout` charges that amount. The procedure does not check prices against the menu.
4. Orders move only forward: Preparing → Delivering → Delivered. There is no cancellation, because the inherited schema has no such status.
5. Seeded wallets start at ₹0 and get one opening CREDIT (their starting balance) 30 days ago, before any order, so each customer's audit trail explains their whole balance.
6. Dates in filters (the Wallet screen's from/to) are Indian calendar days (`Asia/Kolkata`). The database stores UTC; the app shows times in the browser's time zone.
7. _Add more as you make decisions._

## Changes to the Inherited Code

| Change | Files | Why |
| --- | --- | --- |
| Order status advance and wallet top-up (issue #9) | `sql/07_order_status_and_topup.sql`, `sql/tests/order_status_and_topup.sql` | Adds forward-only status transitions and atomic wallet credits through the existing audit trigger. Enables ordering again after delivery and recovering from insufficient balance. Apply with `docker compose run --rm seed`; no reset needed. |
| Docker development environment | `docker-compose.yml`, `docker/seed/`, `.env.example`, `.dockerignore` | One command gives everyone the same databases and seeded data. |
| Unix line endings for shell scripts | `.gitattributes` | The seed script must run in Linux containers when checked out on Windows. |
| README restructured | `README.md` | Added setup, team workflow and Assignment 2 sections; Assignment 1 text kept unchanged below. |
| Seed runs every numbered SQL file (except `06`) | `docker/seed/seed.sh` | So new scripts (`sql/07`–`10`) are applied without editing the seed. |
| Index `idx_orders_created_at` on `orders(created_at DESC, id DESC)` | `sql/08_orders_recent_index.sql` | Browse lists orders newest first. Without it every page scanned and sorted all 120,000 orders (128 ms); with it, 1.5 ms. |
| Wallet audit rows can be ordered: `seq` column, trigger uses `clock_timestamp()`, seeder dates each row with its order's time | `sql/08_audit_ordering.sql`, `data_generation/postgres_seeder.py` | The trigger used `NOW()` (transaction start) and the seeder ran in one transaction, so all 120,000 audit rows shared one timestamp: no date filter or running balance was possible. Now rows span 30 days and every customer's balances chain by `seq`. `seq` orders rows but can have gaps (rolled-back changes use numbers). After pulling, reseed with `RESET=1`. |
| _Whoever makes a fix: add it here_ | | |

## Contribution

Names and roll numbers are in the [Team](#team) table. Before submitting, describe what each member actually did, design and code, so the grader can see the split.

| Member | Contribution |
| --- | --- |
| A | |
| B | |
| C | |
| D | |

---

# Assignment 1 Documentation (inherited)

Everything below is the original Assignment 1 README, kept as it was. Where it differs from the sections above (for example, setup steps), the sections above are current.

## 1. Project Objectives

The main objectives of BiteStream are:

* Design a relational PostgreSQL database for transactional data.
* Design MongoDB collections for flexible and high-volume data.
* Implement automatic wallet audit logging using PostgreSQL triggers.
* Prevent users from having multiple active deliveries using a partial unique index.
* Build a materialized view for restaurant-level revenue analytics.
* Implement an atomic checkout workflow.
* Analyze restaurant revenue using CTEs and window functions.
* Store and query real-time driver locations using MongoDB GeoJSON.
* Automatically expire old driver telemetry using MongoDB TTL indexes.
* Find nearby active drivers using `$geoNear`.
* Perform review analytics using `$facet` and `$unwind`.
* Generate large datasets for testing database performance.
* Capture execution plans and statistics for performance analysis.

---

# 2. Technology Stack

| Component           | Technology            |
| ------------------- | --------------------- |
| Relational Database | PostgreSQL            |
| Document Database   | MongoDB               |
| SQL                 | PostgreSQL / PL/pgSQL |
| NoSQL               | MongoDB JavaScript    |
| Data Generation     | Python                |
| Version Control     | Git / GitHub          |
| PostgreSQL Driver   | psycopg2              |
| MongoDB Driver      | PyMongo               |
| Geospatial Format   | GeoJSON               |
| Documentation       | Markdown              |

---

# 3. Repository Structure

```text
BiteStream/
│
├── README.md
│
├── docs/
│   ├── relational_erd.png
│   └── mongo_schema_map.json
│
├── sql/
│   ├── 01_schema_ddl.sql
│   ├── 02_indexes.sql
│   ├── 03_triggers_and_audit.sql
│   ├── 04_stored_procedures.sql
│   ├── 05_materialized_views.sql
│   └── 06_window_analytics.sql
│
├── mongo/
│   ├── 01_collections_and_indexes.js
│   ├── 02_workflow3_geonear.js
│   └── 03_workflow4_facet.js
│
├── data_generation/
│   ├── postgres_seeder.py
│   ├── mongo_seeder.py
│   └── requirements.txt
│
└── performance/
    ├── postgres_explain_analyzes.txt
    └── mongo_execution_stats.json
```

---

# 4. PostgreSQL Architecture

PostgreSQL is used for data that requires strong relational consistency and transactional operations.

## Tables

### `users`

Stores customer information and wallet balances.

Important fields:

```text
id
name
wallet_balance
```

The wallet balance has a database-level constraint ensuring that it cannot become negative.

---

### `wallet_audit_logs`

Stores an immutable history of wallet changes.

Important fields:

```text
id
user_id
amount_changed
action_type
balance_after
changed_at
```

`action_type` can be:

```text
DEBIT
CREDIT
```

Wallet changes are automatically recorded by a PostgreSQL trigger.

---

### `restaurants`

Stores restaurant information and geographical coordinates.

```text
id
name
latitude
longitude
```

Latitude and longitude constraints ensure that valid geographical coordinate ranges are used.

---

### `orders`

Stores food delivery orders.

```text
id
user_id
restaurant_id
total_amount
status
created_at
```

Valid order states are:

```text
PREPARING
DELIVERING
DELIVERED
```

---

# 5. PostgreSQL Features

## 5.1 Wallet Audit Trigger

The trigger defined in:

```text
sql/03_triggers_and_audit.sql
```

automatically executes whenever a user's wallet balance changes.

For example:

```text
Old balance: 1000
New balance: 700
```

The trigger records:

```text
amount_changed = 300
action_type    = DEBIT
balance_after  = 700
```

This avoids relying on application code to manually create audit records.

The audit table is also protected against direct `UPDATE` and `DELETE` operations.

---

# 6. Partial Unique Index

The following index is defined in:

```text
sql/02_indexes.sql
```

Conceptually:

```sql
CREATE UNIQUE INDEX ...
ON orders(user_id)
WHERE status IN ('PREPARING', 'DELIVERING');
```

This ensures that a user cannot have more than one active delivery at the same time.

For example:

```text
User A → PREPARING
User A → DELIVERING
```

is not permitted.

However:

```text
User A → DELIVERED
User A → PREPARING
```

is permitted because the previous order is no longer active.

---

# 7. Materialized View

The materialized view is defined in:

```text
sql/05_materialized_views.sql
```

It summarizes completed orders for each restaurant.

The view contains:

```text
restaurant_id
restaurant_name
completed_order_count
completed_revenue
```

Only orders with:

```text
status = 'DELIVERED'
```

are included in completed-order statistics.

A unique index on `restaurant_id` allows the materialized view to be refreshed concurrently.

The refresh procedure is:

```text
sp_refresh_restaurant_summary()
```

---

# 8. Atomic Checkout 

The checkout logic is implemented in:

```text
sql/04_stored_procedures.sql
```

The workflow performs the following operations:

```text
1. Validate checkout amount
2. Locate the user
3. Lock the wallet row
4. Verify sufficient balance
5. Deduct wallet balance
6. Trigger wallet audit logging
7. Insert the order
8. Commit the transaction
```

The wallet update and order creation are intended to occur within the same transaction so that a failed checkout does not leave the database in an inconsistent state.

The user row is locked using:

```sql
SELECT ...
FOR UPDATE;
```

This helps prevent concurrent checkout operations from spending the same wallet balance.

---

# 9. Window Analytics

The SQL analytics workflow is implemented in:

```text
sql/06_window_analytics.sql
```

It uses:

* CTEs
* `AVG() OVER`
* `DENSE_RANK()`
* Partitioning
* Ordering
* Seven-row moving windows

The analysis calculates:

### Daily restaurant revenue

Revenue is grouped by restaurant and date.

### Seven-day moving average

A rolling average is calculated using the current day and the preceding six available rows.

### Restaurant ranking

Restaurants are ranked according to total completed revenue using:

```sql
DENSE_RANK()
```

---

# 10. MongoDB Architecture

MongoDB is used for flexible and high-volume data.

The project contains three major collections:

```text
Menus
Reviews
DriverPings
```

---

# 11. Menus Collection

Menus contain flexible nested documents.

A menu can contain:

```text
Restaurant
    └── Categories
          └── Items
                └── Customization Add-ons
```

Example structure:

```json
{
  "restaurantId": "...",
  "restaurantName": "...",
  "categories": [
    {
      "name": "Main Course",
      "items": [
        {
          "name": "Example Item",
          "price": 250,
          "available": true,
          "customizationAddOns": [
            {
              "name": "Extra Cheese",
              "price": 40
            }
          ]
        }
      ]
    }
  ]
}
```

---

# 12. Reviews Collection

Reviews contain:

```text
restaurantId
orderId
userId
rating
reviewText
sentimentTags
createdAt
```

Ratings are restricted to:

```text
1–5
```

Sentiment tags are stored as an array so that a review can contain multiple tags.

Example:

```json
{
  "rating": 5,
  "sentimentTags": [
    "positive",
    "good_food",
    "fast_delivery"
  ]
}
```

---

# 13. DriverPings Collection

`DriverPings` stores real-time driver location information.

The location uses GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [
    77.5946,
    12.9716
  ]
}
```

Important:

```text
coordinates = [longitude, latitude]
```

---

# 14. MongoDB Indexes

## 14.1 2dsphere Index

The following index is created on:

```text
DriverPings.location
```

This enables efficient geographical queries.

It is used by the `$geoNear` workflow.

---

## 14.2 TTL Index

A TTL index is created on:

```text
DriverPings.createdAt
```

with:

```text
expireAfterSeconds = 7200
```

7200 seconds equals:

```text
2 hours
```

This allows old driver telemetry to be automatically removed by MongoDB.

---

# 15. Workflow 3 – Nearest Active Driver

Implementation:

```text
mongo/02_workflow3_geonear.js
```

The workflow uses MongoDB's:

```text
$geoNear
```

aggregation stage.

The query:

1. Receives a restaurant coordinate.
2. Searches for active drivers.
3. Limits the search radius to 5 km.
4. Calculates distance.
5. Sorts results by proximity.
6. Returns the closest driver.

Distance is returned in meters.

---

# 16. Workflow 4 – Review Analytics

Implementation:

```text
mongo/03_workflow4_facet.js
```

The workflow uses:

```text
$facet
```

to perform multiple analytics operations in one aggregation.

It calculates:

### Rating distribution

Counts reviews for:

```text
1 star
2 stars
3 stars
4 stars
5 stars
```

### Tag frequency

`$unwind` expands the sentiment tag array and calculates the frequency of individual tags.

### Overall rating

Calculates:

```text
average rating
total reviews
```

---

# 17. Data Generation

The project includes Python scripts for generating large datasets.

## PostgreSQL

File:

```text
data_generation/postgres_seeder.py
```

The script can generate:

* 10,000+ users
* 500+ restaurants
* 100,000+ orders
* corresponding wallet audit records

Example:

```bash
python data_generation/postgres_seeder.py \
    --users 10000 \
    --restaurants 500 \
    --orders 120000
```

The wallet audit records are generated automatically through the PostgreSQL wallet trigger.

---

## MongoDB

File:

```text
data_generation/mongo_seeder.py
```

The script generates:

* menu documents
* review documents
* 500,000+ driver telemetry records

Example:

```bash
python data_generation/mongo_seeder.py \
    --pings 500000
```

---

# 18. Installation

## Prerequisites

Install:

```text
PostgreSQL
MongoDB
Python 3
Git
```

Verify Python:

```bash
python --version
```

Verify PostgreSQL:

```bash
psql --version
```

Verify MongoDB:

```bash
mongosh --version
```

---

# 19. Python Dependencies

Install the required Python packages:

```bash
pip install -r data_generation/requirements.txt
```

The dependencies include:

```text
psycopg2-binary
pymongo
```

---

# 20. PostgreSQL Setup

Create a database:

```sql
CREATE DATABASE bitestream;
```

Connect to it:

```bash
psql -d bitestream
```

Run the SQL files in order:

```text
01_schema_ddl.sql
02_indexes.sql
03_triggers_and_audit.sql
04_stored_procedures.sql
05_materialized_views.sql
06_window_analytics.sql
```

Recommended execution order:

```bash
psql -d bitestream -f sql/01_schema_ddl.sql
psql -d bitestream -f sql/02_indexes.sql
psql -d bitestream -f sql/03_triggers_and_audit.sql
psql -d bitestream -f sql/04_stored_procedures.sql
psql -d bitestream -f sql/05_materialized_views.sql
```

Run analytics when required:

```bash
psql -d bitestream -f sql/06_window_analytics.sql
```

---

# 21. MongoDB Setup

Start MongoDB and connect using:

```bash
mongosh
```

Select the database:

```javascript
use bitestream
```

Run:

```text
mongo/01_collections_and_indexes.js
```

This creates the required collections, validation rules, and indexes.

Then the workflows can be executed:

```text
mongo/02_workflow3_geonear.js
mongo/03_workflow4_facet.js
```

---

# 22. Environment Variables

The PostgreSQL seeder supports:

```text
PGHOST
PGPORT
PGDATABASE
PGUSER
PGPASSWORD
```

Example:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=bitestream
export PGUSER=postgres
export PGPASSWORD=your_password
```

MongoDB supports:

```text
MONGO_URI
MONGO_DB
```

Example:

```bash
export MONGO_URI=mongodb://localhost:27017
export MONGO_DB=bitestream
```

Credentials should **not** be committed to GitHub.

---

# 23. Performance Analysis

The `performance/` directory stores database execution results.

## PostgreSQL

File:

```text
performance/postgres_explain_analyzes.txt
```

Use:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...
```

and store the actual output in the file.

The purpose is to compare query execution before and/or after indexing where appropriate.

---

## MongoDB

MongoDB aggregation queries can be analyzed using:

```javascript
.explain("executionStats")
```

The resulting execution statistics should be stored in:

```text
performance/mongo_execution_stats.json
```

The committed file should contain **actual generated execution statistics**, rather than manually invented values.

---

# 24. Assumptions

The project uses the following assumptions:

1. PostgreSQL is responsible for transactional operations.
2. MongoDB is responsible for flexible document and telemetry data.
3. Wallet balances cannot become negative.
4. Wallet modifications generate audit records automatically.
5. Wallet audit records are immutable.
6. An active order is an order whose status is `PREPARING` or `DELIVERING`.
7. A user can have multiple historical `DELIVERED` orders.
8. Driver coordinates use GeoJSON `[longitude, latitude]` ordering.
9. Driver telemetry older than two hours can be removed automatically.
10. Completed restaurant revenue is calculated from `DELIVERED` orders.
11. The generated datasets are intended for database testing and performance experimentation.

---

# 25. Execution Flow

The recommended project workflow is:

```text
                    BiteStream
                        │
             ┌──────────┴──────────┐
             │                     │
        PostgreSQL              MongoDB
             │                     │
      ┌──────┴──────┐       ┌──────┴────────┐
      │             │       │               │
    Schema        Orders   Menus         DriverPings
      │             │       │               │
    Indexes       Wallet   Reviews       GeoJSON
      │             │                       │
   Trigger         Audit                  2dsphere
      │                                     │
 Materialized View                         TTL
      │                                     │
 Window Analytics                        $geoNear
                                          $facet
```

---

# 26. Team Collaboration

This project is designed to be developed collaboratively using Git and GitHub.

Each team member should work on a separate branch.

Example:

```bash
git checkout -b feature/schema
```

After completing a change:

```bash
git add .
git commit -m "Add PostgreSQL schema"
git push origin feature/schema
```

Then create a Pull Request on GitHub.

Suggested contribution areas:

```text
Member 1 → PostgreSQL schema + ERD
Member 2 → PostgreSQL advanced logic + analytics
Member 3 → MongoDB collections + workflows
Member 4 → Data generation + performance analysis + integration
```

The actual division should match the team's size and agreed responsibilities.

---

# 27. Git Commit Guidelines

Use descriptive commit messages.

Examples:

```text
Add PostgreSQL schema and constraints
Add active order partial index
Implement wallet audit trigger
Add atomic checkout procedure
Add restaurant revenue materialized view
Add SQL window analytics
Add MongoDB geospatial indexes
Implement nearest driver workflow
Implement review facet analytics
Add PostgreSQL data generator
Add MongoDB telemetry generator
Add execution plan results
Update project documentation
```

Avoid commits such as:

```text
update
changes
final
test
asdf
```

---

# 28. Validation Checklist

Before considering the project complete, verify:

### PostgreSQL

* [ ] `users` table exists.
* [ ] `restaurants` table exists.
* [ ] `orders` table exists.
* [ ] `wallet_audit_logs` table exists.
* [ ] Wallet `CHECK` constraint works.
* [ ] Foreign keys work.
* [ ] Order status constraint works.
* [ ] Partial unique index works.
* [ ] Wallet trigger creates audit records.
* [ ] Audit records cannot be updated/deleted.
* [ ] Atomic checkout works.
* [ ] Insufficient balance fails safely.
* [ ] Materialized view exists.
* [ ] Concurrent refresh works.
* [ ] Window analytics query runs successfully.

### MongoDB

* [ ] `Menus` collection exists.
* [ ] `Reviews` collection exists.
* [ ] `DriverPings` collection exists.
* [ ] GeoJSON location format is correct.
* [ ] `2dsphere` index exists.
* [ ] TTL index exists.
* [ ] Driver telemetry expires after the configured period.
* [ ] `$geoNear` workflow returns nearby active drivers.
* [ ] `$facet` workflow returns all required analytics.
* [ ] Large test data is generated successfully.

### Performance

* [ ] PostgreSQL `EXPLAIN ANALYZE` output captured.
* [ ] MongoDB `executionStats` captured.
* [ ] Performance observations documented.

---

# 29. Expected Learning Outcomes

After completing BiteStream, the team should understand:

* Relational schema design
* Primary and foreign keys
* Database constraints
* PostgreSQL triggers
* Audit logging
* Partial indexes
* Transaction management
* Row-level locking
* Materialized views
* Concurrent materialized-view refresh
* CTEs
* SQL window functions
* MongoDB document modeling
* MongoDB schema validation
* GeoJSON
* Geospatial indexes
* TTL indexes
* `$geoNear`
* `$facet`
* `$unwind`
* Database seeding
* Query execution plans
* Database performance analysis
* Git/GitHub team workflows

---

# 30. Project Status

```text
Project: BiteStream
Domain: Food Delivery & Real-Time Logistics

Databases:
    PostgreSQL
    MongoDB

Primary Focus:
    Database Engineering
    Transactions
    Indexing
    Auditing
    Analytics
    Geospatial Queries
    Performance
```

---

## License

This project is intended for educational and database-engineering practice purposes.
