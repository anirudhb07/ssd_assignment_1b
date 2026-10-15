// Captures explain("executionStats") for Workflow 3 and Workflow 4 and prints
// one JSON document (issue #57). The pipelines are the same as in
// mongo/02_workflow3_geonear.js and mongo/03_workflow4_facet.js; keep them in
// step if those change. Run it with the ping simulator on, so there are live
// pings, and save the output:
//
//   docker compose exec -T mongo mongosh --quiet bitestream \
//     --eval "$(cat performance/capture_mongo_stats.js)" > performance/mongo_execution_stats.json
//
// (--eval rather than piping the file in: piped input echoes a prompt per line.)

// Same origin as mongo/02 (GeoJSON is [longitude, latitude]).
const origin = { type: "Point", coordinates: [77.5946, 12.9716] };
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

// Short summary of an explain: what a reader checks first.
function summarise(explain) {
    const indexes = new Set();
    const stages = new Set();
    let docs = 0, keys = 0, ms = 0, returned = null;
    (function walk(node) {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        if (typeof node.stage === "string") stages.add(node.stage);
        if (typeof node.indexName === "string") indexes.add(node.indexName);
        if (node.executionStats) {
            const s = node.executionStats;
            docs += s.totalDocsExamined || 0;
            keys += s.totalKeysExamined || 0;
            ms = Math.max(ms, s.executionTimeMillis || 0);
            if (returned === null) returned = s.nReturned;
        }
        Object.values(node).forEach(walk);
    })(explain);
    return {
        nReturned: returned,
        totalDocsExamined: docs,
        totalKeysExamined: keys,
        executionTimeMillis: ms,
        indexesUsed: [...indexes],
        stages: [...stages],
    };
}

function capture(collection, pipeline) {
    const explain = db[collection].explain("executionStats").aggregate(pipeline);
    return { summary: summarise(explain), explain };
}

// ---------- Workflow 3: nearby drivers (two steps) ----------

const latestPerDriver = [
    { $match: { createdAt: { $gte: tenMinutesAgo } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$driverId", pingId: { $first: "$_id" } } },
];
const pingIds = db.DriverPings.aggregate(latestPerDriver).toArray().map((l) => l.pingId);

const nearby = [
    {
        $geoNear: {
            near: origin,
            key: "location",
            distanceField: "distanceMeters",
            maxDistance: 5000,
            spherical: true,
            query: { _id: { $in: pingIds }, active: true },
        },
    },
    {
        $project: {
            _id: 0,
            driverId: 1,
            lat: { $arrayElemAt: ["$location.coordinates", 1] },
            lng: { $arrayElemAt: ["$location.coordinates", 0] },
            distanceMeters: { $round: ["$distanceMeters", 0] },
            lastSeenAt: "$createdAt",
        },
    },
];

// ---------- Workflow 4: review facets ----------

const facet = {
    $facet: {
        ratingDistribution: [
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ],
        tagFrequency: [
            { $unwind: "$sentimentTags" },
            { $group: { _id: "$sentimentTags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
        ],
        overallAverage: [
            { $group: { _id: null, averageRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } },
            { $project: { _id: 0, averageRating: { $round: ["$averageRating", 2] }, totalReviews: 1 } },
        ],
    },
};
// The restaurant with the most reviews, so the filtered case has real work to do.
const busiest = db.Reviews.aggregate([
    { $group: { _id: "$restaurantId", n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: 1 },
]).toArray()[0]._id;

print(JSON.stringify({
    capturedAt: new Date().toISOString(),
    mongoVersion: db.version(),
    data: {
        driverPings: db.DriverPings.countDocuments(),
        driverPingsLast10Minutes: db.DriverPings.countDocuments({ createdAt: { $gte: tenMinutesAgo } }),
        reviews: db.Reviews.countDocuments(),
    },
    workflow3NearbyDrivers: {
        script: "mongo/02_workflow3_geonear.js",
        origin: origin.coordinates,
        latestPingPerDriver: capture("DriverPings", latestPerDriver),
        driversWithin5km: capture("DriverPings", nearby),
    },
    workflow4ReviewFacets: {
        script: "mongo/03_workflow4_facet.js",
        allReviews: capture("Reviews", [facet]),
        oneRestaurant: { restaurantId: busiest, ...capture("Reviews", [{ $match: { restaurantId: busiest } }, facet]) },
    },
}, null, 2));
