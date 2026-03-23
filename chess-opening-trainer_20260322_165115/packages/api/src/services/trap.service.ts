import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    const connectionString =
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/chess_trainer_test';
    poolInstance = new Pool({ connectionString });
  }
  return poolInstance;
}

export interface Position {
  id: string;
  openingId: string;
  fen: string;
  san: string;
  moveNumber: number;
  parentId: string | null;
  trapTag: string | null;
}

export async function recordEncounter(
  userId: string,
  positionId: string,
  outcome: 'spotted' | 'fell_for'
): Promise<void> {
  const pool = getPool();
  const id = uuidv4();
  await pool.query(
    `INSERT INTO trap_encounters (id, user_id, position_id, outcome, encountered_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, userId, positionId, outcome]
  );
}

export async function getTrapStats(
  userId: string
): Promise<{ total: number; spotted: number; fellFor: number; spotRate: number }> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE outcome = 'spotted') as spotted,
       COUNT(*) FILTER (WHERE outcome = 'fell_for') as fell_for
     FROM trap_encounters
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  const total = Number(row.total);
  const spotted = Number(row.spotted);
  const fellFor = Number(row.fell_for);
  const spotRate = total === 0 ? 0 : spotted / total;

  return { total, spotted, fellFor, spotRate };
}

export async function buildTrapSession(userId: string, limit: number): Promise<Position[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT p.id, p.opening_id as "openingId", p.fen, p.san, p.move_number as "moveNumber",
            p.parent_id as "parentId", p.trap_tag as "trapTag"
     FROM positions p
     WHERE p.trap_tag IS NOT NULL
       AND p.id NOT IN (
         SELECT c.position_id FROM cards c
         WHERE c.user_id = $1 AND c.interval >= 21
       )
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
