import { createApp } from './app.js';
import { config } from './config.js';
import { closeMongo } from './db/mongo.js';
import { pool } from './db/postgres.js';

const server = createApp().listen(config.port, () => {
  console.log(`BiteStream API listening on http://localhost:${config.port}/api`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([pool.end(), closeMongo()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
