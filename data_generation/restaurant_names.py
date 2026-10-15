"""
Restaurant names.

Every restaurant gets an invented, Bengaluru-style name such as
"Kaveri Dosa Corner": one of 25 first words and one of 20 kinds of
place, 500 unique combinations (a number is added past 500). None is a
real chain's name.

Names are assigned in restaurant-id order, so the same restaurants always
get the same names, and the set of names is the same on every machine.

    postgres_seeder.py  uses names_for() when it creates restaurants.
    seed.sh             runs this file on every seed: it renames existing
                        restaurants (databases seeded before this change),
                        updates the Mongo menus' restaurantName to match, and
                        refreshes the summary view that stores names. When
                        nothing needs renaming it changes nothing.
"""

import os

FIRST = [
    "Ananda", "Annapoorna", "Basava", "Brindavan", "Chamundi",
    "Devi", "Ganga", "Gokul", "Hampi", "Kaveri",
    "Lakshmi", "Malnad", "Mayura", "Nandi", "Panchami",
    "Raja", "Sagar", "Sangam", "Shanti", "Sri Sai",
    "Tulsi", "Uttara", "Vasavi", "Vijaya", "Yamuna",
]

KIND = [
    "Bhavan", "Biryani House", "Darshini", "Kitchen", "Cafe",
    "Dhaba", "Mess", "Tiffin Room", "Grill", "Bakery",
    "Chaat Corner", "Military Hotel", "Pizzeria", "Momo House", "Dosa Corner",
    "Thali House", "Juice Centre", "Sweets", "Kebab House", "Canteen",
]


def names_for(count):
    """The first `count` names; all different."""
    names = []
    for i in range(count):
        name = f"{FIRST[i % len(FIRST)]} {KIND[(i // len(FIRST)) % len(KIND)]}"
        round_ = i // (len(FIRST) * len(KIND))
        names.append(f"{name} {round_ + 1}" if round_ else name)
    return names


def names_by_id(ids):
    """{restaurant id: name}, assigned in id order."""
    ordered = sorted(ids)
    return dict(zip(ordered, names_for(len(ordered))))


def main():
    # Imported here so postgres_seeder.py can use names_by_id() without them.
    import psycopg2
    from pymongo import MongoClient, UpdateOne

    conn = psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "bitestream"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", ""),
    )
    with conn, conn.cursor() as cur:
        cur.execute("SELECT id::text, name FROM restaurants")
        current = dict(cur.fetchall())
        wanted = names_by_id(current)
        changes = {rid: name for rid, name in wanted.items() if current[rid] != name}

        if changes:
            cur.execute(
                """
                UPDATE restaurants r SET name = n.name
                  FROM unnest(%s::uuid[], %s::text[]) AS n(id, name)
                 WHERE r.id = n.id
                """,
                (list(changes), list(changes.values())),
            )
            # The summary view stores each restaurant's name; refresh it (and
            # log the refresh) so the ranking shows the new names.
            cur.execute("CALL sp_refresh_restaurant_summary()")
    conn.close()

    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    menus = client[os.getenv("MONGO_DB", "bitestream")]["Menus"]
    result = menus.bulk_write(
        [UpdateOne({"restaurantId": rid, "restaurantName": {"$ne": name}}, {"$set": {"restaurantName": name}})
         for rid, name in wanted.items()],
        ordered=False,
    ) if wanted else None
    client.close()

    menus_changed = result.modified_count if result else 0
    print(f"    {len(changes)} restaurants renamed, {menus_changed} menus updated")


if __name__ == "__main__":
    main()
