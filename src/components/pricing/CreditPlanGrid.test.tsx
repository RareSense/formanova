import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { CreditPlanGrid } from './CreditPlanGrid';

const TIERS = [
  { tier_id: 'tier_425a5db7', name: 'Forma Nova Credits', type: 'one_time', credits: 50 },
  { tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 },
  { tier_id: 'tier_6867e598', name: 'Standard', type: 'subscription', credits: 500 },
  { tier_id: 'tier_a80444ac', name: 'Pro', type: 'subscription', credits: 1500 },
];

function renderGrid(tiers = TIERS, isINR = false) {
  render(
    <CreditPlanGrid
      tiers={tiers}
      isINR={isINR}
      symbol={isINR ? '₹' : '$'}
      currency={isINR ? 'INR' : 'USD'}
      loadingTier={null}
      unavailableTier={null}
      errorTier={null}
      onCheckout={vi.fn()}
    />,
  );
}

describe('CreditPlanGrid', () => {
  it('shows the one-time $2 card beside $9 / $39 / $99 for an eligible user', () => {
    renderGrid();
    for (const price of ['$2', '$9', '$39', '$99']) {
      expect(screen.getByText(price)).toBeInTheDocument();
    }
    expect(screen.getByText('One-time offer')).toBeInTheDocument();
    expect(screen.getByText('Not enough for 1 CAD generation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy 50 Credits' })).toBeInTheDocument();
  });

  it('shows INR prices for Indian users', () => {
    renderGrid(TIERS, true);
    for (const price of ['₹199', '₹999', '₹3,499', '₹8,999']) {
      expect(screen.getByText(price)).toBeInTheDocument();
    }
    expect(screen.queryByText('$2')).not.toBeInTheDocument();
  });

  it('shows photo and CAD capacity per plan', () => {
    renderGrid();
    expect(screen.getByText(/^Up to 12 standard photos\s*or 1 CAD generation$/)).toBeInTheDocument();
    expect(screen.getByText(/or 5 CAD generations/)).toBeInTheDocument();
    expect(screen.getByText(/or 15 CAD generations/)).toBeInTheDocument();
  });

  it('drops the one-time card once the backend stops returning it', () => {
    renderGrid(TIERS.slice(1));
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.getByText('$9')).toBeInTheDocument();
  });
});
