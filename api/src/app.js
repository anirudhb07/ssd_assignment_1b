import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundRoute } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

// Builds the app without starting a server, so tests can use supertest.
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use('/api', notFoundRoute);
  app.use(errorHandler);
  return app;
}
