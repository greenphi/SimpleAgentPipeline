import { describe, it, expect, beforeEach } from 'vitest';
import { nextInterval, buildSession } from '../srs';

interface Card {
  id: string;
  positionId: string;
  state: 'learning' | 'review';
  step: number;
  interval: number;
  easeFactor: number;
  dueAt: Date;
  trapTag?: string | null;
  isNew?: boolean;
}

type Grade = 'correct' | 'hint' | 'incorrect';

interface CardUpdate {
  state: 'learning' | 'review';
  step: number;
  interval: number;
  easeFactor: number;
  dueAt: Date;
}

interface SessionOptions {
  maxNew: number;
  maxReview: number;
  now?: Date;
  includeTrap?: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TEN_MINUTES_DAYS = 10 / (24 * 60); // ~1/144 day

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    positionId: 'pos-1',
    state: 'learning',
    step: 0,
    interval: TEN_MINUTES_DAYS,
    easeFactor: 2.5,
    dueAt: new Date(),
    trapTag: null,
    isNew: false,
    ...overrides,
  };
}

const NOW = new Date('2026-03-22T12:00:00Z');

describe('nextInterval', () => {
  describe('learning step 0', () => {
    it('correct in step 0 → advances to step 1, interval = 1 day', () => {
      const card = makeCard({ state: 'learning', step: 0, interval: TEN_MINUTES_DAYS });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      expect(result.state).toBe('learning');
      expect(result.step).toBe(1);
      expect(result.interval).toBeCloseTo(1, 5);
    });

    it('incorrect in step 0 → stays at step 0, interval ~10 min (1/144 day)', () => {
      const card = makeCard({ state: 'learning', step: 0, interval: TEN_MINUTES_DAYS });
      const result: CardUpdate = nextInterval(card, 'incorrect', NOW);

      expect(result.state).toBe('learning');
      expect(result.step).toBe(0);
      expect(result.interval).toBeCloseTo(TEN_MINUTES_DAYS, 5);
    });

    it('hint in step 0 → stays at step 0, interval ~10 min', () => {
      const card = makeCard({ state: 'learning', step: 0, interval: TEN_MINUTES_DAYS });
      const result: CardUpdate = nextInterval(card, 'hint', NOW);

      expect(result.state).toBe('learning');
      expect(result.step).toBe(0);
      expect(result.interval).toBeCloseTo(TEN_MINUTES_DAYS, 5);
    });
  });

  describe('learning step 1', () => {
    it('correct in step 1 → graduates to review with interval = 3 days', () => {
      const card = makeCard({ state: 'learning', step: 1, interval: 1 });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      expect(result.state).toBe('review');
      expect(result.interval).toBe(3);
    });

    it('incorrect in step 1 → resets to step 0', () => {
      const card = makeCard({ state: 'learning', step: 1, interval: 1 });
      const result: CardUpdate = nextInterval(card, 'incorrect', NOW);

      expect(result.state).toBe('learning');
      expect(result.step).toBe(0);
    });

    it('hint in step 1 → stays at step 1 (or resets) with consistent behavior', () => {
      const card = makeCard({ state: 'learning', step: 1, interval: 1 });
      const result: CardUpdate = nextInterval(card, 'hint', NOW);

      // Consistent: either stays at step 1 or resets to step 0
      expect(result.state).toBe('learning');
      expect(result.step).toBeGreaterThanOrEqual(0);
      expect(result.step).toBeLessThanOrEqual(1);
    });
  });

  describe('review state', () => {
    it('correct in review → increases interval (ease-factor-scaled), ease factor +0.15', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 3, easeFactor: 2.5 });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      expect(result.state).toBe('review');
      expect(result.interval).toBeGreaterThan(3);
      expect(result.easeFactor).toBeCloseTo(2.65, 5);
    });

    it('hint in review → interval stays same or slightly reduced, ease factor -0.20', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 8, easeFactor: 2.5 });
      const result: CardUpdate = nextInterval(card, 'hint', NOW);

      expect(result.state).toBe('review');
      expect(result.interval).toBeLessThanOrEqual(8);
      expect(result.easeFactor).toBeCloseTo(2.3, 5);
    });

    it('incorrect in review → lapse: state=learning, step=0, ease factor -0.20', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 8, easeFactor: 2.5 });
      const result: CardUpdate = nextInterval(card, 'incorrect', NOW);

      expect(result.state).toBe('learning');
      expect(result.step).toBe(0);
      expect(result.easeFactor).toBeCloseTo(2.3, 5);
    });
  });

  describe('ease factor constraints', () => {
    it('ease factor never goes below 1.3 (floor)', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 8, easeFactor: 1.4 });
      const result: CardUpdate = nextInterval(card, 'incorrect', NOW);

      // 1.4 - 0.20 = 1.2, but floor is 1.3
      expect(result.easeFactor).toBeCloseTo(1.3, 5);
    });

    it('ease factor starts at 2.5 and increases to 2.65 on correct', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 3, easeFactor: 2.5 });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      expect(result.easeFactor).toBeCloseTo(2.65, 5);
    });
  });

  describe('interval scaling', () => {
    it('review card interval=8, easeFactor=2.5, correct → ~21 days', () => {
      const card = makeCard({ state: 'review', step: 0, interval: 8, easeFactor: 2.5 });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      // 8 * 2.5 = 20, rounding may bring it to ~21
      expect(result.interval).toBeGreaterThanOrEqual(19);
      expect(result.interval).toBeLessThanOrEqual(22);
    });
  });

  describe('dueAt scheduling', () => {
    it('dueAt is set to now + interval days', () => {
      const card = makeCard({ state: 'learning', step: 0, interval: TEN_MINUTES_DAYS });
      const result: CardUpdate = nextInterval(card, 'correct', NOW);

      // interval is 1 day after step 0 correct
      const expectedDue = new Date(NOW.getTime() + result.interval * ONE_DAY_MS);
      const diff = Math.abs(result.dueAt.getTime() - expectedDue.getTime());
      // Allow 1 second of tolerance
      expect(diff).toBeLessThan(1000);
    });
  });
});

