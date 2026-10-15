"""
BiteStream PostgreSQL Seeder

Generates:
    - 10,000+ users
    - 500+ restaurants
    - 100,000+ orders
    - wallet audit records automatically through the trigger

Wallet history (issue #6): every user starts at 0 and gets one opening
CREDIT 30 days ago, then one DEBIT per order in time order. Each audit row
is dated with its order's created_at through the bitestream.audit_at
setting read by fn_wallet_audit() (sql/08_audit_ordering.sql).

Environment variables:

PGHOST
PGPORT
PGDATABASE
PGUSER
PGPASSWORD

Example:

python3 postgres_seeder.py --users 10000 --restaurants 500 --orders 120000
"""

import argparse
import os
import random
import uuid

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import psycopg2
from psycopg2.extras import execute_batch, execute_values


def get_connection():

    return psycopg2.connect(

        host=os.getenv(
            "PGHOST",
            "localhost"
        ),

        port=int(
            os.getenv(
                "PGPORT",
                "5432"
            )
        ),

        dbname=os.getenv(
            "PGDATABASE",
            "bitestream"
        ),

        user=os.getenv(
            "PGUSER",
            "postgres"
        ),

        password=os.getenv(
            "PGPASSWORD",
            ""
        )
    )


def chunks(data, size):

    for i in range(
        0,
        len(data),
        size
    ):

        yield data[
            i:i + size
        ]


