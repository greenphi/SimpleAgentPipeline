export interface SessionItem {
  grade: 'correct' | 'hint' | 'incorrect';
  hintUsed: boolean;
  cardId: string;
  positionId: string;
}

export interface SessionData {
  id: string;
  completedAt: Date;
  items: SessionItem[];
}

export interface ReportCard {
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  showSparkline: boolean;
  masteredCount: number;
  totalCards: number;
  hardestPositionId: string | null;
  sessionAccuracies: number[];
}

function dateToLocalDay(date: Date): string {
  // Use UTC date string for consistent comparison
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function computeReportCard(
  sessions: SessionData[],
  cards: { id: string; interval: number }[],
  now: Date
): ReportCard {
  if (sessions.length === 0) {
    return {
      accuracy: 0,
      currentStreak: 0,
      bestStreak: 0,
      showSparkline: false,
      masteredCount: cards.filter((c) => c.interval >= 21).length,
      totalCards: cards.length,
      hardestPositionId: null,
      sessionAccuracies: [],
    };
  }

  // Sort sessions chronologically
  const sortedSessions = [...sessions].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );

  // Calculate accuracy across all sessions
  let totalItems = 0;
  let correctItems = 0;
  for (const session of sessions) {
    for (const item of session.items) {
      totalItems++;
      if (item.grade === 'correct') correctItems++;
    }
  }
  const accuracy = totalItems === 0 ? 0 : correctItems / totalItems;

  // Session accuracies in chronological order
  const sessionAccuracies = sortedSessions.map((session) => {
    const total = session.items.length;
    if (total === 0) return 0;
    const correct = session.items.filter((i) => i.grade === 'correct').length;
    return correct / total;
  });

  // Get unique session days
  const sessionDays = new Set(sortedSessions.map((s) => dateToLocalDay(s.completedAt)));
  const daysArray = Array.from(sessionDays).sort();

  // Calculate streaks
  let bestStreak = 0;
  let currentStreakInCalc = 0;
  let lastDay: string | null = null;

  for (const day of daysArray) {
    if (lastDay === null) {
      currentStreakInCalc = 1;
    } else {
      // Check if day is consecutive with lastDay
      const lastDate = new Date(lastDay + 'T00:00:00Z');
      const currDate = new Date(day + 'T00:00:00Z');
      const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        currentStreakInCalc++;
      } else {
        currentStreakInCalc = 1;
      }
    }
    if (currentStreakInCalc > bestStreak) {
      bestStreak = currentStreakInCalc;
    }
    lastDay = day;
  }

  // Calculate current streak (from today or yesterday going backwards)
  const today = dateToLocalDay(now);
  const yesterday = dateToLocalDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  let currentStreak = 0;
  if (sessionDays.has(today) || sessionDays.has(yesterday)) {
    // Start counting backwards from today or yesterday
    const startDay = sessionDays.has(today) ? today : yesterday;
    let checkDay = startDay;
    while (sessionDays.has(checkDay)) {
      currentStreak++;
      const checkDate = new Date(checkDay + 'T00:00:00Z');
      const prevDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      checkDay = dateToLocalDay(prevDate);
    }
  }

  // Hardest position - most incorrect grades
  const incorrectCounts: Record<string, number> = {};
  for (const session of sessions) {
    for (const item of session.items) {
      if (item.grade === 'incorrect') {
        incorrectCounts[item.positionId] = (incorrectCounts[item.positionId] ?? 0) + 1;
      }
    }
  }
  let hardestPositionId: string | null = null;
  let maxIncorrect = 0;
  for (const [posId, count] of Object.entries(incorrectCounts)) {
    if (count > maxIncorrect) {
      maxIncorrect = count;
      hardestPositionId = posId;
    }
  }

  const masteredCount = cards.filter((c) => c.interval >= 21).length;

  return {
    accuracy,
    currentStreak,
    bestStreak,
    showSparkline: sessions.length >= 7,
    masteredCount,
    totalCards: cards.length,
    hardestPositionId,
    sessionAccuracies,
  };
}
