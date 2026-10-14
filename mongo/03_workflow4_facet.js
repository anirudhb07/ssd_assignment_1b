// =====================================================
// WORKFLOW 4
// Review analytics using $facet
// =====================================================


// Optional restaurantId parameter (null or undefined analyzes all reviews)
const targetRestaurantId = typeof restaurantId !== 'undefined' ? restaurantId : null;

db.Reviews.aggregate([
    ...(targetRestaurantId ? [{ $match: { restaurantId: targetRestaurantId } }] : []),
    {
        $facet: {


            ratingDistribution: [

                {
                    $group: {

                        _id: "$rating",

                        count: {
                            $sum: 1
                        }
                    }
                },

                {
                    $sort: {
                        _id: 1
                    }
                }
            ],
            tagFrequency: [

                {
                    $unwind: "$sentimentTags"
                },

                {
                    $group: {

                        _id: "$sentimentTags",

                        count: {
                            $sum: 1
                        }
                    }
                },

                {
                    $sort: {

                        count: -1,

                        _id: 1
                    }
                }
            ],
            overallAverage: [

                {
                    $group: {

                        _id: null,

                        averageRating: {
                            $avg: "$rating"
                        },

                        totalReviews: {
                            $sum: 1
                        }
                    }
                },

                {
                    $project: {

                        _id: 0,

                        averageRating: {
                            $round: [
                                "$averageRating",
                                2
                            ]
                        },

                        totalReviews: 1
                    }
                }
            ]
        }
    }

]);