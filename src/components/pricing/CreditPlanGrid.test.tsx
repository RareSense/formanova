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

  const renderWithDfy = (tiers = TIERS) =>
    render(
      <CreditPlanGrid
        tiers={tiers}
        isINR={false}
        symbol="$"
        currency="USD"
        loadingTier={null}
        unavailableTier={null}
        errorTier={null}
        onCheckout={vi.fn()}
        doneForYou={<div data-testid="dfy">Done for you</div>}
      />,
    );

  it('with Done For You, every plan card carries a "Do it yourself" band and Done For You comes first', () => {
    renderWithDfy();
    const grid = screen.getByTestId('dfy').closest('.grid') as HTMLElement;
    expect(screen.getAllByText('Do it yourself')).toHaveLength(grid.children.length - 1);
    // No section headings: the bands say it.
    expect(screen.queryByText('We do it for you')).not.toBeInTheDocument();
    expect(grid.firstElementChild).toContainElement(screen.getByTestId('dfy'));
  });

  it('puts Done For You and the plans in one grid, so every card is the same width', () => {
    renderWithDfy(TIERS.slice(1)); // 4 plans + Done For You: one row of 5 from xl
    const grid = screen.getByTestId('dfy').closest('.grid') as HTMLElement;
    expect(grid.children).toHaveLength(5);
    expect(grid.className).toContain('xl:grid-cols-5');
    expect(grid.className).toContain('gap-6');
    // odd count: Done For You spans the row on 2-column screens, so no card is left alone
    expect(grid.firstElementChild?.className).toContain('sm:col-span-2');
    expect(grid.firstElementChild?.className).toContain('xl:col-span-1');
  });

  it('with six cards, sits 3 + 3 and only goes to one row from 2xl, so prices never overflow', () => {
    renderWithDfy(TIERS); // $2 starter + 4 plans + Done For You
    const grid = screen.getByTestId('dfy').closest('.grid') as HTMLElement;
    expect(grid.children).toHaveLength(6);
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(grid.className).toContain('2xl:grid-cols-6');
    expect(grid.className).not.toMatch(/(^| )xl:grid-cols/);
  });

  it('with four cards (staging: no $2 or $14), sits 2 + 2 and one row from xl', () => {
    renderWithDfy(TIERS.filter((t) => ![50, 160].includes(t.credits)));
    const grid = screen.getByTestId('dfy').closest('.grid') as HTMLElement;
    expect(grid.children).toHaveLength(4);
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-4');
  });

  it('without Done For You, shows the plans alone with no path labels', () => {
    renderGrid(TIERS);
    expect(screen.queryByText('Do it yourself')).not.toBeInTheDocument();
    expect(screen.queryByText('We do it for you')).not.toBeInTheDocument();
  });
});
