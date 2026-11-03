import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Credits from './Credits';
import Pricing from './Pricing';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c' }, loading: false }),
}));
const credits = vi.hoisted(() => ({ value: 10 }));
vi.mock('@/contexts/CreditsContext', () => ({
  useCredits: () => ({ credits: credits.value, loading: false, refreshCredits: vi.fn() }),
}));
vi.mock('@/hooks/use-billing-locale', () => ({
  useBillingLocale: () => ({ currency: 'USD', symbol: '$', country: 'US' }),
}));
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(async () => ({
    ok: true,
    json: async () => [{ tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 }],
  })),
}));
const visible = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-done-for-you-visible', () => ({ useDoneForYouVisible: () => visible.value }));
vi.mock('@/components/pricing/DoneForYouCard', () => ({
  DoneForYouCard: () => <div>Done For You card</div>,
}));
vi.mock('@/components/sales/RubyCallDialog', () => ({
  RubyCallDialog: () => <div>Ruby call dialog</div>,
}));

function renderPage(page: JSX.Element, state?: unknown) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[{ pathname: '/credits', state }]}>{page}</MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Done For You card on the plan pages', () => {
  beforeEach(() => {
    visible.value = true;
    credits.value = 10;
  });

  it('shows on /pricing', async () => {
    renderPage(<Pricing />);
    await waitFor(() => expect(screen.getByText('Done For You card')).toBeInTheDocument());
  });

  it('shows on a normal /credits visit, with the call window', async () => {
    renderPage(<Credits />);
    await waitFor(() => expect(screen.getByText('Done For You card')).toBeInTheDocument());
    expect(screen.getByText('Ruby call dialog')).toBeInTheDocument();
  });

  it('is not shown on the photo shortfall view', async () => {
    renderPage(<Credits />, { requiredCredits: 50, workflowName: 'jewelry_photoshoots_generator' });
    await screen.findByText(/get more credits/i);
    await screen.findAllByText(/basic/i); // the plans have loaded
    expect(screen.queryByText('Done For You card')).not.toBeInTheDocument();
  });

  it('is not shown on the CAD shortfall view', async () => {
    renderPage(<Credits />, { requiredCredits: 500, workflowName: 'ring_cad_nurbs_v1' });
    await screen.findByText(/get more credits/i);
    await screen.findAllByText(/basic/i); // the plans have loaded
    expect(screen.queryByText('Done For You card')).not.toBeInTheDocument();
  });

  it('is not shown for users outside the allowlist', async () => {
    visible.value = false;
    renderPage(<Credits />);
    await screen.findAllByText(/basic/i);
    expect(screen.queryByText('Done For You card')).not.toBeInTheDocument();
  });
});
