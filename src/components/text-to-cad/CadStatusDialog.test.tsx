import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CadStatusDialog from './CadStatusDialog';

describe('CadStatusDialog', () => {
  it('shows the friendly result and closes from its button', () => {
    const onClose = vi.fn();
    render(
      <CadStatusDialog
        notice={{
          tone: 'warning',
          title: 'No safe change found',
          message: 'Your current version is unchanged.',
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Your current version is unchanged.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <CadStatusDialog
        notice={{ tone: 'error', title: 'AI is overwhelmed', message: 'Please try again later.' }}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows AI is overwhelmed in the theme colours, never hard-coded red', () => {
    render(
      <CadStatusDialog
        notice={{ tone: 'error', title: 'AI is overwhelmed', message: 'Please try again later.' }}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.outerHTML).not.toMatch(/red-\d/);
    expect(dialog.className).toContain('border-border');
    const close = screen.getAllByRole('button', { name: 'Close' })[0];
    expect(close.className).toContain('bg-primary');
    expect(close.className).toContain('text-primary-foreground');
  });
});
