import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, truncateTables, TEST_DB_URL } from './setup';
import { OPENINGS, POSITIONS } from './fixtures';

const pool = new Pool({ connectionString: TEST_DB_URL });

async function registerAndLogin(
  app: FastifyInstance,
  email = 'trap-route@example.com',
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
      `INSERT INTO positions (id, opening_id, fen, san, move_number, parent_id, trap_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [pos.id, pos.openingId, pos.fen, pos.san, pos.moveNumber, pos.parentId, pos.trapTag]
    );
  }
}

describe('Trap Routes', () => {
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

  describe('GET /api/trap/session', () => {
    it('authenticated → 200 with trap positions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trap/session',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      body.forEach((pos: { trapTag: string }) => {
        expect(pos.trapTag).toBeTruthy();
      });
    });

    it('unauthenticated → 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trap/session',
      });

      expect(response.statusCode).toBe(401);
    });

    it('0 traps in DB → 200 with empty array', async () => {
      // Remove all trap positions
      await pool.query("UPDATE positions SET trap_tag = NULL WHERE trap_tag IS NOT NULL");

      const response = await app.inject({
        method: 'GET',
        url: '/api/trap/session',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(0);
    });
  });

  describe('POST /api/trap/encounter', () => {
    it('records fell_for outcome', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'pos-trap-1', outcome: 'fell_for' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.outcome).toBe('fell_for');
    });

    it('records spotted outcome', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'pos-trap-1', outcome: 'spotted' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.outcome).toBe('spotted');
    });

    it('invalid outcome → 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'pos-trap-1', outcome: 'unknown_outcome' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('invalid positionId → 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'nonexistent-position', outcome: 'spotted' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/trap/stats', () => {
    it('returns stats object with total, spotted, fellFor, spotRate', async () => {
      // Record some encounters first
      await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'pos-trap-1', outcome: 'spotted' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/trap/encounter',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { positionId: 'pos-trap-2', outcome: 'fell_for' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/trap/stats',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('spotted');
      expect(body).toHaveProperty('fellFor');
      expect(body).toHaveProperty('spotRate');
      expect(body.total).toBe(2);
      expect(body.spotted).toBe(1);
      expect(body.fellFor).toBe(1);
      expect(body.spotRate).toBeCloseTo(0.5, 5);
    });
  });
});
