import { Router } from 'express';
import { getDb } from '../db/mongo.js';
import { requireId } from '../lib/checkoutInput.js';

export const reviewsRouter = Router();

// GET /api/reviews/stats?restaurantId=
// REAL. Reference pattern for MongoDB. This is the Workflow 4 $facet
// pipeline from mongo/03_workflow4_facet.js, with an optional $match first.
// No restaurantId means all restaurants. A malformed restaurantId is a 400
// (same as the other routes); a well-formed id that matches no reviews gives
// zero reviews, not an error.
reviewsRouter.get('/stats', async (req, res) => {
  const restaurantId = req.query.restaurantId
    ? requireId(String(req.query.restaurantId), 'Restaurant ID')
    : null;

  const db = await getDb();

  const [result] = await db.collection('Reviews').aggregate([
    ...(restaurantId ? [{ $match: { restaurantId } }] : []),
    {
      $facet: {
        ratingDistribution: [
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        tagFrequency: [
          { $unwind: '$sentimentTags' },
          { $group: { _id: '$sentimentTags', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        overallAverage: [
          { $group: { _id: null, averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
          { $project: { _id: 0, averageRating: { $round: ['$averageRating', 2] }, totalReviews: 1 } },
        ],
      },
    },
  ]).toArray();

  // Always return all five star buckets so charts don't skip a bar.
  const counts = new Map(result.ratingDistribution.map((r) => [r._id, r.count]));
  const overall = result.overallAverage[0] ?? { averageRating: null, totalReviews: 0 };

  res.json({
    restaurantId,
    averageRating: overall.averageRating,
    totalReviews: overall.totalReviews,
    ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({ rating, count: counts.get(rating) ?? 0 })),
    topTags: result.tagFrequency.map((t) => ({ tag: t._id, count: t.count })),
  });
});