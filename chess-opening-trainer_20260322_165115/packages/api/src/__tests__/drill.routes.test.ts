import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, truncateTables, TEST_DB_URL } from './setup';
import { OPENINGS, POSITIONS } from './fixtures';

const pool = new Pool({ connectionString: TEST_DB_URL });

async function registerAndLogin(
  app: FastifyInstance,
  email = 'drill@example.com',
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

async function seedOpeningsAndPositions(pool: Pool) {
  for (const opening of OPENINGS) {
    await pool.query(
      'INSERT INTO openings (id, name, color, eco) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [opening.id, opening.name, opening.color, opening.eco]
    );
  }
  for (const pos of POSITIONS) {
    await pool.query(
      'INSERT INTO positions (id, opening_id, fen, san, move_number, parent_id, trap_tag) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
      [pos.id, pos.openingId, pos.fen, pos.san, pos.moveNumber, pos.parentId, pos.trapTag]
    );
  }
}

async function seedCard(
  pool: Pool,
  {
    id,
    userId,
    positionId,
    state = 'review',
    step = 0,
    interval = 3,
    easeFactor = 2.5,
    dueAt = new Date('2026-03-21T00:00:00Z'),
  }: {
    id: string;
    userId: string;
    positionId: string;
    state?: string;
    step?: number;
    interval?: number;
    easeFactor?: number;
    dueAt?: Date;
  }
) {
  await pool.query(
    `INSERT INTO cards (id, user_id, position_id, state, step, interval, ease_factor, due_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [id, userId, positionId, state, step, interval, easeFactor, dueAt]
  );
}

describe('Drill Routes', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeEach(async () => {
    await truncateTables(pool);
    app = await buildTestApp();
    await app.ready();
    await seedOpeningsAndPositions(pool);
    const creds = await registerAndLogin(app);
    userId = creds.userId;
    accessToken = creds.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/drill/session', () => {
    it('authenticated → 200 with session object containing cards array', async () => {
      await seedCard(pool, { id: 'card-1', userId, positionId: 'pos-1' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('cards');
      expect(Array.isArray(body.cards)).toBe(true);
    });

    it('unauthenticated → 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
      });

      expect(response.statusCode).toBe(401);
    });

    it('no cards due → 200 with empty cards array', async () => {
      // Seed card with future due date
      await seedCard(pool, {
        id: 'card-future',
        userId,
        positionId: 'pos-1',
        dueAt: new Date('2026-03-30T00:00:00Z'),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.cards).toHaveLength(0);
    });

    it('respects maxNew and maxReview query params', async () => {
      // Seed 10 due cards
      for (let i = 1; i <= 10; i++) {
        await seedCard(pool, {
          id: `card-${i}`,
          userId,
          positionId: `pos-${(i % POSITIONS.length) + 1}`,
          state: 'review',
          dueAt: new Date('2026-03-21T00:00:00Z'),
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session?maxNew=2&maxReview=3',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.cards.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /api/drill/answer', () => {
    let cardId: string;

    beforeEach(async () => {
      cardId = 'answer-card-1';
      await seedCard(pool, {
        id: cardId,
        userId,
        positionId: 'pos-1',
        state: 'review',
        interval: 3,
        easeFactor: 2.5,
        dueAt: new Date('2026-03-21T00:00:00Z'),
      });
    });

    it('correct grade → 200, card interval increases', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/drill/answer',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cardId, grade: 'correct' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.card.interval).toBeGreaterThan(3);
    });

    it('hint grade → 200, ease factor decreases', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/drill/answer',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cardId, grade: 'hint' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.card.easeFactor).toBeCloseTo(2.3, 5);
    });

    it('incorrect grade → 200, card resets to learning step 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/drill/answer',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cardId, grade: 'incorrect' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.card.state).toBe('learning');
      expect(body.card.step).toBe(0);
    });

    it('invalid cardId → 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/drill/answer',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cardId: 'nonexistent-card-id', grade: 'correct' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('card belongs to other user → 403', async () => {
      // Create another user and their card
      const otherCreds = await registerAndLogin(app, 'other@example.com');
      await seedCard(pool, {
        id: 'other-user-card',
        userId: otherCreds.userId,
        positionId: 'pos-2',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/drill/answer',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cardId: 'other-user-card', grade: 'correct' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/drill/openings', () => {
    it('returns 200 with array of openings', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/openings',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('name');
      expect(body[0]).toHaveProperty('eco');
    });
  });

  describe('GET /api/drill/progress/:openingId', () => {
    it('returns 200 with mastered/total counts', async () => {
      // Seed cards for the opening
      await seedCard(pool, { id: 'prog-card-1', userId, positionId: 'pos-1', interval: 25 });
      await seedCard(pool, { id: 'prog-card-2', userId, positionId: 'pos-2', interval: 5 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/progress/opening-1',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('mastered');
      expect(body).toHaveProperty('total');
      expect(typeof body.mastered).toBe('number');
      expect(typeof body.total).toBe('number');
    });
  });
});
