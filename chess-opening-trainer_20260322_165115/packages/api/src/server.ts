import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  await runMigrations();
  const app = await buildApp({
    databaseUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/chess_trainer_test',
    redisUrl: process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6380',
    jwtSecret: process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-here',
  });
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`Server running at http://127.0.0.1:${PORT}`);
}

main().catch(console.error);
