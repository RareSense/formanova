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
});
