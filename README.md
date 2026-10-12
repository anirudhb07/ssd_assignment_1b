# BiteStream – Food Delivery & Real-Time Logistics

BiteStream is a database-focused food delivery and real-time logistics system designed to demonstrate the use of **PostgreSQL** for structured transactional data and **MongoDB** for flexible documents, geospatial data, and analytics.

The project focuses on database engineering concepts including transaction processing, wallet auditing, partial indexing, materialized views, SQL window functions, MongoDB geospatial queries, TTL indexes, and multi-faceted aggregation.

---
## Repository

**GitHub Repository:** https://github.com/charmin-v/ssd_assignment_1

**Final Submission Commit:** `7022714778d3a1a8e6a39a619c7cdabc642db7e9`

## Development Setup (Docker)

Docker gives every team member the same PostgreSQL and MongoDB, with the same seeded data, without installing either database. You don't need PostgreSQL, MongoDB or Python on your machine.

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

### 3. Start the databases

```bash
docker compose up -d
```

The first run downloads the images and then seeds both databases, which takes a few minutes. To watch progress:

```bash
docker compose logs -f seed
```

Seeding is finished when the log shows `==> Done. PostgreSQL and MongoDB are ready.` and the seed container exits. Press `Ctrl+C` to stop following the log; the databases keep running.

### 4. Check the data loaded

```bash
docker compose exec postgres psql -U postgres -d bitestream -c "SELECT COUNT(*) FROM orders;"   # 120000
docker compose exec mongo mongosh bitestream --quiet --eval "db.Menus.countDocuments()"         # 500
```

### 5. Connect to the databases

| Service | From your machine (API, DB clients) | From another Compose service |
| --- | --- | --- |
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
| Wipe both databases and reseed | `docker compose run --rm -e RESET=1 seed` |
| Stop and delete all data | `docker compose down -v` |
| See what is running | `docker compose ps -a` |
| Open a SQL shell | `docker compose exec postgres psql -U postgres -d bitestream` |
| Open a Mongo shell | `docker compose exec mongo mongosh bitestream` |

### How the seed works

The `seed` service runs `sql/01`–`05`, then `mongo/01_collections_and_indexes.js`, then both seeders. It only seeds a database that is empty, so running `docker compose up -d` again won't duplicate data.

The `sql/`, `mongo/` and `data_generation/` folders are read straight from your copy of the repo. After you pull a teammate's changes:

- **Changed SQL procedures, triggers or views:** run `docker compose run --rm seed`. The scripts are applied again and existing data is kept.
- **Changed tables or seeders:** run `docker compose run --rm -e RESET=1 seed` to rebuild the data from scratch.
- **Changed `data_generation/requirements.txt` or `docker/seed/Dockerfile`:** run `docker compose build seed` first.

Driver pings expire 2 hours after they are created (TTL index). If the map shows no drivers, reset and reseed.

### Changing ports or seed size

Copy `.env.example` to `.env` and edit the values. `.env` is git-ignored, so your settings stay on your machine. Use smaller `SEED_*` numbers for a faster seed while developing.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop (or `sudo systemctl start docker` on Linux) and try again. |
| `permission denied ... docker.sock` (Linux) | Run `sudo usermod -aG docker $USER`, then log out and back in. |
| `Bind for 0.0.0.0:15432 failed: port is already allocated` | Something else uses that port. Set `PG_HOST_PORT` (or `MONGO_HOST_PORT`, `ADMINER_HOST_PORT`, `MONGO_EXPRESS_HOST_PORT`) to a free port in `.env`. |
| Seed fails with `$'\r': command not found` or `invalid option` (Windows) | Git converted `docker/seed/seed.sh` to Windows line endings. Run `git config core.autocrlf input`, delete `docker/seed/seed.sh`, run `git checkout docker/seed/seed.sh`, then start again. |
| Seed container exited with an error | Run `docker compose logs seed` to see which script failed. |
| Data looks wrong or half-loaded | Run `docker compose run --rm -e RESET=1 seed`. |

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

# 8. Atomic Checkout Workflow

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
