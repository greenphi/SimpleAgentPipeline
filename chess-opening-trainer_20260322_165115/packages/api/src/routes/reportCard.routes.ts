import { FastifyInstance } from 'fastify';
import { computeReportCard } from '../services/reportCard.service';

export async function reportCardRoutes(fastify: FastifyInstance) {
  const pool = fastify.db;

  // GET /report-card
  fastify.get('/', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = request.user as { userId: string };

    // Fetch user's sessions with items
    const sessionsResult = await pool.query(
      `SELECT s.id, s.completed_at as "completedAt"
       FROM sessions s
       WHERE s.user_id = $1 AND s.completed_at IS NOT NULL
       ORDER BY s.completed_at ASC`,
      [user.userId]
    );

    const sessionIds = sessionsResult.rows.map((s: { id: string }) => s.id);

    let sessionItems: Array<{
      sessionId: string;
      grade: 'correct' | 'hint' | 'incorrect';
      hintUsed: boolean;
      cardId: string;
      positionId: string;
    }> = [];

    if (sessionIds.length > 0) {
      const itemsResult = await pool.query(
        `SELECT si.session_id as "sessionId", si.grade, si.hint_used as "hintUsed",
                si.card_id as "cardId", c.position_id as "positionId"
         FROM session_items si
         JOIN cards c ON si.card_id = c.id
         WHERE si.session_id = ANY($1)`,
        [sessionIds]
      );
      sessionItems = itemsResult.rows;
    }

    const sessions = sessionsResult.rows.map((s: { id: string; completedAt: Date }) => ({
      id: s.id,
      completedAt: new Date(s.completedAt),
      items: sessionItems
        .filter((item) => item.sessionId === s.id)
        .map((item) => ({
          grade: item.grade,
          hintUsed: item.hintUsed,
          cardId: item.cardId,
          positionId: item.positionId,
        })),
    }));

    // Fetch user's cards
    const cardsResult = await pool.query(
      'SELECT id, interval FROM cards WHERE user_id = $1',
      [user.userId]
    );
    const cards = cardsResult.rows.map((c: { id: string; interval: number }) => ({
      id: c.id,
      interval: c.interval,
    }));

    const reportCard = computeReportCard(sessions, cards, new Date());
    return reply.status(200).send(reportCard);
  });
}
