import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewportSideTools, ViewportToolbar } from './ViewportOverlays';

describe('ViewportSideTools', () => {
  const props = { visible: true, onZoomIn: vi.fn(), onZoomOut: vi.fn(), onResetView: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), undoCount: 0, redoCount: 0 };

  it('centres on the right edge by default', () => {
    const { container } = render(<ViewportSideTools {...props} />);
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toContain('top-1/2');
    expect(strip.className).toContain('right-8');
  });

  it('compact hugs the top-right corner under the toolbar', () => {
    const { container } = render(<ViewportSideTools {...props} compact />);
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toContain('top-14');
    expect(strip.className).not.toContain('top-1/2');
  });
});

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
