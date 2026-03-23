export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test1234!',
  // bcrypt hash of 'Test1234!' with cost 10
  passwordHash: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
};

export const TEST_USER_2 = {
  email: 'other@example.com',
  password: 'Other5678!',
  passwordHash: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
};

export const OPENINGS = [
  { id: 'opening-1', name: 'Ruy López', color: 'white', eco: 'C60' },
  { id: 'opening-2', name: 'Sicilian Defence', color: 'black', eco: 'B20' },
];

export const POSITIONS = [
  {
    id: 'pos-1',
    openingId: 'opening-1',
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    san: 'Bb5',
    moveNumber: 3,
    parentId: null,
    trapTag: null,
  },
  {
    id: 'pos-2',
    openingId: 'opening-1',
    fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    san: 'a6',
    moveNumber: 4,
    parentId: 'pos-1',
    trapTag: null,
  },
  {
    id: 'pos-3',
    openingId: 'opening-2',
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
    san: 'c5',
    moveNumber: 1,
    parentId: null,
    trapTag: null,
  },
  {
    id: 'pos-trap-1',
    openingId: 'opening-2',
    fen: 'r1bqkb1r/pp1p1ppp/2n2n2/2p1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
    san: 'Nc6',
    moveNumber: 3,
    parentId: 'pos-3',
    trapTag: 'fried-liver',
  },
  {
    id: 'pos-trap-2',
    openingId: 'opening-1',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5',
    san: 'Bc5',
    moveNumber: 4,
    parentId: 'pos-1',
    trapTag: 'noah-ark',
  },
];

export const TRAP_POSITIONS = POSITIONS.filter((p) => p.trapTag !== null);

export interface CardSeed {
  id: string;
  userId: string;
  positionId: string;
  state: 'learning' | 'review';
  step: number;
  interval: number;
  easeFactor: number;
  dueAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NOW = new Date('2026-03-22T12:00:00Z');
const PAST = new Date('2026-03-21T12:00:00Z');
const FUTURE = new Date('2026-03-25T12:00:00Z');

/**
 * Creates 20 cards in mixed states:
 * - 5 new (learning step 0, dueAt past)
 * - 8 learning (various steps, dueAt past)
 * - 7 review (dueAt past, 2 mastered with interval >= 21)
 */
export function createMixedCards(userId: string, positionIds: string[]): CardSeed[] {
  const cards: CardSeed[] = [];

  // 5 new cards (step 0, interval 10 min)
  for (let i = 0; i < 5; i++) {
    cards.push({
      id: `card-new-${i + 1}`,
      userId,
      positionId: positionIds[i % positionIds.length],
      state: 'learning',
      step: 0,
      interval: 10 / (24 * 60),
      easeFactor: 2.5,
      dueAt: PAST,
      createdAt: PAST,
      updatedAt: PAST,
    });
  }

  // 8 learning cards (mix of step 0 and step 1)
  for (let i = 0; i < 8; i++) {
    cards.push({
      id: `card-learning-${i + 1}`,
      userId,
      positionId: positionIds[(i + 5) % positionIds.length],
      state: 'learning',
      step: i % 2,
      interval: i % 2 === 0 ? 10 / (24 * 60) : 1,
      easeFactor: 2.5,
      dueAt: PAST,
      createdAt: PAST,
      updatedAt: PAST,
    });
  }

  // 5 regular review cards (interval < 21)
  for (let i = 0; i < 5; i++) {
    cards.push({
      id: `card-review-${i + 1}`,
      userId,
      positionId: positionIds[(i + 13) % positionIds.length],
      state: 'review',
      step: 0,
      interval: 3 + i * 2,
      easeFactor: 2.5,
      dueAt: PAST,
      createdAt: PAST,
      updatedAt: PAST,
    });
  }

  // 2 mastered review cards (interval >= 21)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `card-mastered-${i + 1}`,
      userId,
      positionId: positionIds[(i + 18) % positionIds.length],
      state: 'review',
      step: 0,
      interval: 21 + i * 7,
      easeFactor: 2.65,
      dueAt: PAST,
      createdAt: PAST,
      updatedAt: PAST,
    });
  }

  return cards;
}

export interface SessionSeed {
  id: string;
  userId: string;
  startedAt: Date;
  completedAt: Date;
  openingId: string;
}

export interface SessionItemSeed {
  id: string;
  sessionId: string;
  cardId: string;
  grade: 'correct' | 'hint' | 'incorrect';
  answeredAt: Date;
  hintUsed: boolean;
}

/**
 * Creates 2 completed sessions with session items.
 */
export function createCompletedSessions(
  userId: string,
  sessionIds: string[]
): { sessions: SessionSeed[]; items: SessionItemSeed[] } {
  const day1 = new Date('2026-03-21T10:00:00Z');
  const day1End = new Date('2026-03-21T10:30:00Z');
  const day2 = new Date('2026-03-22T10:00:00Z');
  const day2End = new Date('2026-03-22T10:30:00Z');

  const sessions: SessionSeed[] = [
    {
      id: sessionIds[0] ?? 'session-1',
      userId,
      startedAt: day1,
      completedAt: day1End,
      openingId: 'opening-1',
    },
    {
      id: sessionIds[1] ?? 'session-2',
      userId,
      startedAt: day2,
      completedAt: day2End,
      openingId: 'opening-2',
    },
  ];

  const items: SessionItemSeed[] = [
    // Session 1: 3 correct, 1 incorrect
    { id: 'item-1', sessionId: sessions[0].id, cardId: 'card-new-1', grade: 'correct', answeredAt: day1, hintUsed: false },
    { id: 'item-2', sessionId: sessions[0].id, cardId: 'card-new-2', grade: 'correct', answeredAt: day1, hintUsed: false },
    { id: 'item-3', sessionId: sessions[0].id, cardId: 'card-new-3', grade: 'correct', answeredAt: day1, hintUsed: false },
    { id: 'item-4', sessionId: sessions[0].id, cardId: 'card-new-4', grade: 'incorrect', answeredAt: day1, hintUsed: false },
    // Session 2: 4 correct, 1 hint
    { id: 'item-5', sessionId: sessions[1].id, cardId: 'card-learning-1', grade: 'correct', answeredAt: day2, hintUsed: false },
    { id: 'item-6', sessionId: sessions[1].id, cardId: 'card-learning-2', grade: 'correct', answeredAt: day2, hintUsed: false },
    { id: 'item-7', sessionId: sessions[1].id, cardId: 'card-learning-3', grade: 'correct', answeredAt: day2, hintUsed: false },
    { id: 'item-8', sessionId: sessions[1].id, cardId: 'card-learning-4', grade: 'correct', answeredAt: day2, hintUsed: false },
    { id: 'item-9', sessionId: sessions[1].id, cardId: 'card-learning-5', grade: 'hint', answeredAt: day2, hintUsed: true },
  ];

  return { sessions, items };
}
