import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ReportCardData {
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  showSparkline: boolean;
  masteredCount: number;
  totalCards: number;
  hardestPositionId: string | null;
  sessionAccuracies: number[];
}

interface ReportCardProps {
  data: ReportCardData;
}

export function ReportCard({ data }: ReportCardProps): React.ReactElement {
  const {
    accuracy,
    currentStreak,
    bestStreak,
    showSparkline,
    masteredCount,
    totalCards,
    hardestPositionId,
    sessionAccuracies,
  } = data;

  const accuracyPercent = Math.round(accuracy * 100);
  const sparklineData = sessionAccuracies.map((acc, i) => ({ session: i + 1, accuracy: acc }));

  return (
    <div>
      <p>{accuracyPercent}% accuracy</p>
      <p>{currentStreak} day streak (out of {totalCards} total)</p>
      <p>Personal best: {bestStreak}</p>
      {showSparkline && (
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={sparklineData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="session" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="accuracy" />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p>{masteredCount} mastered</p>
      {hardestPositionId !== null && (
        <p>Hardest position: {hardestPositionId}</p>
      )}
    </div>
  );
}
