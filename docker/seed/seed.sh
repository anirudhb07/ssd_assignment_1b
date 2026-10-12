#!/usr/bin/env bash
# Applies the SQL and Mongo scripts, then seeds each database if it is empty.
# Set RESET=1 to wipe both databases first.
set -euo pipefail

MONGO_DB_URI="${MONGO_URI}/${MONGO_DB}"

if [ "${RESET}" = "1" ]; then
    echo "==> RESET=1: dropping PostgreSQL schema and MongoDB database"
    psql -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    mongosh --quiet "${MONGO_DB_URI}" --eval "db.dropDatabase()" >/dev/null
fi

# Every numbered script, in order. 06 is a report query, not setup.
echo "==> Applying sql/ scripts"
for f in /work/sql/[0-9][0-9]_*.sql; do
    [ "$(basename "$f")" = "06_window_analytics.sql" ] && continue
    echo "    $(basename "$f")"
    PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 -q -f "$f"
done

users=$(psql -tAc "SELECT COUNT(*) FROM users")
if [ "${users}" = "0" ]; then
    echo "==> Seeding PostgreSQL"
    python3 /work/data_generation/postgres_seeder.py \
        --users "${SEED_USERS}" \
        --restaurants "${SEED_RESTAURANTS}" \
        --orders "${SEED_ORDERS}"
else
    echo "==> PostgreSQL already has ${users} users, skipping seed"
fi

echo "==> Applying mongo/01_collections_and_indexes.js"
mongosh --quiet "${MONGO_DB_URI}" /work/mongo/01_collections_and_indexes.js

menus=$(mongosh --quiet "${MONGO_DB_URI}" --eval "db.Menus.countDocuments()")
if [ "${menus}" = "0" ]; then
    echo "==> Seeding MongoDB"
    python3 /work/data_generation/mongo_seeder.py --pings "${SEED_PINGS}"
else
    echo "==> MongoDB already has ${menus} menus, skipping seed"
fi

echo "==> Done. PostgreSQL and MongoDB are ready."
