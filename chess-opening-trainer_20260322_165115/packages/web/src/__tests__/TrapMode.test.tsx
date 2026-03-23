import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrapMode } from '../components/TrapMode';

// Mock react-chessboard
vi.mock('react-chessboard', () => ({
  Chessboard: ({ position }: { position: string }) => (
    <div
      data-testid="chessboard"
      data-fen={position}
      aria-label="Chess board showing trap position"
    />
  ),
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

const MOCK_TRAP_POSITIONS = [
  {
    id: 'pos-trap-1',
    fen: 'r1bqkb1r/pp1p1ppp/2n2n2/2p1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
    trapTag: 'fried-liver',
    san: 'Nc6',
    moveNumber: 3,
    openingId: 'opening-2',
  },
  {
    id: 'pos-trap-2',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5',
    trapTag: 'noah-ark',
    san: 'Bc5',
    moveNumber: 4,
    openingId: 'opening-1',
  },
];

const MOCK_STATS = {
  total: 10,
  spotted: 7,
  fellFor: 3,
  spotRate: 0.7,
};

describe('TrapMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Trap Detector" heading', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    expect(screen.getByText(/trap detector/i)).toBeInTheDocument();
  });

  it('shows position count when traps are loaded', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    // Shows that there are 2 trap positions
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('renders empty state when 0 traps', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: [], stats: { total: 0, spotted: 0, fellFor: 0, spotRate: 0 } },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    expect(screen.getByText(/no trap/i)).toBeInTheDocument();
  });

  it('displays the board with trap position FEN', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    const board = screen.getByTestId('chessboard');
    expect(board).toHaveAttribute('data-fen', MOCK_TRAP_POSITIONS[0].fen);
  });

  it('prompts user to identify if this is a trap', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    expect(screen.getByText(/trap/i)).toBeInTheDocument();
    // Both buttons should be visible
    expect(screen.getByRole('button', { name: /this is a trap/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play normally/i })).toBeInTheDocument();
  });

  it('clicking "This is a trap!" records spotted encounter', async () => {
    const mockMutate = vi.fn();
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<TrapMode />);

    const spotButton = screen.getByRole('button', { name: /this is a trap/i });
    await userEvent.click(spotButton);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: MOCK_TRAP_POSITIONS[0].id,
        outcome: 'spotted',
      }),
      expect.anything()
    );
  });

  it('clicking "Play normally" records fell_for encounter', async () => {
    const mockMutate = vi.fn();
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<TrapMode />);

    const playButton = screen.getByRole('button', { name: /play normally/i });
    await userEvent.click(playButton);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: MOCK_TRAP_POSITIONS[0].id,
        outcome: 'fell_for',
      }),
      expect.anything()
    );
  });

  it('shows outcome feedback after selection', async () => {
    const mockMutate = vi.fn().mockImplementation((_vars, options) => {
      options?.onSuccess?.({ outcome: 'spotted' });
    });
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<TrapMode />);

    const spotButton = screen.getByRole('button', { name: /this is a trap/i });
    await userEvent.click(spotButton);

    await waitFor(() => {
      const feedback =
        screen.queryByText(/spotted/i) ??
        screen.queryByText(/well done/i) ??
        screen.queryByText(/correct/i);
      expect(feedback).toBeInTheDocument();
    });
  });

  it('stats panel shows spotRate percentage', () => {
    mockUseQuery.mockReturnValue({
      data: { positions: MOCK_TRAP_POSITIONS, stats: MOCK_STATS },
      isLoading: false,
      error: null,
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<TrapMode />);

    // 70% spotRate
    expect(screen.getByText(/70%/)).toBeInTheDocument();
  });
});
