import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EffortIntroModal } from './EffortIntroModal';

describe('EffortIntroModal', () => {
  it('confirms the default effort with "don\'t show again" on by default', () => {
    const onConfirm = vi.fn();
    render(<EffortIntroModal open defaultEffort="low" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith('low', true);
  });

  it('confirms High when the High option is selected', () => {
    const onConfirm = vi.fn();
    render(<EffortIntroModal open defaultEffort="low" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('radio', { name: /high/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith('high', true);
  });

  it('dismissing via the close (X) calls onDismiss, not onConfirm', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(<EffortIntroModal open defaultEffort="low" onConfirm={onConfirm} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passes dontShowAgain=false when the checkbox is unticked', () => {
    const onConfirm = vi.fn();
    render(<EffortIntroModal open defaultEffort="high" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: /don't show this again/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith('high', false);
  });
});
