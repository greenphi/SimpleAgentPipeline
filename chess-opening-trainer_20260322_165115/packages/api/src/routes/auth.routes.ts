import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  const pool = fastify.db;
  const redis = fastify.redis;

  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    let body: { email: string; password: string };
    try {
      body = registerSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { email, password } = body;

    // Check if email exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await pool.query(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
      [userId, email, passwordHash]
    );

    const tokenId = uuidv4();
    const accessToken = fastify.jwt.sign({ userId }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ userId, tokenId, type: 'refresh' }, { expiresIn: '30d' });

    const ttlSeconds = 30 * 24 * 60 * 60;
    await redis.set(`rt:${userId}:${tokenId}`, '1', 'EX', ttlSeconds);

    const isTest = process.env.NODE_ENV === 'test';
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: !isTest,
      path: '/',
      maxAge: ttlSeconds,
    });

    return reply.status(201).send({ userId, accessToken });
  });

  // POST /auth/login (rate limited)
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    let body: { email: string; password: string };
    try {
      body = loginSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { email, password } = body;

    const result = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const userId = user.id;
    const tokenId = uuidv4();
    const accessToken = fastify.jwt.sign({ userId }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ userId, tokenId, type: 'refresh' }, { expiresIn: '30d' });

    const ttlSeconds = 30 * 24 * 60 * 60;
    await redis.set(`rt:${userId}:${tokenId}`, '1', 'EX', ttlSeconds);

    const isTest = process.env.NODE_ENV === 'test';
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: !isTest,
      path: '/',
      maxAge: ttlSeconds,
    });

    return reply.status(200).send({ accessToken });
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string>)['refreshToken'];
    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    let decoded: { userId: string; tokenId: string; type: string };
    try {
      decoded = fastify.jwt.verify(refreshToken) as typeof decoded;
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return reply.status(401).send({ error: 'Not a refresh token' });
    }

    const exists = await redis.get(`rt:${decoded.userId}:${decoded.tokenId}`);
    if (!exists) {
      return reply.status(401).send({ error: 'Refresh token revoked' });
    }

    const accessToken = fastify.jwt.sign({ userId: decoded.userId }, { expiresIn: '15m' });
    return reply.status(200).send({ accessToken });
  });

  // POST /auth/logout
  fastify.post('/logout', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    const refreshToken = (request.cookies as Record<string, string>)['refreshToken'];

    if (refreshToken) {
      try {
        const decoded = fastify.jwt.verify(refreshToken) as { userId: string; tokenId: string };
        await redis.del(`rt:${decoded.userId}:${decoded.tokenId}`);
      } catch {
        // ignore
      }
    }

    // Also delete all tokens for user if no specific tokenId
    reply.clearCookie('refreshToken', { path: '/' });
    return reply.status(200).send({ ok: true });
  });
}
