import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportCard } from '../components/ReportCard';

// Mock recharts to avoid canvas rendering issues in jsdom
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

const FULL_REPORT_DATA = {
  accuracy: 0.82,
  currentStreak: 5,
  bestStreak: 12,
  showSparkline: true,
  masteredCount: 34,
  totalCards: 50,
  hardestPositionId: 'pos-ruy-lopez-3',
  sessionAccuracies: [0.7, 0.75, 0.8, 0.82, 0.85, 0.78, 0.82],
};

const EMPTY_REPORT_DATA = {
  accuracy: 0,
  currentStreak: 0,
  bestStreak: 0,
  showSparkline: false,
  masteredCount: 0,
  totalCards: 0,
  hardestPositionId: null,
  sessionAccuracies: [],
};

describe('ReportCard', () => {
  it('renders accuracy percentage', () => {
    render(<ReportCard data={FULL_REPORT_DATA} />);

    // 0.82 = 82%
    expect(screen.getByText(/82%/)).toBeInTheDocument();
  });

  it('renders streak count', () => {
    render(<ReportCard data={FULL_REPORT_DATA} />);

    // Should show current streak of 5
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/streak/i)).toBeInTheDocument();
  });

  it('does not render sparkline when showSparkline is false', () => {
    render(<ReportCard data={{ ...FULL_REPORT_DATA, showSparkline: false }} />);

    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });

  it('renders sparkline chart when showSparkline is true', () => {
    render(<ReportCard data={FULL_REPORT_DATA} />);

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders mastered count out of total', () => {
    render(<ReportCard data={FULL_REPORT_DATA} />);

    // Should display "34 / 50" or "34 of 50" or similar
    expect(screen.getByText(/34/)).toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
    expect(screen.getByText(/mastered/i)).toBeInTheDocument();
  });

  it('renders "Hardest position" section when hardestPositionId is set', () => {
    render(<ReportCard data={FULL_REPORT_DATA} />);

    expect(screen.getByText(/hardest/i)).toBeInTheDocument();
  });

  it('renders empty state when no data (all zeros)', () => {
    render(<ReportCard data={EMPTY_REPORT_DATA} />);

    // Should show 0% accuracy
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    // No streak
    expect(screen.queryByText(/hardest/i)).not.toBeInTheDocument();
    // No sparkline
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });
});
