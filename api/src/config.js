// Defaults point at the Docker Compose databases as seen from your machine.
// Inside Compose, docker-compose.yml overrides these with the service names.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 15432),
    database: process.env.PGDATABASE ?? 'bitestream',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
  },
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:37017',
    db: process.env.MONGO_DB ?? 'bitestream',
  },
};
