// =====================================================
// WORKFLOW 3
// Find all active drivers within 5 KM (Issue #8 / DB fix 4)
//
// Returns one result per driver (their latest ping),
// only considers pings from the last ~10 minutes,
// and sorts by distance from the restaurant.
// =====================================================

// Example restaurant coordinates.
// GeoJSON uses [LONGITUDE, LATITUDE].
const restaurantLongitude = 77.5946;
const restaurantLatitude = 12.9716;

const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

// Step 1: Find the latest ping ID per driver within the last 10 minutes
const latestPings = db.DriverPings.aggregate([
    {
        $match: {
            createdAt: { $gte: tenMinutesAgo }
        }
    },
    {
        $sort: {
            createdAt: -1
        }
    },
    {
        $group: {
            _id: "$driverId",
            pingId: { $first: "$_id" }
        }
    }
]).toArray();

const pingIds = latestPings.map((l) => l.pingId);

// Step 2: $geoNear matching only the latest ping per driver (if active and within 5 km)
db.DriverPings.aggregate([
    {
        $geoNear: {
            near: {
                type: "Point",
                coordinates: [
                    restaurantLongitude,
                    restaurantLatitude
                ]
            },
            key: "location",
            distanceField: "distanceMeters",
            maxDistance: 5000,
            spherical: true,
            query: {
                _id: { $in: pingIds },
                active: true
            }
        }
    },
    {
        $project: {
            _id: 0,
            driverId: 1,
            lat: { $arrayElemAt: ["$location.coordinates", 1] },
            lng: { $arrayElemAt: ["$location.coordinates", 0] },
            distanceMeters: { $round: ["$distanceMeters", 0] },
            lastSeenAt: "$createdAt"
        }
    }
]);
