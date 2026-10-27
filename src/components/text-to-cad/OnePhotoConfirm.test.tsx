import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import OnePhotoConfirm from './OnePhotoConfirm';

describe('OnePhotoConfirm', () => {
  it('says why more angles help and offers both choices', () => {
    render(<OnePhotoConfirm open onAddPhotos={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Only one photo?')).toBeTruthy();
    expect(screen.getByText(/different angles \(front, side, top\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add more photos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with 1 photo' })).toBeTruthy();
  });

  it('puts the focus on the suggested choice, Add more photos', async () => {
    render(<OnePhotoConfirm open onAddPhotos={vi.fn()} onContinue={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent).toBe('Add more photos');
  });

  it('continues only on Continue with 1 photo', () => {
    const onAddPhotos = vi.fn();
    const onContinue = vi.fn();
    render(<OnePhotoConfirm open onAddPhotos={onAddPhotos} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 1 photo' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('goes back to add photos on Add more photos', () => {
    const onAddPhotos = vi.fn();
    const onContinue = vi.fn();
    render(<OnePhotoConfirm open onAddPhotos={onAddPhotos} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add more photos' }));
    expect(onAddPhotos).toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
