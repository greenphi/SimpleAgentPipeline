import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { authRoutes } from './routes/auth.routes';
import { drillRoutes } from './routes/drill.routes';
import { reportCardRoutes } from './routes/reportCard.routes';
import { trapRoutes } from './routes/trap.routes';
import { registerFrontendRoutes } from './frontend';

export interface AppConfig {
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

import { FastifyRequest, FastifyReply } from 'fastify';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false,
  });

  // Connect to PostgreSQL
  const pool = new Pool({ connectionString: config.databaseUrl });
  fastify.decorate('db', pool);

  // Connect to Redis
  const redis = new Redis(config.redisUrl);
  fastify.decorate('redis', redis);

  // Register JWT
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Register cookie plugin
  await fastify.register(fastifyCookie);

  // Register rate limiting
  await fastify.register(fastifyRateLimit, {
    global: false,
    max: 10,
    timeWindow: '1 minute',
  });

  // Add authenticate decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(drillRoutes, { prefix: '/api/drill' });
  await fastify.register(reportCardRoutes, { prefix: '/api/report-card' });
  await fastify.register(trapRoutes, { prefix: '/api/trap' });

  // Register frontend HTML routes
  registerFrontendRoutes(fastify);

  // Close DB and Redis on close
  fastify.addHook('onClose', async () => {
    await pool.end();
    await redis.quit();
  });

  return fastify;
}
