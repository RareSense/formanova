import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Pricing from './Pricing';

// /pricing is public (audit PR B). Logged-out visitors see every pack in USD and
// sign in to buy; signed-in users keep the backend's own tier list.

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, initializing: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...auth, loading: false }) }));
vi.mock('@/contexts/CreditsContext', () => ({ useCredits: () => ({ credits: null, loading: false }) }));

// The real locale hook runs: it must not call authenticatedFetch without a token.
const token = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/auth-api', () => ({ getStoredToken: () => token.value }));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: fetchMock }));

vi.mock('@/components/sales/RubyCallDialog', () => ({ RubyCallDialog: () => null }));
vi.mock('@/lib/posthog-events', () => ({ trackRubyCtaClicked: vi.fn() }));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderPricing() {
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/pricing']}>
        <Routes>
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const buyButtons = () => screen.getAllByRole('button', { name: /^Buy .* Credits$/ });

describe('Pricing, logged out', () => {
  beforeEach(() => {
    auth.user = null;
    auth.initializing = false;
    token.value = null;
    fetchMock.mockReset();
    vi.stubEnv('VITE_RUBY_CALL_ALLOWLIST_EMAILS', '*');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('shows every pack, the $2 offer included, in USD, without any authenticated request', () => {
    renderPricing();
    expect(screen.getByText('One-time offer')).toBeInTheDocument();
    for (const name of ['Basic', 'Essential', 'Standard', 'Pro']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(buyButtons()).toHaveLength(5);
    expect(screen.getByText('$2')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a visitor who picks a pack to sign in, then back to /pricing', () => {
    renderPricing();
    fireEvent.click(buyButtons()[1]);
    expect(screen.getByTestId('where')).toHaveTextContent('/login?redirect=%2Fpricing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('links back to Home, not the Dashboard', () => {
    renderPricing();
    const back = screen.getByRole('link', { name: /home/i });
    expect(back).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('shows the Done For You card, which goes through sign-in before the call', () => {
    renderPricing();
    fireEvent.click(screen.getByRole('button', { name: /get my price/i }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/login?redirect=${encodeURIComponent('/pricing?talk=ruby')}`);
  });

  it('waits for the session check before choosing what to show', () => {
    auth.initializing = true;
    renderPricing();
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Buy .* Credits$/ })).toHaveLength(0);
  });
});

describe('Pricing, signed in (unchanged)', () => {
  beforeEach(() => {
    auth.user = { id: 'u1', email: 'a@b.c' };
    auth.initializing = false;
    token.value = 'jwt';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/billing/tiers') {
        // Starter already bought: the backend no longer returns it.
        return { ok: true, json: async () => [
          { tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 },
          { tier_id: 'tier_6867e598', name: 'Standard', type: 'subscription', credits: 500 },
        ] };
      }
      return { ok: true, json: async () => ({ country: 'US', currency: 'USD', symbol: '$' }) };
    });
  });

  it("shows exactly the backend's tiers, not the public list", async () => {
    renderPricing();
    await waitFor(() => expect(buyButtons()).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith('/billing/tiers');
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.queryByText('Essential')).not.toBeInTheDocument();
  });

  it('still links back to the Dashboard', async () => {
    renderPricing();
    await waitFor(() => expect(buyButtons()).toHaveLength(2));
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
  });
});
