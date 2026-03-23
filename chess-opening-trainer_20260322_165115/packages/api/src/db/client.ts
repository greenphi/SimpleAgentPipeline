import { Pool } from 'pg';

let poolInstance: Pool | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    const connectionString =
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/chess_trainer_test';
    poolInstance = new Pool({ connectionString });
  }
  return poolInstance;
}
