import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { buildApp } from '../app';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/chess_trainer_test';
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6380';

let pool: Pool;
export let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  db = drizzle(pool);
});

afterAll(async () => {
  await pool.end();
});

export async function buildTestApp() {
  return buildApp({
    databaseUrl: TEST_DB_URL,
    redisUrl: TEST_REDIS_URL,
    jwtSecret: 'test-secret-32-chars-minimum-here',
  });
}

export async function truncateTables(client: Pool) {
  await client.query(`
    TRUNCATE TABLE trap_encounters, session_items, sessions, cards, positions, openings, users RESTART IDENTITY CASCADE
  `);
}
