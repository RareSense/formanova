import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { findAlloy } from '@/lib/metal-weight/alloys';
import { NO_VOLUME_REASON, type WeightSource } from '@/lib/metal-weight/source';
import { WeightCard } from './WeightCard';

const measured: WeightSource = { available: true, volumeMm3: 2192.4, from: 'version' };

function renderCard(props: Partial<Parameters<typeof WeightCard>[0]> = {}) {
  const setAlloyId = vi.fn();
  render(
    <WeightCard
      source={measured}
      target={{ grams: 28, tolerancePct: 5, alloyId: 'au14y' }}
      alloy={findAlloy('au14y')!}
      setAlloyId={setAlloyId}
      {...props}
    />,
  );
  return { setAlloyId };
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('WeightCard', () => {
  it('is open by default and collapses', () => {
    renderCard();
    const header = screen.getByRole('button', { name: /metal weight/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('≈ 26.58 g after finishing (−5%)')).toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('≈ 26.58 g after finishing (−5%)')).toBeNull();
  });

  it('shows weight, pennyweight, metal and the target line', () => {
    renderCard();
    expect(screen.getAllByText('27.98 g').length).toBeGreaterThan(0);
    expect(screen.getByText('17.99 dwt · 14K Yellow Gold')).toBeInTheDocument();
    expect(screen.getByText(/Target 28\.00 g ±5%/)).toBeInTheDocument();
    expect(screen.getByText('On target −0.1%')).toBeInTheDocument();
  });

  it('has a chip per common metal, the shown one pressed', () => {
    const { setAlloyId } = renderCard();
    const chips = within(screen.getByRole('group', { name: 'Metal' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['10K Yellow Gold', '14K Yellow Gold', '18K Yellow Gold', 'Sterling Silver 925', 'Platinum 950 (ruthenium)']);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chips[2]);
    expect(setAlloyId).toHaveBeenCalledWith('au18y');
  });

  it('compares the common five, and all metals on request', () => {
    renderCard();
    expect(rows()).toHaveLength(5);
    const row18 = rows().find((r) => r.textContent?.startsWith('18K Yellow Gold'))!;
    expect(within(row18).getAllByRole('cell').map((c) => c.textContent)).toEqual(['33.96', '21.84', '32.26']);
    fireEvent.click(screen.getByRole('button', { name: 'Show all metals' }));
    expect(rows()).toHaveLength(21);
  });

  it('cites the density and its source', () => {
    renderCard();
    const link = screen.getByRole('link', { name: 'UPMR 204 Standard Yellow' });
    expect(link).toHaveAttribute('href', 'https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Density 12\.76 g\/cm³/)).toBeInTheDocument();
  });

  it('says when weight is not available, with no table or figures', () => {
    renderCard({ source: { available: false, reason: NO_VOLUME_REASON } });
    expect(screen.getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/\d+\.\d\d g/)).toBeNull();
  });
});
