import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordEncounter, getTrapStats, buildTrapSession } from '../services/trap.service';

const encounterSchema = z.object({
  positionId: z.string(),
  outcome: z.enum(['spotted', 'fell_for']),
});

export async function trapRoutes(fastify: FastifyInstance) {
  const pool = fastify.db;

  // GET /trap/session
  fastify.get('/session', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    const positions = await buildTrapSession(user.userId, 20);
    return reply.status(200).send(positions);
  });

  // POST /trap/encounter
  fastify.post('/encounter', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };

    let body: { positionId: string; outcome: 'spotted' | 'fell_for' };
    try {
      body = encounterSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { positionId, outcome } = body;

    // Check position exists
    const posResult = await pool.query('SELECT id FROM positions WHERE id = $1', [positionId]);
    if (posResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Position not found' });
    }

    await recordEncounter(user.userId, positionId, outcome);
    return reply.status(200).send({ outcome });
  });

  // GET /trap/stats
  fastify.get('/stats', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    const stats = await getTrapStats(user.userId);
    return reply.status(200).send(stats);
  });
}
