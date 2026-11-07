import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Welcome from './Welcome';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/CinematicHero', () => ({ CinematicHero: () => null }));
vi.mock('@/components/CinematicShowcase', () => ({ CinematicShowcase: () => null }));
vi.mock('@/components/ThemeLogo', () => ({ ThemeLogo: () => null }));

// jsdom has no IntersectionObserver; the scroll-reveal animations only need it to exist.
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });

function renderPage() {
  render(
    <HelmetProvider>
      <MemoryRouter><Welcome /></MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Welcome footer spacing (owner, 2026-11-07: less empty space around Partnerships)', () => {
  it('the partnerships strip is a compact band, not a full-size page section', () => {
    renderPage();
    const band = screen.getByText('Partnerships').closest('footer')!.firstElementChild as HTMLElement;
    expect(band.className).not.toContain('marta-section');
    expect(band.className).toMatch(/\bpy-12\b/);
    expect(band.className).toMatch(/\blg:py-20\b/);
  });

  it('the Start Now section ends with less space before the footer', () => {
    renderPage();
    const cta = screen.getByText('Start Now').closest('section') as HTMLElement;
    expect(cta.className).toMatch(/\bpb-16\b/);
    expect(cta.className).toMatch(/\blg:pb-24\b/);
  });

  it('the Partnerships label sits close to the partner names, with a larger gap before Trusted by (proximity)', () => {
    renderPage();
    const partners = screen.getByText('Partnerships').nextElementSibling as HTMLElement;
    expect(partners.className).toMatch(/\bmt-8\b/);
    expect(partners.className).toMatch(/\bmb-12\b/);
  });
});
