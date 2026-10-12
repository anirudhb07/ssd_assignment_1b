import { Router } from 'express';
import { ranking, revenue, sendMock, summary } from '../mocks.js';

export const analyticsRouter = Router();

// GET /api/analytics/revenue?restaurantId= — MOCK.
// TODO (Member B): the Workflow 2 window query (sql/06) for one restaurant.
// Member A is wrapping it in a view/function that takes a restaurant id.
analyticsRouter.get('/revenue', (req, res) => {
  sendMock(res, { ...revenue, restaurantId: req.query.restaurantId ?? revenue.restaurantId });
});

// GET /api/analytics/ranking?page=&pageSize= — MOCK. DENSE_RANK() by total revenue.
analyticsRouter.get('/ranking', (req, res) => {
  sendMock(res, { items: ranking, page: 1, pageSize: 20, total: ranking.length });
});

// GET /api/analytics/summary — MOCK. Totals from restaurant_order_summary + last refresh time.
analyticsRouter.get('/summary', (req, res) => {
  sendMock(res, summary);
});

// POST /api/analytics/summary/refresh — MOCK. TODO: CALL sp_refresh_restaurant_summary().
analyticsRouter.post('/summary/refresh', (req, res) => {
  sendMock(res, { ...summary, lastRefreshedAt: new Date().toISOString() });
});
