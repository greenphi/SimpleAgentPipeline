import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildSession, nextInterval } from '@chess-trainer/shared';

const answerSchema = z.object({
  cardId: z.string(),
  grade: z.enum(['correct', 'hint', 'incorrect']),
});

export async function drillRoutes(fastify: FastifyInstance) {
  const pool = fastify.db;

  // GET /drill/session
  fastify.get('/session', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    const query = request.query as { maxNew?: string; maxReview?: string };
    const maxNew = parseInt(query.maxNew ?? '5', 10);
    const maxReview = parseInt(query.maxReview ?? '20', 10);

    const result = await pool.query(
      `SELECT c.id, c.user_id as "userId", c.position_id as "positionId",
              c.state, c.step, c.interval, c.ease_factor as "easeFactor",
              c.due_at as "dueAt", c.created_at as "createdAt", c.updated_at as "updatedAt",
              p.fen, p.san, p.move_number as "moveNumber", p.opening_id as "openingId",
              p.trap_tag as "trapTag"
       FROM cards c
       JOIN positions p ON c.position_id = p.id
       WHERE c.user_id = $1`,
      [user.userId]
    );

    const cards = result.rows.map((row) => ({
      id: row.id,
      positionId: row.positionId,
      state: row.state,
      step: row.step,
      interval: row.interval,
      easeFactor: row.easeFactor,
      dueAt: new Date(row.dueAt),
      trapTag: row.trapTag,
      isNew: false,
      position: {
        id: row.positionId,
        fen: row.fen,
        san: row.san,
        moveNumber: row.moveNumber,
        openingId: row.openingId,
        trapTag: row.trapTag,
      },
    }));

    const sessionCards = buildSession(cards, {
      maxNew,
      maxReview,
      now: new Date(),
    });

    return reply.status(200).send({ cards: sessionCards });
  });

  // POST /drill/answer
  fastify.post('/answer', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    let body: { cardId: string; grade: 'correct' | 'hint' | 'incorrect' };

    try {
      body = answerSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { cardId, grade } = body;

    const result = await pool.query(
      'SELECT * FROM cards WHERE id = $1',
      [cardId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Card not found' });
    }

    const card = result.rows[0];
    if (card.user_id !== user.userId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const cardObj = {
      id: card.id,
      positionId: card.position_id,
      state: card.state as 'learning' | 'review',
      step: card.step,
      interval: card.interval,
      easeFactor: card.ease_factor,
      dueAt: new Date(card.due_at),
    };

    const update = nextInterval(cardObj, grade, new Date());

    await pool.query(
      `UPDATE cards SET state = $1, step = $2, interval = $3, ease_factor = $4, due_at = $5, updated_at = NOW()
       WHERE id = $6`,
      [update.state, update.step, update.interval, update.easeFactor, update.dueAt, cardId]
    );

    const updatedCard = {
      id: card.id,
      positionId: card.position_id,
      state: update.state,
      step: update.step,
      interval: update.interval,
      easeFactor: update.easeFactor,
      dueAt: update.dueAt,
    };

    return reply.status(200).send({ card: updatedCard });
  });

  // GET /drill/openings
  fastify.get('/openings', { preHandler: fastify.authenticate }, async (_request, reply) => {
    const result = await pool.query('SELECT id, name, color, eco FROM openings');
    return reply.status(200).send(result.rows);
  });

  // GET /drill/progress/:openingId
  fastify.get('/progress/:openingId', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };
    const { openingId } = request.params as { openingId: string };

    const result = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE c.interval >= 21) as mastered
       FROM cards c
       JOIN positions p ON c.position_id = p.id
       WHERE c.user_id = $1 AND p.opening_id = $2`,
      [user.userId, openingId]
    );

    const row = result.rows[0];
    return reply.status(200).send({
      mastered: Number(row.mastered),
      total: Number(row.total),
    });
  });
}
