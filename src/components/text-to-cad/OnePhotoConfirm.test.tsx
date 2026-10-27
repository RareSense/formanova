import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import OnePhotoConfirm from './OnePhotoConfirm';

describe('OnePhotoConfirm', () => {
  it('shows their photo beside the missing angles, with one short line and both choices', () => {
    render(<OnePhotoConfirm open photoUrl="blob:photo-1" onAddPhotos={vi.fn()} onContinue={vi.fn()} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('blob:photo-1');
    expect(screen.getByText('Side')).toBeTruthy();
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Just one photo?')).toBeTruthy();
    expect(screen.getByText('Other sides are a guess. Add 2–3 angles for a closer match.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue anyway' })).toBeTruthy();
  });

  it('keeps its shape without a photo', () => {
    render(<OnePhotoConfirm open onAddPhotos={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('alertdialog').querySelector('img')).toBeNull();
    expect(screen.getByText('Just one photo?')).toBeTruthy();
  });

  it('puts the focus on the suggested choice, Add photos', async () => {
    render(<OnePhotoConfirm open onAddPhotos={vi.fn()} onContinue={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent).toBe('Add photos');
  });

  it('continues only on Continue anyway', () => {
    const onContinue = vi.fn();
    render(<OnePhotoConfirm open onAddPhotos={vi.fn()} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('goes back to add photos on Add photos', () => {
    const onAddPhotos = vi.fn();
    const onContinue = vi.fn();
    render(<OnePhotoConfirm open onAddPhotos={onAddPhotos} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }));
    expect(onAddPhotos).toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
