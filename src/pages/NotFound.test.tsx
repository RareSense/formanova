import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import NotFound from './NotFound';

// nginx sends a 404 status for unknown paths. The noindex tag is the second
// safeguard, for crawlers that only see the rendered page.

describe('NotFound', () => {
  it('tells search engines not to index the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/some-nonsense-xyz']}>
          <NotFound />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(screen.getByText('Oops! Page not found')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex'),
    );
  });
});
