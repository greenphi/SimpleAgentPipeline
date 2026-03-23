import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HintButton } from '../components/HintButton';

describe('HintButton', () => {
  it('renders "Show Hint" button initially', () => {
    render(<HintButton hint="Defend with a6" onHintUsed={vi.fn()} />);

    const button = screen.getByRole('button', { name: /show hint/i });
    expect(button).toBeInTheDocument();
  });

  it('clicking reveals hint text', async () => {
    render(<HintButton hint="Defend with a6" onHintUsed={vi.fn()} />);

    const button = screen.getByRole('button', { name: /show hint/i });
    await userEvent.click(button);

    expect(screen.getByText(/defend with a6/i)).toBeInTheDocument();
  });

  it('is not rendered when no hint is available', () => {
    render(<HintButton hint={null} onHintUsed={vi.fn()} />);

    const button = screen.queryByRole('button', { name: /show hint/i });
    expect(button).not.toBeInTheDocument();
  });

  it('calls onHintUsed callback when clicked', async () => {
    const onHintUsed = vi.fn();
    render(<HintButton hint="Play Bb5" onHintUsed={onHintUsed} />);

    const button = screen.getByRole('button', { name: /show hint/i });
    await userEvent.click(button);

    expect(onHintUsed).toHaveBeenCalledTimes(1);
  });

  it('is disabled after being clicked once', async () => {
    render(<HintButton hint="Play Bb5" onHintUsed={vi.fn()} />);

    const button = screen.getByRole('button', { name: /show hint/i });
    await userEvent.click(button);

    // After clicking, the button should be disabled or no longer present
    const disabledButton = screen.queryByRole('button', { name: /show hint/i });
    if (disabledButton) {
      expect(disabledButton).toBeDisabled();
    } else {
      // Button was removed from DOM after use — also acceptable
      expect(disabledButton).toBeNull();
    }
  });
});
