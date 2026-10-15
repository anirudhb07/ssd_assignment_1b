"""
BiteStream MongoDB Seeder

Generates:
    - menu documents (one per real Postgres restaurant)
    - review documents (one per real DELIVERED Postgres order)
    - 500,000+ DriverPings

IMPORTANT: run postgres_seeder.py first. Menus and reviews are linked to the
restaurants and delivered orders that already exist in Postgres.

Environment variables:

MONGO_URI
MONGO_DB
PGHOST
PGPORT
PGDATABASE
PGUSER
PGPASSWORD

Example:

python3 mongo_seeder.py --pings 500000
"""

import argparse
import os
import random
import uuid

from datetime import datetime, timedelta, timezone

import psycopg2
from pymongo import MongoClient


SENTIMENT_TAGS = [
    "positive",
    "negative",
    "fast_delivery",
    "late_delivery",
    "good_food",
    "poor_food",
    "friendly_driver",
    "packaging",
]


# =====================================================
# POSTGRES LINK
# =====================================================

def load_from_postgres():
    """
    Returns (restaurants, delivered_orders):

        restaurants      -> [(restaurant_id, name), ...]
        delivered_orders -> [(order_id, user_id, restaurant_id, created_at), ...]

    Both are ordered, so the same --seed gives the same output.
    """

    conn = psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "bitestream"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", ""),
    )

    try:
        cur = conn.cursor()

        cur.execute(
            "SELECT id::text, name FROM restaurants ORDER BY id"
        )
        restaurants = cur.fetchall()

        cur.execute(
            """
            SELECT id::text, user_id::text, restaurant_id::text, created_at
            FROM orders
            WHERE status = 'DELIVERED'
            ORDER BY created_at, id
            """
        )
        delivered = cur.fetchall()

        cur.close()
    finally:
        conn.close()

    if not restaurants or not delivered:
        raise SystemExit(
            "Postgres has no restaurants or delivered orders. "
            "Run postgres_seeder.py first."
        )

    return restaurants, delivered


# =====================================================
# DOCUMENT BUILDERS
# =====================================================

def create_menu(restaurant_id, restaurant_name):

    categories = []

    for category in ["Starters", "Main Course", "Desserts"]:

        items = []

        for i in range(random.randint(4, 8)):

            items.append({
                "name": f"{category} Item {i + 1}",
                "description": f"Fresh {category.lower()} item",
                "price": round(random.uniform(80, 600), 2),
                "available": random.random() > 0.05,
                "customizationAddOns": [
                    {"name": "Extra Cheese", "price": 40.0},
                    {"name": "Extra Spicy", "price": 10.0},
                ],
            })

        categories.append({
            "name": category,
            "items": items,
        })

    return {
        "restaurantId": restaurant_id,
        "restaurantName": restaurant_name,
        "categories": categories,
        "updatedAt": datetime.now(timezone.utc),
    }


def create_review(order):

    order_id, user_id, restaurant_id, order_created_at = order

    rating = random.randint(1, 5)

    if rating >= 4:
        tags = random.sample(
            ["positive", "good_food", "fast_delivery", "friendly_driver"],
            random.randint(1, 3),
        )
    else:
        tags = random.sample(
            ["negative", "poor_food", "late_delivery", "packaging"],
            random.randint(1, 3),
        )

    # A review is written after its order, never before it,
    # and never in the future.
    created_at = min(
        order_created_at + timedelta(hours=random.randint(1, 48)),
        datetime.now(timezone.utc),
    )

    return {
        "orderId": order_id,
        "userId": user_id,
        "restaurantId": restaurant_id,
        "rating": rating,
        "reviewText": f"Sample review with rating {rating}",
        "sentimentTags": tags,
        "createdAt": created_at,
    }


def create_driver_ping(driver_id):

    # Bengaluru-like area.
    latitude = 12.9716 + random.uniform(-0.08, 0.08)
    longitude = 77.5946 + random.uniform(-0.08, 0.08)

    created_at = (

        datetime.now(
            timezone.utc
        )

        - timedelta(
            seconds=random.randint(
                0,
                1 * 60 * 60
            )
        )
    )

    return {
        "driverId": driver_id,
        "active": random.random() > 0.20,
        "location": {
            "type": "Point",
            # IMPORTANT: GeoJSON = [longitude, latitude]
            "coordinates": [longitude, latitude],
        },
        "createdAt": created_at,
    }


# =====================================================
# SEEDING
# =====================================================

