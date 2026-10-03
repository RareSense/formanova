import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewportToolbar } from './ViewportOverlays';

describe('ViewportToolbar', () => {
  it('shows all four modes with their labels by default', () => {
    render(<ViewportToolbar mode="orbit" setMode={vi.fn()} />);
    for (const name of ['Orbit', 'Move', 'Rotate', 'Scale']) {
      expect(screen.getByRole('button', { name }).textContent).toBe(name);
    }
  });

  it('compact draws icons only but keeps every mode named for screen readers', () => {
    render(<ViewportToolbar mode="orbit" setMode={vi.fn()} compact />);
    for (const name of ['Orbit', 'Move', 'Rotate', 'Scale']) {
      const button = screen.getByRole('button', { name });
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
    }
  });

  it('limits the buttons to the modes it is given', () => {
    render(<ViewportToolbar mode="orbit" setMode={vi.fn()} compact modes={['orbit']} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeTruthy();
  });

  it('marks the active mode and switches on press', () => {
    const setMode = vi.fn();
    render(<ViewportToolbar mode="rotate" setMode={setMode} compact />);
    expect(screen.getByRole('button', { name: 'Rotate' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Move' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Scale' }));
    expect(setMode).toHaveBeenCalledWith('scale');
  });
});
