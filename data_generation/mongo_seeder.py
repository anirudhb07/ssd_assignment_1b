"""
BiteStream MongoDB Seeder

Generates:
    - menu documents
    - review documents
    - 500,000+ DriverPings

Environment variables:

MONGO_URI
MONGO_DB

Example:

python3 mongo_seeder.py --pings 500000
"""

import argparse
import os
import random
import uuid

from datetime import datetime, timedelta, timezone

from pymongo import MongoClient


SENTIMENT_TAGS = [

    "positive",

    "negative",

    "fast_delivery",

    "late_delivery",

    "good_food",

    "poor_food",

    "friendly_driver",

    "packaging"
]


def create_menu(
    restaurant_id
):

    categories = []


    for category in [

        "Starters",

        "Main Course",

        "Desserts"

    ]:

        items = []


        for i in range(
            random.randint(4, 8)
        ):

            items.append({

                "name":
                    f"{category} Item {i + 1}",

                "description":
                    f"Fresh {category.lower()} item",

                "price":
                    round(
                        random.uniform(
                            80,
                            600
                        ),
                        2
                    ),

                "available":
                    random.random() > 0.05,

                "customizationAddOns": [

                    {
                        "name":
                            "Extra Cheese",

                        "price":
                            40.0
                    },

                    {
                        "name":
                            "Extra Spicy",

                        "price":
                            10.0
                    }

                ]
            })


        categories.append({

            "name": category,

            "items": items

        })


    return {

        "restaurantId":
            restaurant_id,

        "restaurantName":
            f"Restaurant-{restaurant_id[:8]}",

        "categories":
            categories,

        "updatedAt":
            datetime.now(
                timezone.utc
            )
    }


def create_review(
    restaurant_id
):

    rating = random.randint(
        1,
        5
    )


    if rating >= 4:

        tags = random.sample(

            [
                "positive",
                "good_food",
                "fast_delivery",
                "friendly_driver"
            ],

            random.randint(
                1,
                3
            )
        )

    else:

        tags = random.sample(

            [
                "negative",
                "poor_food",
                "late_delivery",
                "packaging"
            ],

            random.randint(
                1,
                3
            )
        )


    return {

        "orderId":
            str(uuid.uuid4()),

        "userId":
            str(uuid.uuid4()),

        "restaurantId":
            restaurant_id,

        "rating":
            rating,

        "reviewText":
            f"Sample review with rating {rating}",

        "sentimentTags":
            tags,

        "createdAt":

            datetime.now(
                timezone.utc
            )

            - timedelta(
                days=random.randint(
                    0,
                    30
                )
            )
    }


def create_driver_ping(
    driver_id
):

    # Bengaluru-like area.

    latitude = (
        12.9716
        + random.uniform(
            -0.08,
            0.08
        )
    )

    longitude = (
        77.5946
        + random.uniform(
            -0.08,
            0.08
        )
    )


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

        "driverId":
            driver_id,

        "active":
            random.random() > 0.20,

        "location": {

            "type":
                "Point",

            # IMPORTANT:
            # GeoJSON = [longitude, latitude]

            "coordinates": [

                longitude,

                latitude
            ]
        },

        "createdAt":
            created_at
    }


def seed_database(

    ping_count,

    menu_count,

    review_count,

    batch_size,

    random_seed
):

    random.seed(
        random_seed
    )


    client = MongoClient(

        os.getenv(
            "MONGO_URI",
            "mongodb://localhost:27017"
        )
    )


    database = client[
        os.getenv(
            "MONGO_DB",
            "bitestream"
        )
    ]


    menus = database[
        "Menus"
    ]

    reviews = database[
        "Reviews"
    ]

    driver_pings = database[
        "DriverPings"
    ]

    # Idempotency check: don't duplicate documents if already seeded
    existing_menus = menus.count_documents({})
    if existing_menus > 0:
        print(f"MongoDB already has {existing_menus:,} menus. Skipping seed to remain idempotent.")
        return

    # =================================================
    # MENUS
    # =================================================

    print(
        "Generating menus..."
    )


    restaurant_ids = [

        str(uuid.uuid4())

        for _ in range(
            menu_count
        )
    ]


    menu_documents = [

        create_menu(
            restaurant_id
        )

        for restaurant_id
        in restaurant_ids
    ]


    if menu_documents:

        menus.insert_many(
            menu_documents,
            ordered=False
        )


    print(
        f"Menus inserted: "
        f"{len(menu_documents):,}"
    )


    # =================================================
    # REVIEWS
    # =================================================

    print(
        "Generating reviews..."
    )


    review_documents = [

        create_review(
            random.choice(
                restaurant_ids
            )
        )

        for _ in range(
            review_count
        )
    ]


    for start in range(

        0,

        len(review_documents),

        batch_size
    ):

        reviews.insert_many(

            review_documents[
                start:
                start + batch_size
            ],

            ordered=False
        )


    print(
        f"Reviews inserted: "
        f"{len(review_documents):,}"
    )


    # =================================================
    # DRIVER PINGS
    # =================================================

    print(
        f"Generating "
        f"{ping_count:,} DriverPings..."
    )


    driver_count = max(

        100,

        ping_count // 1000
    )


    drivers = [

        f"driver-{i + 1:06d}"

        for i in range(
            driver_count
        )
    ]


    batch = []


    for i in range(
        ping_count
    ):

        batch.append(

            create_driver_ping(

                random.choice(
                    drivers
                )
            )
        )


        if len(batch) >= batch_size:

            driver_pings.insert_many(

                batch,

                ordered=False
            )

            batch.clear()


        if (
            (i + 1)
            % (batch_size * 10)
            == 0
        ):

            print(

                f"DriverPings inserted: "

                f"{i + 1:,}/"
                f"{ping_count:,}"
            )


    if batch:

        driver_pings.insert_many(

            batch,

            ordered=False
        )


    print(
        f"DriverPings inserted: "
        f"{ping_count:,}"
    )


    print()
    print("==============================")
    print("MONGODB SEEDING COMPLETE")
    print("==============================")

    print(
        f"Menus:        "
        f"{menus.count_documents({}):,}"
    )

    print(
        f"Reviews:      "
        f"{reviews.count_documents({}):,}"
    )

    print(
        f"DriverPings:  "
        f"{driver_pings.count_documents({}):,}"
    )


    client.close()


def main():

    parser = argparse.ArgumentParser()


    parser.add_argument(
        "--pings",
        type=int,
        default=500000
    )


    parser.add_argument(
        "--menus",
        type=int,
        default=500
    )


    parser.add_argument(
        "--reviews",
        type=int,
        default=10000
    )


    parser.add_argument(
        "--batch-size",
        type=int,
        default=5000
    )


    parser.add_argument(
        "--seed",
        type=int,
        default=42
    )


    args = parser.parse_args()


    seed_database(

        ping_count=args.pings,

        menu_count=args.menus,

        review_count=args.reviews,

        batch_size=args.batch_size,

        random_seed=args.seed
    )


if __name__ == "__main__":
    main()