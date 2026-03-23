import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, truncateTables } from './setup';
import { Pool } from 'pg';
import { TEST_DB_URL } from './setup';

const pool = new Pool({ connectionString: TEST_DB_URL });

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateTables(pool);
    app = await buildTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('valid data → 201 with userId and token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'ValidPass1!',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('accessToken');
    });

    it('duplicate email → 409', async () => {
      // Register first
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'dupe@example.com', password: 'ValidPass1!' },
      });

      // Try to register again with same email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'dupe@example.com', password: 'AnotherPass1!' },
      });

      expect(response.statusCode).toBe(409);
    });

    it('invalid email format → 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'not-an-email', password: 'ValidPass1!' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('password too short (< 8 chars) → 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'valid@example.com', password: 'short' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed a user
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'login@example.com', password: 'ValidPass1!' },
      });
    });

    it('correct credentials → 200 with accessToken + sets refresh cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'login@example.com', password: 'ValidPass1!' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('accessToken');

      const cookies = response.cookies;
      const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
      expect(refreshCookie).toBeDefined();
    });

    it('wrong password → 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'login@example.com', password: 'WrongPass1!' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('unknown email → 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'ValidPass1!' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register + login to get refresh token
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'refresh@example.com', password: 'ValidPass1!' },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'refresh@example.com', password: 'ValidPass1!' },
      });

      const cookie = loginRes.cookies.find((c) => c.name === 'refreshToken');
      refreshToken = cookie?.value ?? '';
    });

    it('valid refresh token in cookie → 200 with new accessToken', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('accessToken');
    });

    it('invalid/expired token → 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: 'invalid.token.value' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logout clears refresh token from Redis', async () => {
      // Register + login
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'logout@example.com', password: 'ValidPass1!' },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'logout@example.com', password: 'ValidPass1!' },
      });

      const accessToken = JSON.parse(loginRes.body).accessToken;
      const refreshCookie = loginRes.cookies.find((c) => c.name === 'refreshToken');

      // Logout
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
        cookies: { refreshToken: refreshCookie?.value ?? '' },
      });

      expect(logoutRes.statusCode).toBe(200);

      // Verify refresh token is invalidated
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: refreshCookie?.value ?? '' },
      });

      expect(refreshRes.statusCode).toBe(401);
    });
  });

  describe('JWT security', () => {
    it('request with alg:none token → 401', async () => {
      // Craft a token with alg:none
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 'fake-user', iat: Math.floor(Date.now() / 1000) })).toString('base64url');
      const algNoneToken = `${header}.${payload}.`;

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
        headers: { authorization: `Bearer ${algNoneToken}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('tampered token (changed userId in payload) → 401', async () => {
      // Register to get valid token
      const registerRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'tamper@example.com', password: 'ValidPass1!' },
      });

      const validToken = JSON.parse(registerRes.body).accessToken;
      const parts = validToken.split('.');

      // Tamper with payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: 'completely-different-user-id' })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
        headers: { authorization: `Bearer ${tamperedToken}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rate limiting: > 10 login attempts in 1 min → 429', async () => {
      const attempts = Array.from({ length: 12 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'ratelimit@example.com', password: 'WrongPass1!' },
        })
      );

      const responses = await Promise.all(attempts);
      const tooManyRequests = responses.some((r) => r.statusCode === 429);
      expect(tooManyRequests).toBe(true);
    });

    it('protected route without token → 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/drill/session',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