def seed_database(
    ping_count,
    menu_count,
    review_count,
    batch_size,
    random_seed,
):

    random.seed(random_seed)

    client = MongoClient(
        os.getenv("MONGO_URI", "mongodb://localhost:27017")
    )

    database = client[os.getenv("MONGO_DB", "bitestream")]

    menus = database["Menus"]
    reviews = database["Reviews"]
    driver_pings = database["DriverPings"]

    # Idempotency check: don't duplicate documents if already seeded.
    # To re-seed (e.g. after switching from random IDs to Postgres-linked
    # data), clear the old collections first:
    #   db.Menus.deleteMany({}); db.Reviews.deleteMany({}); db.DriverPings.deleteMany({})
    existing_menus = menus.count_documents({})
    if existing_menus > 0:
        print(
            f"MongoDB already has {existing_menus:,} menus. "
            "Skipping seed to remain idempotent."
        )
        client.close()
        return

    # =================================================
    # READ REAL DATA FROM POSTGRES
    # =================================================

    print("Reading restaurants and delivered orders from Postgres...")

    restaurants, delivered = load_from_postgres()

    print(
        f"Postgres: {len(restaurants):,} restaurants, "
        f"{len(delivered):,} delivered orders"
    )

    # =================================================
    # MENUS
    # =================================================

    print("Generating menus...")

    # menu_count=None means "one menu per restaurant".
    if menu_count is not None:
        restaurants = random.sample(
            restaurants,
            min(menu_count, len(restaurants)),
        )

    menu_documents = [
        create_menu(restaurant_id, restaurant_name)
        for restaurant_id, restaurant_name in restaurants
    ]

    menus.insert_many(menu_documents, ordered=False)

    print(f"Menus inserted: {len(menu_documents):,}")

    # =================================================
    # REVIEWS
    # =================================================

    print("Generating reviews...")

    # Only review orders from restaurants that have a menu,
    # and at most one review per order (sample without replacement).
    menu_restaurant_ids = {restaurant_id for restaurant_id, _ in restaurants}

    eligible = [
        order for order in delivered
        if order[2] in menu_restaurant_ids
    ]

    chosen = random.sample(
        eligible,
        min(review_count, len(eligible)),
    )

    if len(chosen) < review_count:
        print(
            f"Only {len(eligible):,} delivered orders available; "
            f"creating {len(chosen):,} reviews instead of {review_count:,}."
        )

    review_documents = [create_review(order) for order in chosen]

    # Enforce one review per order.
    reviews.create_index("orderId", unique=True)

    for start in range(0, len(review_documents), batch_size):
        reviews.insert_many(
            review_documents[start:start + batch_size],
            ordered=False,
        )

    print(f"Reviews inserted: {len(review_documents):,}")

    # =================================================
    # DRIVER PINGS
    # =================================================

    print(f"Generating {ping_count:,} DriverPings...")

    driver_count = max(100, ping_count // 1000)

    drivers = [f"driver-{i + 1:06d}" for i in range(driver_count)]

    batch = []

    for i in range(ping_count):

        batch.append(create_driver_ping(random.choice(drivers)))

        if len(batch) >= batch_size:
            driver_pings.insert_many(batch, ordered=False)
            batch.clear()

        if (i + 1) % (batch_size * 10) == 0:
            print(f"DriverPings inserted: {i + 1:,}/{ping_count:,}")

    if batch:
        driver_pings.insert_many(batch, ordered=False)

    print(f"DriverPings inserted: {ping_count:,}")

    # =================================================
    # SANITY CHECKS
    # =================================================

    pg_restaurant_ids = {r[0] for r in restaurants}

    orphan_menus = menus.count_documents(
        {"restaurantId": {"$nin": list(pg_restaurant_ids)}}
    )
    distinct_orders = len(reviews.distinct("orderId"))
    total_reviews = reviews.count_documents({})

    assert orphan_menus == 0, f"{orphan_menus} menus have unknown restaurant IDs"
    assert distinct_orders == total_reviews, "duplicate reviews for an order"

    print()
    print("==============================")
    print("MONGODB SEEDING COMPLETE")
    print("==============================")
    print(f"Menus:        {menus.count_documents({}):,}")
    print(f"Reviews:      {total_reviews:,}")
    print(f"DriverPings:  {driver_pings.count_documents({}):,}")

    client.close()


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument("--pings", type=int, default=500000)

    # Default None = one menu for every Postgres restaurant.
    parser.add_argument("--menus", type=int, default=None)

    parser.add_argument("--reviews", type=int, default=10000)

    parser.add_argument("--batch-size", type=int, default=5000)

    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()

    seed_database(
        ping_count=args.pings,
        menu_count=args.menus,
        review_count=args.reviews,
        batch_size=args.batch_size,
        random_seed=args.seed,
    )


if __name__ == "__main__":
    main()