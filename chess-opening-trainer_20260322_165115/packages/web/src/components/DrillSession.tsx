import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Chessboard } from 'react-chessboard';
import { HintButton } from './HintButton';

interface Position {
  id: string;
  fen: string;
  san: string;
  moveNumber: number;
  openingId: string;
  hint?: string | null;
  trapTag?: string | null;
}

interface Card {
  id: string;
  positionId: string;
  state: 'learning' | 'review';
  step: number;
  interval: number;
  easeFactor: number;
  dueAt: Date;
  position: Position;
}

interface Session {
  id: string;
  cards: Card[];
}

export function DrillSession(): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  const { data, isLoading } = useQuery<Session>({
    queryKey: ['drill-session'],
    queryFn: async () => {
      const res = await fetch('/api/drill/session');
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (vars: { cardId: string; grade: 'correct' | 'hint' | 'incorrect' }) => {
      const res = await fetch('/api/drill/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div role="status">
        <span>Loading...</span>
      </div>
    );
  }

  if (!data || data.cards.length === 0) {
    return <div>All done!</div>;
  }

  const totalCards = data.cards.length;
  const progress = Math.round((completedCount / totalCards) * 100);
  const currentCard = data.cards[currentIndex];

  if (!currentCard) {
    return <div>All done!</div>;
  }

  const handlePieceDrop = (source: string, target: string): boolean => {
    mutation.mutate(
      { cardId: currentCard.id, grade: 'correct' },
      {
        onSuccess: (result) => {
          if (result.card && result.card.state !== 'learning') {
            setFeedback('correct');
            setCompletedCount((c) => c + 1);
            setCurrentIndex((i) => i + 1);
          } else if (result.correct === false) {
            setFeedback('incorrect');
          } else {
            setFeedback('correct');
            setCompletedCount((c) => c + 1);
            setCurrentIndex((i) => i + 1);
          }
        },
      }
    );
    return true;
  };

  const handleHintUsed = () => {
    mutation.mutate({ cardId: currentCard.id, grade: 'hint' }, {});
  };

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {progress}%
      </div>
      <Chessboard
        position={currentCard.position.fen}
        onPieceDrop={handlePieceDrop}
      />
      <div>Your move</div>
      {currentCard.position.hint !== null && currentCard.position.hint !== undefined && (
        <HintButton hint={currentCard.position.hint} onHintUsed={handleHintUsed} />
      )}
      {feedback === 'incorrect' && (
        <div role="alert">Incorrect - try again!</div>
      )}
    </div>
  );
}
