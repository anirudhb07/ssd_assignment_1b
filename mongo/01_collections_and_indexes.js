// =====================================================
// BiteStream MongoDB Collections
// =====================================================


// -----------------------------------------------------
// MENUS
// -----------------------------------------------------

db.createCollection("Menus", {
    validator: {
        $jsonSchema: {

            bsonType: "object",

            required: [
                "restaurantId",
                "categories",
                "updatedAt"
            ],

            properties: {

                restaurantId: {
                    bsonType: "string"
                },

                restaurantName: {
                    bsonType: "string"
                },

                categories: {

                    bsonType: "array",

                    items: {

                        bsonType: "object",

                        required: [
                            "name",
                            "items"
                        ],

                        properties: {

                            name: {
                                bsonType: "string"
                            },

                            items: {

                                bsonType: "array",

                                items: {

                                    bsonType: "object",

                                    required: [
                                        "name",
                                        "price",
                                        "available"
                                    ],

                                    properties: {

                                        name: {
                                            bsonType: "string"
                                        },

                                        description: {
                                            bsonType: "string"
                                        },

                                        price: {
                                            bsonType: [
                                                "double",
                                                "int",
                                                "long",
                                                "decimal"
                                            ]
                                        },

                                        available: {
                                            bsonType: "bool"
                                        },

                                        customizationAddOns: {

                                            bsonType: "array",

                                            items: {

                                                bsonType: "object",

                                                required: [
                                                    "name",
                                                    "price"
                                                ],

                                                properties: {

                                                    name: {
                                                        bsonType: "string"
                                                    },

                                                    price: {
                                                        bsonType: [
                                                            "double",
                                                            "int",
                                                            "long",
                                                            "decimal"
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },

                updatedAt: {
                    bsonType: "date"
                }
            }
        }
    },

    validationLevel: "moderate"
});


// -----------------------------------------------------
// REVIEWS
// -----------------------------------------------------

db.createCollection("Reviews", {

    validator: {

        $jsonSchema: {

            bsonType: "object",

            required: [
                "restaurantId",
                "rating",
                "sentimentTags",
                "createdAt"
            ],

            properties: {

                restaurantId: {
                    bsonType: "string"
                },

                orderId: {
                    bsonType: "string"
                },

                userId: {
                    bsonType: "string"
                },

                rating: {
                    bsonType: "int",
                    minimum: 1,
                    maximum: 5
                },

                reviewText: {
                    bsonType: "string"
                },

                sentimentTags: {

                    bsonType: "array",

                    items: {
                        bsonType: "string"
                    }
                },

                createdAt: {
                    bsonType: "date"
                }
            }
        }
    },

    validationLevel: "moderate"
});


// -----------------------------------------------------
// DRIVER PINGS
// -----------------------------------------------------

db.createCollection("DriverPings", {

    validator: {

        $jsonSchema: {

            bsonType: "object",

            required: [
                "driverId",
                "active",
                "location",
                "createdAt"
            ],

            properties: {

                driverId: {
                    bsonType: "string"
                },

                active: {
                    bsonType: "bool"
                },

                location: {

                    bsonType: "object",

                    required: [
                        "type",
                        "coordinates"
                    ],

                    properties: {

                        type: {
                            enum: ["Point"]
                        },

                        coordinates: {

                            bsonType: "array",

                            minItems: 2,
                            maxItems: 2
                        }
                    }
                },

                createdAt: {
                    bsonType: "date"
                }
            }
        }
    },

    validationLevel: "moderate"
});


// -----------------------------------------------------
// 2dsphere index
// -----------------------------------------------------

db.DriverPings.createIndex(
    {
        location: "2dsphere"
    },
    {
        name: "idx_driver_location_2dsphere"
    }
);


// -----------------------------------------------------
// TTL index
// 7200 seconds = 2 hours
// -----------------------------------------------------

db.DriverPings.createIndex(
    {
        createdAt: 1
    },
    {
        name: "idx_driver_createdAt_ttl",
        expireAfterSeconds: 7200
    }
);


// -----------------------------------------------------
// Other useful indexes
// -----------------------------------------------------

db.Menus.createIndex(
    {
        restaurantId: 1
    },
    {
        name: "idx_menu_restaurant"
    }
);


db.Reviews.createIndex(
    {
        restaurantId: 1,
        createdAt: -1
    },
    {
        name: "idx_review_restaurant_created"
    }
);


// Referenced by performance/mongo_execution_stats.json
db.Reviews.createIndex(
    {
        rating: 1
    },
    {
        name: "idx_reviews_rating"
    }
);


print("BiteStream MongoDB setup completed.");