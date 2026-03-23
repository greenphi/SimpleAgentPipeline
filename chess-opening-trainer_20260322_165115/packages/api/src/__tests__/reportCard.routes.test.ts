import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import { buildTestApp, truncateTables, TEST_DB_URL } from './setup';
import { OPENINGS, POSITIONS } from './fixtures';

const pool = new Pool({ connectionString: TEST_DB_URL });

const ReportCardSchema = z.object({
  accuracy: z.number().min(0).max(1),
  currentStreak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  showSparkline: z.boolean(),
  masteredCount: z.number().int().min(0),
  totalCards: z.number().int().min(0),
  hardestPositionId: z.string().nullable(),
  sessionAccuracies: z.array(z.number()),
});

async function registerAndLogin(
  app: FastifyInstance,
  email = 'report@example.com',
  password = 'ValidPass1!'
): Promise<{ userId: string; accessToken: string }> {
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password },
  });
  const { userId, accessToken } = JSON.parse(regRes.body);
  return { userId, accessToken };
}

async function seedSessionsForUser(pool: Pool, userId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const completedAt = new Date(`2026-03-${22 - i}T10:00:00Z`);
    const sessionId = `report-session-${i}`;
    await pool.query(
      `INSERT INTO sessions (id, user_id, started_at, completed_at, opening_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [sessionId, userId, new Date(completedAt.getTime() - 30 * 60 * 1000), completedAt, 'opening-1']
    );
    // Add a session item
    await pool.query(
      `INSERT INTO session_items (id, session_id, card_id, grade, answered_at, hint_used)
       SELECT $1, $2, id, 'correct', $3, false FROM cards WHERE user_id = $4 LIMIT 1`,
      [`item-report-${i}`, sessionId, completedAt, userId]
    );
  }
}

describe('Report Card Routes', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeEach(async () => {
    await truncateTables(pool);
    app = await buildTestApp();
    await app.ready();

    // Seed openings
    for (const opening of OPENINGS) {
      await pool.query(
        'INSERT INTO openings (id, name, color, eco) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [opening.id, opening.name, opening.color, opening.eco]
      );
    }

    const creds = await registerAndLogin(app);
    userId = creds.userId;
    accessToken = creds.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it('authenticated → 200 with ReportCard object', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/report-card',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('accuracy');
    expect(body).toHaveProperty('currentStreak');
    expect(body).toHaveProperty('bestStreak');
    expect(body).toHaveProperty('showSparkline');
    expect(body).toHaveProperty('masteredCount');
    expect(body).toHaveProperty('totalCards');
    expect(body).toHaveProperty('sessionAccuracies');
  });

  it('unauthenticated → 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/report-card',
    });

    expect(response.statusCode).toBe(401);
  });

  it('no sessions yet → 200 with zero values', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/report-card',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.accuracy).toBe(0);
    expect(body.currentStreak).toBe(0);
    expect(body.bestStreak).toBe(0);
    expect(body.showSparkline).toBe(false);
  });

  it('with 7 completed sessions → showSparkline true', async () => {
    await seedSessionsForUser(pool, userId, 7);

    const response = await app.inject({
      method: 'GET',
      url: '/api/report-card',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.showSparkline).toBe(true);
  });

  it('response matches ReportCard schema (Zod parse should succeed)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/report-card',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    const parseResult = ReportCardSchema.safeParse(body);
    expect(parseResult.success).toBe(true);
  });
});
