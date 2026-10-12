// Sample responses for endpoints that are not wired to the database yet.
// They follow docs/api_endpoints.md exactly, so the front end can be built
// now and keep working when a route is switched to real queries.
//
// When you implement a route for real, delete its sendMock() call and any
// fixture here that nothing else uses.

export function sendMock(res, data, status = 200) {
  res.set('X-Mock', 'true').status(status).json(data);
}

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString();

export const users = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'User-1a2b3c4d', walletBalance: 4250 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'User-5e6f7a8b', walletBalance: 180 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'User-9c0d1e2f', walletBalance: 12890.5 },
];

export const restaurant = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Restaurant-166',
  latitude: 12.9716,
  longitude: 77.5946,
};

export const order = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: users[0].id,
  userName: users[0].name,
  restaurantId: restaurant.id,
  restaurantName: restaurant.name,
  totalAmount: 640,
  status: 'PREPARING',
  createdAt: daysAgo(0),
};

export const auditEntry = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  changedAt: new Date(now).toISOString(),
  actionType: 'DEBIT',
  amountChanged: 640,
  balanceAfter: 3610,
};

export const auditLog = Array.from({ length: 8 }, (_, i) => ({
  id: `cccccccc-cccc-4ccc-8ccc-00000000000${i}`,
  changedAt: daysAgo(i * 3),
  actionType: i === 4 ? 'CREDIT' : 'DEBIT',
  amountChanged: i === 4 ? 5000 : 200 + i * 75,
  balanceAfter: 4250 + i * 310,
}));

export const menu = {
  restaurantId: restaurant.id,
  restaurantName: restaurant.name,
  updatedAt: daysAgo(2),
  categories: [
    {
      name: 'Starters',
      items: [
        { name: 'Paneer Tikka', description: 'Char-grilled cottage cheese', price: 240, available: true,
          customizationAddOns: [{ name: 'Extra Cheese', price: 40 }] },
        { name: 'Veg Spring Roll', price: 180, available: false, customizationAddOns: [] },
      ],
    },
    {
      name: 'Main Course',
      items: [
        { name: 'Butter Chicken', description: 'With butter naan', price: 400, available: true,
          customizationAddOns: [{ name: 'Extra Spicy', price: 10 }, { name: 'Extra Naan', price: 50 }] },
      ],
    },
  ],
};

export const revenue = {
  restaurantId: restaurant.id,
  restaurantName: restaurant.name,
  points: Array.from({ length: 30 }, (_, i) => {
    const daily = 9000 + Math.round(4000 * Math.sin(i / 3)) + i * 60;
    return { date: daysAgo(29 - i).slice(0, 10), dailyRevenue: daily, movingAvg7d: 9000 + i * 60 };
  }),
};

export const ranking = [
  { rank: 1, restaurantId: restaurant.id, restaurantName: 'Restaurant-166', totalRevenue: 354950 },
  { rank: 2, restaurantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', restaurantName: 'Restaurant-247', totalRevenue: 353474 },
  { rank: 3, restaurantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', restaurantName: 'Restaurant-270', totalRevenue: 352813 },
];

export const summary = {
  lastRefreshedAt: daysAgo(0),
  totals: { restaurants: 500, completedOrders: 110965, completedRevenue: 144501230 },
  topRestaurants: ranking.map(({ restaurantId, restaurantName, totalRevenue }) => ({
    restaurantId, restaurantName, completedOrderCount: 240, completedRevenue: totalRevenue,
  })),
};

// Scatters a few drivers around the requested origin.
export function nearbyDrivers(lat, lng) {
  const offsets = [[0.002, 0.001], [-0.004, 0.006], [0.011, -0.007], [-0.015, -0.012], [0.02, 0.018]];
  return offsets.map(([dLat, dLng], i) => ({
    driverId: `driver-00000${i + 1}`,
    lat: lat + dLat,
    lng: lng + dLng,
    distanceMeters: Math.round(Math.hypot(dLat, dLng) * 111_000),
    lastSeenAt: new Date(now - i * 40_000).toISOString(),
  }));
}
