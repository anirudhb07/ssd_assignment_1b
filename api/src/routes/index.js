import { Router } from 'express';
import { analyticsRouter } from './analytics.js';
import { checkoutRouter } from './checkout.js';
import { driversRouter } from './drivers.js';
import { healthRouter } from './health.js';
import { ordersRouter } from './orders.js';
import { restaurantsRouter } from './restaurants.js';
import { reviewsRouter } from './reviews.js';
import { usersRouter } from './users.js';

// One router per area. The full contract is in docs/api_endpoints.md.
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/restaurants', restaurantsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/drivers', driversRouter);
apiRouter.use('/reviews', reviewsRouter);
