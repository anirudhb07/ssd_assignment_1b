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
                active: true,
                createdAt: { $gte: tenMinutesAgo }
            }
        }
    },
    // Sort newest pings first so $group picks each driver's latest location
    {
        $sort: {
            createdAt: -1
        }
    },
    // Deduplicate: latest ping per driver
    {
        $group: {
            _id: "$driverId",
            location: { $first: "$location" },
            distanceMeters: { $first: "$distanceMeters" },
            lastSeenAt: { $first: "$createdAt" }
        }
    },
    // Sort all drivers within radius by distance (nearest first)
    {
        $sort: {
            distanceMeters: 1
        }
    },
    {
        $project: {
            _id: 0,
            driverId: "$_id",
            lat: { $arrayElemAt: ["$location.coordinates", 1] },
            lng: { $arrayElemAt: ["$location.coordinates", 0] },
            distanceMeters: { $round: ["$distanceMeters", 0] },
            lastSeenAt: 1
        }
    }
]);
