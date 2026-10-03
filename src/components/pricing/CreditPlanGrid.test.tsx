import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreditPlanGrid } from './CreditPlanGrid';

const TIERS = [
  { tier_id: 'tier_425a5db7', name: 'Forma Nova Credits', type: 'one_time', credits: 50 },
  { tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 },
  { tier_id: 'tier_a15d8b06', name: 'FormaNova Credits', type: 'one_time', credits: 160 },
  { tier_id: 'tier_6867e598', name: 'Standard', type: 'subscription', credits: 500 },
  { tier_id: 'tier_a80444ac', name: 'Pro', type: 'subscription', credits: 1500 },
];

function renderGrid(tiers = TIERS, isINR = false, cadRequiredCredits?: number, onCheckout = vi.fn()) {
  render(
    <CreditPlanGrid
      tiers={tiers}
      cadRequiredCredits={cadRequiredCredits}
      isINR={isINR}
      symbol={isINR ? '₹' : '$'}
      currency={isINR ? 'INR' : 'USD'}
      loadingTier={null}
      unavailableTier={null}
      errorTier={null}
      onCheckout={onCheckout}
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

  it('keeps Plus off the normal view even though the backend returns it', () => {
    renderGrid();
    expect(screen.queryByText('Plus')).not.toBeInTheDocument();
    expect(screen.queryByText('$14')).not.toBeInTheDocument();
    expect(screen.getByText('One-time offer')).toBeInTheDocument();
  });

  it('shows INR prices for Indian users', () => {
    renderGrid(TIERS, true);
    for (const price of ['₹200', '₹999', '₹3,499', '₹8,999']) {
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

  it('CAD shortfall of 140: shows Plus, Standard and Pro only, with Plus as a general package', () => {
    renderGrid(TIERS, false, 140);
    for (const price of ['$14', '$39', '$99']) expect(screen.getByText(price)).toBeInTheDocument();
    expect(screen.queryByText('$2')).not.toBeInTheDocument();
    expect(screen.queryByText('$9')).not.toBeInTheDocument();
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.queryByText('Not enough for 1 CAD generation')).not.toBeInTheDocument();
    expect(screen.getByText('Plus')).toBeInTheDocument();
    expect(screen.getByText('160 credits')).toBeInTheDocument();
    expect(screen.getByText(/^Up to 20 standard photos\s*or 1 CAD generation$/)).toBeInTheDocument();
  });

  it('CAD shortfall of 100: Basic can still fund it, so it stays', () => {
    renderGrid(TIERS, false, 100);
    expect(screen.getByText('$9')).toBeInTheDocument();
    expect(screen.getByText('$14')).toBeInTheDocument();
    expect(screen.queryByText('$2')).not.toBeInTheDocument();
  });

  it('CAD shortfall shows Plus in INR and sends its tier ID to checkout', () => {
    const onCheckout = vi.fn();
    renderGrid(TIERS, true, 140, onCheckout);
    expect(screen.getByText('₹1,349')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buy 160 Credits' }));
    expect(onCheckout).toHaveBeenCalledWith('tier_a15d8b06');
  });

  it('never renders an unfamiliar tier, and never as Starter', () => {
    const odd = { tier_id: 'tier_future', name: 'Future', type: 'one_time', credits: 250 };
    renderGrid([...TIERS.slice(1), odd]);
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.queryByText('250 credits')).not.toBeInTheDocument();
  });

  it('drops the one-time card once the backend stops returning it', () => {
    renderGrid(TIERS.slice(1));
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.getByText('$9')).toBeInTheDocument();
  });
});
