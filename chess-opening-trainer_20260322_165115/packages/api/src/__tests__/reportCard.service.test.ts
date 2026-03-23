import { describe, it, expect } from 'vitest';
import { computeReportCard } from '../services/reportCard.service';

interface SessionItem {
  grade: 'correct' | 'hint' | 'incorrect';
  hintUsed: boolean;
  cardId: string;
  positionId: string;
}

interface SessionData {
  id: string;
  completedAt: Date;
  items: SessionItem[];
}

interface ReportCard {
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  showSparkline: boolean;
  masteredCount: number;
  totalCards: number;
  hardestPositionId: string | null;
  sessionAccuracies: number[];
}

function makeSession(
  id: string,
  completedAt: Date,
  items: SessionItem[]
): SessionData {
  return { id, completedAt, items };
}

function makeItem(
  grade: 'correct' | 'hint' | 'incorrect',
  positionId = 'pos-1',
  cardId = 'card-1'
): SessionItem {
  return { grade, hintUsed: grade === 'hint', cardId, positionId };
}

function daysAgo(n: number): Date {
  const d = new Date('2026-03-22T12:00:00Z');
  d.setDate(d.getDate() - n);
  return d;
}

describe('computeReportCard', () => {
  it('accuracy = correct_items / total_items (0.75 with 3 correct, 1 incorrect)', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(0), [
        makeItem('correct', 'pos-1', 'card-1'),
        makeItem('correct', 'pos-2', 'card-2'),
        makeItem('correct', 'pos-3', 'card-3'),
        makeItem('incorrect', 'pos-4', 'card-4'),
      ]),
    ];

    const cards = [
      { id: 'card-1', interval: 3 },
      { id: 'card-2', interval: 3 },
      { id: 'card-3', interval: 3 },
      { id: 'card-4', interval: 3 },
    ];

    const result: ReportCard = computeReportCard(sessions, cards, new Date('2026-03-22T12:00:00Z'));

    expect(result.accuracy).toBeCloseTo(0.75, 5);
  });

  it('currentStreak = 3 when sessions on last 3 consecutive days', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(2), [makeItem('correct')]),
      makeSession('s2', daysAgo(1), [makeItem('correct')]),
      makeSession('s3', daysAgo(0), [makeItem('correct')]),
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.currentStreak).toBe(3);
  });

  it('currentStreak = 0 when no session today or yesterday', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(5), [makeItem('correct')]),
      makeSession('s2', daysAgo(6), [makeItem('correct')]),
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.currentStreak).toBe(0);
  });

  it('bestStreak correctly identified across a gap (streak 5, gap, streak 3 → best=5)', () => {
    // streak of 5: days 10-6 ago
    // gap: days 5-4 ago
    // streak of 3: days 3-1 ago
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(10), [makeItem('correct')]),
      makeSession('s2', daysAgo(9), [makeItem('correct')]),
      makeSession('s3', daysAgo(8), [makeItem('correct')]),
      makeSession('s4', daysAgo(7), [makeItem('correct')]),
      makeSession('s5', daysAgo(6), [makeItem('correct')]),
      // gap at 5 and 4
      makeSession('s6', daysAgo(3), [makeItem('correct')]),
      makeSession('s7', daysAgo(2), [makeItem('correct')]),
      makeSession('s8', daysAgo(1), [makeItem('correct')]),
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.bestStreak).toBe(5);
    expect(result.currentStreak).toBe(3);
  });

  it('showSparkline = false when < 7 sessions', () => {
    const sessions: SessionData[] = Array.from({ length: 6 }, (_, i) =>
      makeSession(`s${i}`, daysAgo(6 - i), [makeItem('correct')])
    );

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.showSparkline).toBe(false);
  });

  it('showSparkline = true when >= 7 sessions', () => {
    const sessions: SessionData[] = Array.from({ length: 7 }, (_, i) =>
      makeSession(`s${i}`, daysAgo(6 - i), [makeItem('correct')])
    );

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.showSparkline).toBe(true);
  });

  it('masteredCount = cards with interval >= 21 days', () => {
    const sessions: SessionData[] = [makeSession('s1', daysAgo(0), [makeItem('correct', 'pos-1', 'card-1')])];
    const cards = [
      { id: 'card-1', interval: 21 },
      { id: 'card-2', interval: 25 },
      { id: 'card-3', interval: 20 },
      { id: 'card-4', interval: 3 },
    ];

    const result: ReportCard = computeReportCard(sessions, cards, new Date('2026-03-22T12:00:00Z'));

    expect(result.masteredCount).toBe(2);
    expect(result.totalCards).toBe(4);
  });

  it('hardestPositionId = the positionId with most incorrect grades', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(0), [
        makeItem('incorrect', 'pos-hard', 'card-1'),
        makeItem('incorrect', 'pos-hard', 'card-2'),
        makeItem('incorrect', 'pos-hard', 'card-3'),
        makeItem('incorrect', 'pos-easy', 'card-4'),
        makeItem('correct', 'pos-easy', 'card-5'),
      ]),
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.hardestPositionId).toBe('pos-hard');
  });

  it('sessionAccuracies array has one entry per session in chronological order', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(2), [makeItem('correct'), makeItem('correct')]),       // 1.0
      makeSession('s2', daysAgo(1), [makeItem('correct'), makeItem('incorrect')]),    // 0.5
      makeSession('s3', daysAgo(0), [makeItem('incorrect'), makeItem('incorrect')]),  // 0.0
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.sessionAccuracies).toHaveLength(3);
    expect(result.sessionAccuracies[0]).toBeCloseTo(1.0, 5);
    expect(result.sessionAccuracies[1]).toBeCloseTo(0.5, 5);
    expect(result.sessionAccuracies[2]).toBeCloseTo(0.0, 5);
  });

  it('empty sessions array → accuracy 0, streaks 0, showSparkline false', () => {
    const result: ReportCard = computeReportCard([], [], new Date('2026-03-22T12:00:00Z'));

    expect(result.accuracy).toBe(0);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(0);
    expect(result.showSparkline).toBe(false);
    expect(result.hardestPositionId).toBeNull();
    expect(result.sessionAccuracies).toHaveLength(0);
  });

  it('single session → currentStreak 1, bestStreak 1, showSparkline false', () => {
    const sessions: SessionData[] = [
      makeSession('s1', daysAgo(0), [makeItem('correct')]),
    ];

    const result: ReportCard = computeReportCard(sessions, [], new Date('2026-03-22T12:00:00Z'));

    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(1);
    expect(result.showSparkline).toBe(false);
    expect(result.sessionAccuracies).toHaveLength(1);
  });
});
