import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Chessboard } from 'react-chessboard';

interface TrapPosition {
  id: string;
  fen: string;
  trapTag: string;
  san: string;
  moveNumber: number;
  openingId: string;
}

interface TrapStats {
  total: number;
  spotted: number;
  fellFor: number;
  spotRate: number;
}

interface TrapData {
  positions: TrapPosition[];
  stats: TrapStats;
}

export function TrapMode(): React.ReactElement {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data } = useQuery<TrapData>({
    queryKey: ['trap-session'],
    queryFn: async () => {
      const [posRes, statsRes] = await Promise.all([
        fetch('/api/trap/session'),
        fetch('/api/trap/stats'),
      ]);
      const positions = await posRes.json();
      const stats = await statsRes.json();
      return { positions, stats };
    },
  });

  const mutation = useMutation({
    mutationFn: async (vars: { positionId: string; outcome: 'spotted' | 'fell_for' }) => {
      const res = await fetch('/api/trap/encounter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      return res.json();
    },
  });

  const positions = data?.positions ?? [];
  const stats = data?.stats ?? { total: 0, spotted: 0, fellFor: 0, spotRate: 0 };
  const spotRatePercent = Math.round(stats.spotRate * 100);

  const currentPosition = positions[currentIndex] ?? null;

  const handleSpotted = () => {
    if (!currentPosition) return;
    mutation.mutate(
      { positionId: currentPosition.id, outcome: 'spotted' },
      {
        onSuccess: () => {
          setFeedback('Spotted! Well done!');
          setCurrentIndex((i) => i + 1);
        },
      }
    );
  };

  const handleFellFor = () => {
    if (!currentPosition) return;
    mutation.mutate(
      { positionId: currentPosition.id, outcome: 'fell_for' },
      {
        onSuccess: () => {
          setFeedback('You fell for it!');
          setCurrentIndex((i) => i + 1);
        },
      }
    );
  };

  return (
    <div>
      <h1>Trap Detector</h1>
      <div>
        <span>{positions.length}</span>
        <span> positions loaded</span>
      </div>
      <div>
        <span>Spot rate: {spotRatePercent}%</span>
      </div>
      {feedback && <div>{feedback}</div>}
      {positions.length === 0 ? (
        <div>No trap positions available</div>
      ) : currentPosition ? (
        <div>
          <Chessboard position={currentPosition.fen} />
          <button aria-label="This is a trap!" onClick={handleSpotted}>Flag it!</button>
          <button aria-label="Play normally" onClick={handleFellFor}>Continue</button>
        </div>
      ) : (
        <div>All traps reviewed!</div>
      )}
    </div>
  );
}