def seed_database(
    users_count,
    restaurants_count,
    orders_count,
    batch_size,
    random_seed
):

    random.seed(random_seed)

    # One reference time, so every order falls inside the 30-day window
    # and after the opening credits.
    now = datetime.now(
        timezone.utc
    )

    opening_at = now - timedelta(
        days=30
    )

    connection = get_connection()

    connection.autocommit = False

    try:

        cursor = connection.cursor()

        # Idempotency check: don't duplicate rows if already seeded
        cursor.execute("SELECT COUNT(*) FROM users;")
        existing_users = cursor.fetchone()[0]
        if existing_users > 0:
            print(f"PostgreSQL already has {existing_users:,} users. Skipping seed to remain idempotent.")
            return

        # =================================================
        # USERS
        # =================================================

        print("Generating users...")

        users = []

        balances = {}

        for _ in range(users_count):

            user_id = str(
                uuid.uuid4()
            )

            balance = Decimal(
                random.randint(
                    5000,
                    100000
                )
            )

            # Inserted at 0; the opening CREDIT below brings the wallet
            # to its starting balance, so the trigger records it.
            users.append(
                (
                    user_id,
                    f"User-{user_id[:8]}",
                    Decimal("0")
                )
            )

            balances[user_id] = balance


        for batch in chunks(
            users,
            batch_size
        ):

            execute_values(

                cursor,

                """
                INSERT INTO users
                    (id, name, wallet_balance)
                VALUES %s
                """,

                batch
            )


        print(
            f"Users inserted: {len(users):,}"
        )

        # Each user's opening CREDIT. Grows if a user needs a top-up below.
        opening = dict(balances)


        # =================================================
        # RESTAURANTS
        # =================================================

        print(
            "Generating restaurants..."
        )

        restaurants = []

        for i in range(
            restaurants_count
        ):

            latitude = random.uniform(
                12.80,
                13.10
            )

            longitude = random.uniform(
                77.45,
                77.75
            )

            restaurants.append(

                (
                    str(uuid.uuid4()),

                    f"Restaurant-{i + 1}",

                    latitude,

                    longitude
                )
            )


        for batch in chunks(
            restaurants,
            batch_size
        ):

            execute_values(

                cursor,

                """
                INSERT INTO restaurants
                    (id, name, latitude, longitude)
                VALUES %s
                """,

                batch
            )


        restaurant_ids = [
            restaurant[0]
            for restaurant in restaurants
        ]

        user_ids = list(
            balances.keys()
        )


        print(
            f"Restaurants inserted: "
            f"{len(restaurants):,}"
        )


        # =================================================
        # ORDERS (generated in memory first)
        # =================================================

        print(
            f"Generating {orders_count:,} orders..."
        )

        orders = []

        active_status_users = set()

        for _ in range(
            orders_count
        ):

            # Find a user with enough money.

            for _attempt in range(20):

                user_id = random.choice(
                    user_ids
                )

                amount = Decimal(
                    random.randint(
                        100,
                        2500
                    )
                )

                if (
                    balances[user_id]
                    >= amount
                ):
                    break

            else:

                # Add credit if necessary. It is folded into the
                # user's opening CREDIT, which comes before all of
                # their orders, so the wallet never goes negative
                # when the orders are applied in time order.

                user_id = random.choice(
                    user_ids
                )

                credit = Decimal(
                    "10000"
                )

                balances[user_id] += credit

                opening[user_id] += credit

                amount = Decimal(
                    random.randint(
                        100,
                        2500
                    )
                )

            if user_id in active_status_users:
                status = "DELIVERED"
            else:
                status = random.choices(
                    ["DELIVERED", "PREPARING", "DELIVERING"],
                    weights=[80, 10, 10],
                    k=1
                )[0]

                if status != "DELIVERED":
                    active_status_users.add(user_id)

            balances[user_id] -= amount


            order_id = str(
                uuid.uuid4()
            )

            restaurant_id = random.choice(
                restaurant_ids
            )


            created_at = (

                now

                - timedelta(
                    days=random.randint(
                        0,
                        29
                    ),

                    seconds=random.randint(
                        0,
                        86399
                    )
                )
            )


            orders.append(
                (
                    order_id,
                    user_id,
                    restaurant_id,
                    amount,
                    status,
                    created_at
                )
            )


        # Apply orders oldest first, so each user's audit rows get
        # increasing seq values in the same order as their times.

        orders.sort(
            key=lambda order: order[5]
        )


        # =================================================
        # OPENING CREDITS
        # =================================================

        # One statement; the trigger writes one CREDIT per user,
        # dated opening_at.

        cursor.execute(
            "SELECT set_config('bitestream.audit_at', %s, true)",
            (
                opening_at.isoformat(),
            )
        )

        execute_values(

            cursor,

            """
            UPDATE users AS u
            SET wallet_balance = v.balance
            FROM (VALUES %s) AS v(id, balance)
            WHERE u.id = v.id
            """,

            list(opening.items()),

            template="(%s::uuid, %s::numeric)",

            page_size=batch_size
        )


        print(
            f"Opening credits: {len(opening):,}"
        )


        # =================================================
        # DEBITS AND ORDERS, OLDEST FIRST
        # =================================================

        inserted_orders = 0

        for batch in chunks(
            orders,
            batch_size
        ):

            # Each debit is dated with its order's created_at.
            # set_config(..., true) lasts only until the commit.

            execute_batch(

                cursor,

                """
                SELECT set_config('bitestream.audit_at', %s, true);

                UPDATE users

                SET wallet_balance =
                    wallet_balance - %s

                WHERE id = %s
                """,

                [
                    (
                        created_at.isoformat(),
                        amount,
                        user_id
                    )
                    for (
                        _order_id,
                        user_id,
                        _restaurant_id,
                        amount,
                        _status,
                        created_at
                    ) in batch
                ],

                page_size=batch_size
            )


            # Insert orders.

            execute_values(

                cursor,

                """
                INSERT INTO orders (
                    id,
                    user_id,
                    restaurant_id,
                    total_amount,
                    status,
                    created_at
                )

                VALUES %s
                """,

                batch
            )


            inserted_orders += len(batch)


            if (
                inserted_orders
                % (batch_size * 5)
                == 0
                or inserted_orders
                == orders_count
            ):

                print(
                    f"Orders inserted: "
                    f"{inserted_orders:,}/"
                    f"{orders_count:,}"
                )


        connection.commit()


        # =================================================
        # MATERIALIZED VIEW
        # =================================================

        cursor.execute(
            """
            REFRESH MATERIALIZED VIEW
            restaurant_order_summary
            """
        )

        connection.commit()


        # =================================================
        # STATISTICS
        # =================================================

        cursor.execute(
            "SELECT COUNT(*) FROM users"
        )

        total_users = cursor.fetchone()[0]


        cursor.execute(
            "SELECT COUNT(*) FROM restaurants"
        )

        total_restaurants = cursor.fetchone()[0]


        cursor.execute(
            "SELECT COUNT(*) FROM orders"
        )

        total_orders = cursor.fetchone()[0]


        cursor.execute(
            "SELECT COUNT(*) FROM wallet_audit_logs"
        )

        total_audits = cursor.fetchone()[0]


        print()
        print("==============================")
        print("POSTGRESQL SEEDING COMPLETE")
        print("==============================")
        print(
            f"Users:         {total_users:,}"
        )
        print(
            f"Restaurants:   {total_restaurants:,}"
        )
        print(
            f"Orders:        {total_orders:,}"
        )
        print(
            f"Audit logs:    {total_audits:,}"
        )


        cursor.close()


    except Exception:

        connection.rollback()

        raise


    finally:

        connection.close()


def main():

    parser = argparse.ArgumentParser(
        description=
        "Generate BiteStream PostgreSQL data"
    )


    parser.add_argument(
        "--users",
        type=int,
        default=10000
    )


    parser.add_argument(
        "--restaurants",
        type=int,
        default=500
    )


    parser.add_argument(
        "--orders",
        type=int,
        default=120000
    )


    parser.add_argument(
        "--batch-size",
        type=int,
        default=2000
    )


    parser.add_argument(
        "--seed",
        type=int,
        default=42
    )


    args = parser.parse_args()


    seed_database(

        users_count=args.users,

        restaurants_count=args.restaurants,

        orders_count=args.orders,

        batch_size=args.batch_size,

        random_seed=args.seed
    )


if __name__ == "__main__":
    main()