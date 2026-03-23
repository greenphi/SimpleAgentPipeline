import { Pool } from 'pg';
import { fileURLToPath } from 'url';

async function getPool(): Promise<Pool> {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5433/chess_trainer_test';
  return new Pool({ connectionString });
}

export async function runMigrations(): Promise<void> {
  const pool = await getPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS openings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        eco TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        opening_id TEXT NOT NULL REFERENCES openings(id),
        fen TEXT NOT NULL,
        san TEXT NOT NULL,
        move_number INTEGER NOT NULL,
        parent_id TEXT REFERENCES positions(id),
        trap_tag TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        position_id TEXT NOT NULL REFERENCES positions(id),
        state TEXT NOT NULL,
        step INTEGER NOT NULL,
        interval REAL NOT NULL,
        ease_factor REAL NOT NULL,
        due_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, position_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        opening_id TEXT NOT NULL REFERENCES openings(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        card_id TEXT NOT NULL REFERENCES cards(id),
        grade TEXT NOT NULL CHECK (grade IN ('correct', 'hint', 'incorrect')),
        answered_at TIMESTAMP NOT NULL,
        hint_used BOOLEAN NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trap_encounters (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        position_id TEXT NOT NULL REFERENCES positions(id),
        outcome TEXT NOT NULL CHECK (outcome IN ('spotted', 'fell_for')),
        encountered_at TIMESTAMP NOT NULL
      )
    `);
  } finally {
    await pool.end();
  }
}

// CLI support
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile || process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations().then(() => {
    console.log('Migrations complete.');
    process.exit(0);
  }).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
