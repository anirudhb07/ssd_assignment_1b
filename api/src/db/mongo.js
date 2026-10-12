import { MongoClient } from 'mongodb';
import { config } from '../config.js';

const client = new MongoClient(config.mongo.uri);
let dbPromise;

// Connects once on first use and reuses the connection afterwards.
export function getDb() {
  dbPromise ??= client.connect().then((c) => c.db(config.mongo.db));
  return dbPromise;
}

export async function closeMongo() {
  dbPromise = undefined;
  await client.close();
}
