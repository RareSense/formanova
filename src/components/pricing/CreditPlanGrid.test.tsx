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

function renderGrid(tiers = TIERS, isINR = false, cadRequiredCredits?: number, onCheckout = vi.fn(), photoShortfall = false) {
  render(
    <CreditPlanGrid
      tiers={tiers}
      cadRequiredCredits={cadRequiredCredits}
      photoShortfall={photoShortfall}
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
    expect(screen.getAllByText('Not suitable for CAD')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Buy 50 Credits' })).toBeInTheDocument();
  });

  it('shows Plus on a direct visit', () => {
    renderGrid();
    expect(screen.getByText('Essential')).toBeInTheDocument();
    expect(screen.getByText('$14')).toBeInTheDocument();
  });

  it('keeps Plus off the photo shortfall view even though the backend returns it', () => {
    renderGrid(TIERS, false, undefined, vi.fn(), true);
    expect(screen.queryByText('Essential')).not.toBeInTheDocument();
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
    expect(screen.getByText(/^Up to 12 photos at 1K$/)).toBeInTheDocument();
    expect(screen.getByText(/or 3 CAD generations/)).toBeInTheDocument();
    expect(screen.getByText(/or 10 CAD generations/)).toBeInTheDocument();
  });

  it('CAD shortfall of 140: shows Plus, Standard and Pro only, with Plus as a general package', () => {
    renderGrid(TIERS, false, 140);
    for (const price of ['$14', '$39', '$99']) expect(screen.getByText(price)).toBeInTheDocument();
    expect(screen.queryByText('$2')).not.toBeInTheDocument();
    expect(screen.queryByText('$9')).not.toBeInTheDocument();
    expect(screen.queryByText('One-time offer')).not.toBeInTheDocument();
    expect(screen.queryByText('Not suitable for CAD')).not.toBeInTheDocument();
    expect(screen.getByText('Essential')).toBeInTheDocument();
    expect(screen.getByText('160 credits')).toBeInTheDocument();
    expect(screen.getByText(/^Up to 20 photos at 1K\s*or 1 CAD generation$/)).toBeInTheDocument();
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

  it('with Done For You, shows two labelled paths: We do it for you, then Do it yourself', () => {
    render(
      <CreditPlanGrid
        tiers={TIERS}
        isINR={false}
        symbol="$"
        currency="USD"
        loadingTier={null}
        unavailableTier={null}
        errorTier={null}
        onCheckout={vi.fn()}
        doneForYou={<div data-testid="dfy">Done For You</div>}
      />,
    );
    const selfService = screen.getByRole('region', { name: 'Do it yourself' });
    const forYou = screen.getByRole('region', { name: 'We do it for you' });
    expect(selfService).toContainElement(screen.getByText('$99'));
    expect(selfService).not.toContainElement(screen.getByTestId('dfy'));
    expect(forYou).toContainElement(screen.getByTestId('dfy'));
    // Done For You comes first, before the plans.
    expect(forYou.compareDocumentPosition(selfService) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives Done For You exactly one plan-card column: same width as every plan', () => {
    render(
      <CreditPlanGrid
        tiers={TIERS}
        isINR={false}
        symbol="$"
        currency="USD"
        loadingTier={null}
        unavailableTier={null}
        errorTier={null}
        onCheckout={vi.fn()}
        doneForYou={<div data-testid="dfy">Done For You</div>}
      />,
    );
    const forYou = screen.getByRole('region', { name: 'We do it for you' });
    const selfService = screen.getByRole('region', { name: 'Do it yourself' });
    const outer = forYou.parentElement as HTMLElement;
    const plans = selfService.querySelector('.grid') as HTMLElement;
    const planCount = plans.children.length;
    // outer grid = Done For You + every plan; the plans span the rest with the same gap, so each card is one column
    expect(outer.className).toContain(`xl:grid-cols-${planCount + 1}`);
    expect(selfService.className).toContain(`xl:col-span-${planCount}`);
    expect(plans.className).toContain(`xl:grid-cols-${planCount}`);
    expect(outer.className).toContain('gap-6');
    expect(plans.className).toContain('gap-6');
  });

  it('without Done For You, shows the plans alone with no path labels', () => {
    renderGrid(TIERS);
    expect(screen.queryByRole('region', { name: 'Do it yourself' })).not.toBeInTheDocument();
    expect(screen.queryByText('We do it for you')).not.toBeInTheDocument();
  });
});
