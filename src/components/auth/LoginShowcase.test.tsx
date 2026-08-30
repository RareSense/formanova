import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoginShowcase from '@/components/auth/LoginShowcase';

describe('LoginShowcase', () => {
  it('renders the headline and both before/after images with correct alt text', () => {
    render(<LoginShowcase />);

    expect(screen.getByText('See what FormaNova does with a real photo')).toBeTruthy();
    expect(screen.getByAltText('Jewelry piece before AI photoshoot')).toBeTruthy();
    expect(screen.getByAltText('Model wearing the jewelry after AI photoshoot')).toBeTruthy();
    expect(screen.getByText('Your photo')).toBeTruthy();
    expect(screen.getByText('AI result')).toBeTruthy();
  });

  it('renders both images without a pointer cursor (non-interactive)', () => {
    render(<LoginShowcase />);

    const before = screen.getByAltText('Jewelry piece before AI photoshoot');
    const after = screen.getByAltText('Model wearing the jewelry after AI photoshoot');

    expect(before.className).not.toContain('cursor-pointer');
    expect(after.className).not.toContain('cursor-pointer');
  });
});
