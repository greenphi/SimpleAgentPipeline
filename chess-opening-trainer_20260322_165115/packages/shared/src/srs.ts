export interface Card {
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

export type Grade = 'correct' | 'hint' | 'incorrect';

export interface CardUpdate {
  state: 'learning' | 'review';
  step: number;
  interval: number;
  easeFactor: number;
  dueAt: Date;
}

export interface SessionOptions {
  maxNew: number;
  maxReview: number;
  now?: Date;
  includeTrap?: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TEN_MINUTES_DAYS = 10 / (24 * 60);
const EASE_FLOOR = 1.3;

export function nextInterval(card: Card, grade: Grade, now: Date): CardUpdate {
  const currentEase = card.easeFactor;

  if (card.state === 'learning') {
    if (card.step === 0) {
      if (grade === 'correct') {
        const interval = 1;
        return {
          state: 'learning',
          step: 1,
          interval,
          easeFactor: currentEase,
          dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
        };
      } else {
        const interval = TEN_MINUTES_DAYS;
        return {
          state: 'learning',
          step: 0,
          interval,
          easeFactor: currentEase,
          dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
        };
      }
    } else {
      if (grade === 'correct') {
        const interval = 3;
        return {
          state: 'review',
          step: 0,
          interval,
          easeFactor: currentEase,
          dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
        };
      } else if (grade === 'incorrect') {
        const interval = TEN_MINUTES_DAYS;
        return {
          state: 'learning',
          step: 0,
          interval,
          easeFactor: currentEase,
          dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
        };
      } else {
        const interval = 1;
        return {
          state: 'learning',
          step: 1,
          interval,
          easeFactor: currentEase,
          dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
        };
      }
    }
  } else {
    if (grade === 'correct') {
      const newEase = Math.max(EASE_FLOOR, currentEase + 0.15);
      const newInterval = Math.round(card.interval * newEase);
      return {
        state: 'review',
        step: card.step,
        interval: newInterval,
        easeFactor: newEase,
        dueAt: new Date(now.getTime() + newInterval * ONE_DAY_MS),
      };
    } else if (grade === 'hint') {
      const newEase = Math.max(EASE_FLOOR, currentEase - 0.20);
      const newInterval = card.interval;
      return {
        state: 'review',
        step: card.step,
        interval: newInterval,
        easeFactor: newEase,
        dueAt: new Date(now.getTime() + newInterval * ONE_DAY_MS),
      };
    } else {
      const newEase = Math.max(EASE_FLOOR, currentEase - 0.20);
      const interval = TEN_MINUTES_DAYS;
      return {
        state: 'learning',
        step: 0,
        interval,
        easeFactor: newEase,
        dueAt: new Date(now.getTime() + interval * ONE_DAY_MS),
      };
    }
  }
}

export function buildSession(cards: Card[], opts: SessionOptions): Card[] {
  const now = opts.now ?? new Date();
  const includeTrap = opts.includeTrap !== false;

  let dueCards = cards.filter((c) => c.dueAt <= now);

  if (!includeTrap) {
    dueCards = dueCards.filter((c) => !c.trapTag);
  }

  const newCards = dueCards.filter((c) => c.isNew === true);
  const reviewCards = dueCards.filter((c) => c.isNew !== true);

  const limitedNew = newCards.slice(0, opts.maxNew);
  const limitedReview = reviewCards.slice(0, opts.maxReview);

  return [...limitedNew, ...limitedReview];
}
