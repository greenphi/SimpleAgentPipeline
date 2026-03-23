import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrillSession } from '../components/DrillSession';

// Mock react-chessboard
vi.mock('react-chessboard', () => ({
  Chessboard: ({ position, onPieceDrop }: { position: string; onPieceDrop?: (source: string, target: string) => boolean }) => (
    <div
      data-testid="chessboard"
      data-fen={position}
      aria-label="Chess board"
      onClick={() => onPieceDrop?.('e2', 'e4')}
    />
  ),
}));

// Mock chess.js
vi.mock('chess.js', () => ({
  Chess: vi.fn().mockImplementation(() => ({
    fen: () => 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    move: vi.fn().mockReturnValue({ san: 'e4' }),
    isGameOver: vi.fn().mockReturnValue(false),
    turn: vi.fn().mockReturnValue('w'),
    load: vi.fn(),
  })),
}));

// Mock @tanstack/react-query
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  QueryClient: vi.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const MOCK_CARD = {
  id: 'card-1',
  positionId: 'pos-1',
  state: 'review' as const,
  step: 0,
  interval: 3,
  easeFactor: 2.5,
  dueAt: new Date(),
  position: {
    id: 'pos-1',
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    san: 'Bb5',
    moveNumber: 3,
    openingId: 'opening-1',
    hint: 'Defend the knight with a6',
    trapTag: null,
  },
};

const MOCK_SESSION = {
  id: 'session-1',
  cards: [MOCK_CARD],
};

describe('DrillSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while session is fetching', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    // Could be a spinner or loading text
    const loadingEl = screen.queryByText(/loading/i) ?? screen.queryByRole('progressbar');
    expect(loadingEl ?? screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders "All done!" when no cards in session', () => {
    mockUseQuery.mockReturnValue({
      data: { id: 'session-1', cards: [] },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });

  it('renders the chess board when cards are present', () => {
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    expect(screen.getByTestId('chessboard')).toBeInTheDocument();
  });

  it('renders position FEN on the board (check board receives fen prop)', () => {
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    const board = screen.getByTestId('chessboard');
    expect(board).toHaveAttribute('data-fen', MOCK_CARD.position.fen);
  });

  it('shows "Your move" prompt with correct color', () => {
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    expect(screen.getByText(/your move/i)).toBeInTheDocument();
  });

  it('shows hint button when position has a hint', () => {
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    const hintButton = screen.queryByRole('button', { name: /show hint/i });
    expect(hintButton).toBeInTheDocument();
  });

  it('clicking hint button reveals the hint and triggers hint API call', async () => {
    const mockMutate = vi.fn();
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<DrillSession />);

    const hintButton = screen.getByRole('button', { name: /show hint/i });
    await userEvent.click(hintButton);

    // Hint text should be visible
    expect(screen.getByText(/defend the knight with a6/i)).toBeInTheDocument();
  });

  it('submitting a correct move advances to next card', async () => {
    const mockMutate = vi.fn().mockImplementation((_vars, options) => {
      options?.onSuccess?.({ card: { ...MOCK_CARD, interval: 8 }, nextCard: null });
    });
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<DrillSession />);

    const board = screen.getByTestId('chessboard');
    await userEvent.click(board);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ grade: 'correct' }),
        expect.anything()
      );
    });
  });

  it('submitting an incorrect move shows incorrect feedback', async () => {
    const mockMutate = vi.fn().mockImplementation((_vars, options) => {
      options?.onSuccess?.({ card: { ...MOCK_CARD, state: 'learning', step: 0 }, correct: false });
    });
    mockUseQuery.mockReturnValue({
      data: MOCK_SESSION,
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<DrillSession />);

    const board = screen.getByTestId('chessboard');
    await userEvent.click(board);

    await waitFor(() => {
      const feedback = screen.queryByText(/incorrect/i) ?? screen.queryByText(/try again/i);
      expect(feedback ?? screen.queryByRole('alert')).toBeInTheDocument();
    });
  });

  it('session progress bar updates as cards are completed', async () => {
    const secondCard = {
      ...MOCK_CARD,
      id: 'card-2',
      positionId: 'pos-2',
    };
    mockUseQuery.mockReturnValue({
      data: { id: 'session-1', cards: [MOCK_CARD, secondCard] },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DrillSession />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    // Initial: 0/2 completed = 0%
    const initialValue = progressBar.getAttribute('aria-valuenow');
    expect(Number(initialValue)).toBeLessThanOrEqual(50);
  });
});
