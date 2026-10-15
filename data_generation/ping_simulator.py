#!/usr/bin/env python3
"""
BiteStream Driver Ping Simulator (Workflow 3 / Issue #7)

Simulates live driver movements in the Bengaluru restaurant area.
Writes fresh driver pings to MongoDB DriverPings collection every few seconds
so that the real-time map displays active drivers and pings do not expire under the 2-hour TTL.

Safe to re-run and safe alongside RESET=1 seeding.
"""

import math
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone
import psycopg2
import pymongo

RUNNING = True


def handle_shutdown(signum, frame):
    global RUNNING
    RUNNING = False
    print("\nPing simulator stopping gracefully...", flush=True)


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


def get_env_config():
    return {
        "mongo_uri": os.environ.get("MONGO_URI", "mongodb://localhost:37017"),
        "mongo_db": os.environ.get("MONGO_DB", "bitestream"),
        "pghost": os.environ.get("PGHOST", "localhost"),
        "pgport": int(os.environ.get("PGPORT", "15432")),
        "pgdatabase": os.environ.get("PGDATABASE", "bitestream"),
        "pguser": os.environ.get("PGUSER", "postgres"),
        "pgpassword": os.environ.get("PGPASSWORD", "postgres"),
        "interval": float(os.environ.get("SIMULATOR_INTERVAL_SECONDS", "4.0")),
        "driver_count": int(os.environ.get("SIMULATOR_DRIVER_COUNT", "200")),
    }


def fetch_restaurant_anchors(cfg):
    """Fetch restaurant coordinates from PostgreSQL to anchor driver movements."""
    try:
        conn = psycopg2.connect(
            host=cfg["pghost"],
            port=cfg["pgport"],
            dbname=cfg["pgdatabase"],
            user=cfg["pguser"],
            password=cfg["pgpassword"],
            connect_timeout=5,
        )
        cur = conn.cursor()
        cur.execute("SELECT latitude, longitude FROM restaurants WHERE latitude IS NOT NULL AND longitude IS NOT NULL;")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        if rows:
            return [(float(r[0]), float(r[1])) for r in rows]
    except Exception as e:
        print(f"[ping_simulator] Warning: Could not fetch restaurants from Postgres ({e}), using default bounds.", flush=True)
    # Default fallback center bounds if postgres is not ready
    return [(12.9716, 77.5946)]


def is_mongo_ready(db):
    """Check if MongoDB DriverPings collection and 2dsphere index are ready (ensures RESET=1 isn't running)."""
    try:
        if "DriverPings" not in db.list_collection_names():
            return False
        indexes = db.DriverPings.index_information()
        # Verify 2dsphere index exists before inserting
        has_geo = any(
            idx.get("key") and ("location", "2dsphere") in idx["key"]
            for idx in indexes.values()
        )
        return has_geo
    except Exception:
        return False


def main():
    cfg = get_env_config()
    print(f"[ping_simulator] Starting driver ping simulator ({cfg['driver_count']} drivers, {cfg['interval']}s interval)...", flush=True)

    client = pymongo.MongoClient(cfg["mongo_uri"], serverSelectionTimeoutMS=5000)
    db = client[cfg["mongo_db"]]

    # Wait for Mongo collection and 2dsphere index to be initialized by seed
    while RUNNING and not is_mongo_ready(db):
        print("[ping_simulator] Waiting for DriverPings collection and 2dsphere index to be ready...", flush=True)
        time.sleep(2)

    anchors = fetch_restaurant_anchors(cfg)
    print(f"[ping_simulator] Loaded {len(anchors)} restaurant locations as driver anchors.", flush=True)

    # Initialize ~200 drivers near restaurant anchors
    drivers = []
    for i in range(cfg["driver_count"]):
        anchor_lat, anchor_lng = random.choice(anchors)
        # Offset within ~1.5 km of an anchor restaurant
        lat = anchor_lat + random.uniform(-0.015, 0.015)
        lng = anchor_lng + random.uniform(-0.015, 0.015)
        # Velocity in degrees per tick (~50-80 meters)
        heading = random.uniform(0, 2 * math.pi)
        speed = random.uniform(0.0003, 0.0008)
        drivers.append({
            "driverId": f"driver-{i + 1:06d}",
            "lat": lat,
            "lng": lng,
            "anchor_lat": anchor_lat,
            "anchor_lng": anchor_lng,
            "v_lat": math.cos(heading) * speed,
            "v_lng": math.sin(heading) * speed,
            "active": random.random() > 0.10,  # ~90% active
        })

    tick = 0
    while RUNNING:
        try:
            if not is_mongo_ready(db):
                print("[ping_simulator] DriverPings not ready (database reseed in progress?), waiting...", flush=True)
                time.sleep(2)
                continue

            now = datetime.now(timezone.utc)
            pings = []

            for d in drivers:
                # Update position
                d["lat"] += d["v_lat"] + random.uniform(-0.00005, 0.00005)
                d["lng"] += d["v_lng"] + random.uniform(-0.00005, 0.00005)

                # If driver strays too far (> 4 km) from their anchor, steer back towards anchor
                dist_lat = d["lat"] - d["anchor_lat"]
                dist_lng = d["lng"] - d["anchor_lng"]
                if abs(dist_lat) > 0.035 or abs(dist_lng) > 0.035:
                    heading = math.atan2(-dist_lng, -dist_lat) + random.uniform(-0.3, 0.3)
                    speed = random.uniform(0.0004, 0.0008)
                    d["v_lat"] = math.cos(heading) * speed
                    d["v_lng"] = math.sin(heading) * speed

                # Maintain ~90% active rate: active drivers rarely go on break (~1%), inactive drivers return online (~9%)
                if d["active"]:
                    if random.random() < 0.01:
                        d["active"] = False
                else:
                    if random.random() < 0.09:
                        d["active"] = True

                pings.append({
                    "driverId": d["driverId"],
                    "active": d["active"],
                    "location": {
                        "type": "Point",
                        "coordinates": [d["lng"], d["lat"]],  # GeoJSON: [longitude, latitude]
                    },
                    "createdAt": now,
                })

            db.DriverPings.insert_many(pings, ordered=False)
            tick += 1
            if tick % 10 == 0:
                print(f"[ping_simulator] Tick {tick}: Generated {len(pings)} live driver pings at {now.isoformat()}", flush=True)

        except Exception as err:
            print(f"[ping_simulator] Error during ping generation: {err}. Retrying in 2s...", flush=True)
            time.sleep(2)
            continue

        time.sleep(cfg["interval"])

    client.close()
    print("[ping_simulator] Simulator stopped.", flush=True)


if __name__ == "__main__":
    main()