describe('buildSession', () => {
  const PAST = new Date('2026-03-21T12:00:00Z');
  const FUTURE = new Date('2026-03-23T12:00:00Z');

  function makeCards(count: number, overrides: Partial<Card> = {}): Card[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `card-${i + 1}`,
      positionId: `pos-${i + 1}`,
      state: 'review' as const,
      step: 0,
      interval: 3,
      easeFactor: 2.5,
      dueAt: PAST,
      trapTag: null,
      isNew: false,
      ...overrides,
    }));
  }

  it('returns only cards due now (dueAt <= now)', () => {
    const dueCard = makeCard({ id: 'due-1', dueAt: PAST, state: 'review' });
    const futureCard = makeCard({ id: 'future-1', dueAt: FUTURE, state: 'review' });
    const opts: SessionOptions = { maxNew: 10, maxReview: 10, now: NOW };

    const result = buildSession([dueCard, futureCard], opts);

    expect(result.map((c) => c.id)).toContain('due-1');
    expect(result.map((c) => c.id)).not.toContain('future-1');
  });

  it('returns at most maxNew new cards', () => {
    const newCards = Array.from({ length: 10 }, (_, i) =>
      makeCard({ id: `new-${i}`, isNew: true, dueAt: PAST })
    );
    const opts: SessionOptions = { maxNew: 3, maxReview: 10, now: NOW };

    const result = buildSession(newCards, opts);

    const newInResult = result.filter((c) => c.isNew);
    expect(newInResult.length).toBeLessThanOrEqual(3);
  });

  it('returns at most maxReview review cards', () => {
    const reviewCards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ id: `rev-${i}`, state: 'review', dueAt: PAST, isNew: false })
    );
    const opts: SessionOptions = { maxNew: 10, maxReview: 5, now: NOW };

    const result = buildSession(reviewCards, opts);

    const reviewInResult = result.filter((c) => !c.isNew);
    expect(reviewInResult.length).toBeLessThanOrEqual(5);
  });

  it('mixes new and review cards up to combined limits', () => {
    const newCards = Array.from({ length: 5 }, (_, i) =>
      makeCard({ id: `new-${i}`, isNew: true, dueAt: PAST })
    );
    const reviewCards = Array.from({ length: 5 }, (_, i) =>
      makeCard({ id: `rev-${i}`, state: 'review', dueAt: PAST, isNew: false })
    );
    const opts: SessionOptions = { maxNew: 3, maxReview: 4, now: NOW };

    const result = buildSession([...newCards, ...reviewCards], opts);

    const newInResult = result.filter((c) => c.isNew);
    const reviewInResult = result.filter((c) => !c.isNew);
    expect(newInResult.length).toBeLessThanOrEqual(3);
    expect(reviewInResult.length).toBeLessThanOrEqual(4);
  });

  it('returns empty array when no cards are due', () => {
    const futureCards = Array.from({ length: 5 }, (_, i) =>
      makeCard({ id: `future-${i}`, dueAt: FUTURE, state: 'review' })
    );
    const opts: SessionOptions = { maxNew: 10, maxReview: 10, now: NOW };

    const result = buildSession(futureCards, opts);

    expect(result).toHaveLength(0);
  });

  it('excludes future-due cards from the session', () => {
    const past = makeCard({ id: 'past-1', dueAt: new Date('2026-03-20T00:00:00Z'), state: 'review' });
    const future = makeCard({ id: 'future-1', dueAt: new Date('2026-03-25T00:00:00Z'), state: 'review' });
    const opts: SessionOptions = { maxNew: 10, maxReview: 10, now: NOW };

    const result = buildSession([past, future], opts);

    const ids = result.map((c) => c.id);
    expect(ids).toContain('past-1');
    expect(ids).not.toContain('future-1');
  });

  it('with includeTrap: false, excludes cards with trapTag set', () => {
    const normalCard = makeCard({ id: 'normal-1', dueAt: PAST, trapTag: null });
    const trapCard = makeCard({ id: 'trap-1', dueAt: PAST, trapTag: 'scholars-mate' });
    const opts: SessionOptions = { maxNew: 10, maxReview: 10, now: NOW, includeTrap: false };

    const result = buildSession([normalCard, trapCard], opts);

    const ids = result.map((c) => c.id);
    expect(ids).toContain('normal-1');
    expect(ids).not.toContain('trap-1');
  });

  it('with includeTrap: true, includes trap cards in the session', () => {
    const normalCard = makeCard({ id: 'normal-1', dueAt: PAST, trapTag: null });
    const trapCard = makeCard({ id: 'trap-1', dueAt: PAST, trapTag: 'scholars-mate' });
    const opts: SessionOptions = { maxNew: 10, maxReview: 10, now: NOW, includeTrap: true };

    const result = buildSession([normalCard, trapCard], opts);

    const ids = result.map((c) => c.id);
    expect(ids).toContain('normal-1');
    expect(ids).toContain('trap-1');
  });
});
