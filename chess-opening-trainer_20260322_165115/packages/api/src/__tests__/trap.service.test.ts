import { describe, it, expect, beforeEach } from 'vitest';
import { recordEncounter, getTrapStats, buildTrapSession } from '../services/trap.service';
import { db } from './setup';
import { Pool } from 'pg';
import { TEST_DB_URL } from './setup';
import { OPENINGS, TRAP_POSITIONS, POSITIONS } from './fixtures';

const pool = new Pool({ connectionString: TEST_DB_URL });

const TEST_USER_ID = 'trap-test-user-id';
const OTHER_USER_ID = 'other-trap-user-id';

async function seedPrerequisites() {
  // Seed user
  await pool.query(
    `INSERT INTO users (id, email, password_hash, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [TEST_USER_ID, 'trap-service-test@example.com', '$2b$10$fakehashedforseedingonly']
  );

  // Seed openings
  for (const opening of OPENINGS) {
    await pool.query(
      'INSERT INTO openings (id, name, color, eco) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [opening.id, opening.name, opening.color, opening.eco]
    );
  }

  // Seed all positions including traps
  for (const pos of POSITIONS) {
    await pool.query(
      `INSERT INTO positions (id, opening_id, fen, san, move_number, parent_id, trap_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [pos.id, pos.openingId, pos.fen, pos.san, pos.moveNumber, pos.parentId, pos.trapTag]
    );
  }
}

describe('trap.service', () => {
  beforeEach(async () => {
    // Truncate trap_encounters before each test
    await pool.query('TRUNCATE TABLE trap_encounters RESTART IDENTITY CASCADE');
    await seedPrerequisites();
  });

  describe('recordEncounter', () => {
    it('saves a trap_encounter row', async () => {
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'spotted');

      const result = await pool.query(
        'SELECT * FROM trap_encounters WHERE user_id = $1 AND position_id = $2',
        [TEST_USER_ID, 'pos-trap-1']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].outcome).toBe('spotted');
    });

    it('recordEncounter with outcome=fell_for increments fell_for count', async () => {
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'fell_for');
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'fell_for');

      const result = await pool.query(
        "SELECT COUNT(*) FROM trap_encounters WHERE user_id = $1 AND outcome = 'fell_for'",
        [TEST_USER_ID]
      );

      expect(Number(result.rows[0].count)).toBe(2);
    });

    it('recordEncounter with outcome=spotted increments spotted count', async () => {
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'spotted');
      await recordEncounter(TEST_USER_ID, 'pos-trap-2', 'spotted');

      const result = await pool.query(
        "SELECT COUNT(*) FROM trap_encounters WHERE user_id = $1 AND outcome = 'spotted'",
        [TEST_USER_ID]
      );

      expect(Number(result.rows[0].count)).toBe(2);
    });
  });

  describe('getTrapStats', () => {
    it('returns { total, spotted, fellFor, spotRate } for a user', async () => {
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'spotted');
      await recordEncounter(TEST_USER_ID, 'pos-trap-1', 'fell_for');
      await recordEncounter(TEST_USER_ID, 'pos-trap-2', 'spotted');

      const stats = await getTrapStats(TEST_USER_ID);

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('spotted');
      expect(stats).toHaveProperty('fellFor');
      expect(stats).toHaveProperty('spotRate');
      expect(stats.total).toBe(3);
      expect(stats.spotted).toBe(2);
      expect(stats.fellFor).toBe(1);
      expect(stats.spotRate).toBeCloseTo(2 / 3, 5);
    });

    it('getTrapStats with no encounters → all zeros', async () => {
      const stats = await getTrapStats(TEST_USER_ID);

      expect(stats.total).toBe(0);
      expect(stats.spotted).toBe(0);
      expect(stats.fellFor).toBe(0);
      expect(stats.spotRate).toBe(0);
    });
  });

  describe('buildTrapSession', () => {
    it('buildTrapSession returns positions tagged as traps', async () => {
      const session = await buildTrapSession(TEST_USER_ID, 10);

      expect(session.length).toBeGreaterThan(0);
      session.forEach((pos: { trapTag: string | null }) => {
        expect(pos.trapTag).not.toBeNull();
      });
    });

    it('buildTrapSession limits to requested count', async () => {
      const session = await buildTrapSession(TEST_USER_ID, 1);

      expect(session.length).toBeLessThanOrEqual(1);
    });

    it('buildTrapSession excludes positions user has already mastered', async () => {
      // Seed a mastered card for trap position
      await pool.query(
        `INSERT INTO users (id, email, password_hash, created_at)
         VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
        ['mastery-user', 'mastery@example.com', '$2b$10$fakehashedformastery']
      );
      await pool.query(
        `INSERT INTO cards (id, user_id, position_id, state, step, interval, ease_factor, due_at, created_at, updated_at)
         VALUES ('mastered-trap-card', 'mastery-user', 'pos-trap-1', 'review', 0, 25, 2.65, NOW(), NOW(), NOW())
         ON CONFLICT DO NOTHING`
      );

      const session = await buildTrapSession('mastery-user', 10);

      const positionIds = session.map((p: { id: string }) => p.id);
      // pos-trap-1 is mastered so should be excluded; pos-trap-2 should still appear
      expect(positionIds).not.toContain('pos-trap-1');
    });
  });
});
