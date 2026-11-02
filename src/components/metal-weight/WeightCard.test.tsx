import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { findAlloy } from '@/lib/metal-weight/alloys';
import { NO_VOLUME_REASON, type WeightSource } from '@/lib/metal-weight/source';
import { WeightCard } from './WeightCard';

const measured: WeightSource = { available: true, volumeMm3: 2192.4, from: 'version' };
const target = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };

function renderCard(props: Partial<Parameters<typeof WeightCard>[0]> = {}) {
  const setAlloyId = vi.fn();
  render(<WeightCard source={measured} target={target} alloy={findAlloy('au14y')!} setAlloyId={setAlloyId} {...props} />);
  return { setAlloyId };
}

const header = () => screen.getByRole('button', { name: /metal weight/i });
const picker = () => screen.getByRole('radiogroup', { name: 'Metal' });
const radios = () => within(picker()).getAllByRole('radio');
const rowOf = (label: string) => screen.getByRole('radio', { name: label }).closest('tr') as HTMLElement;
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').slice(1).map((c) => c.textContent);

describe('WeightCard', () => {
  it('is open by default, with the target on the header line', () => {
    renderCard();
    expect(header()).toHaveAttribute('aria-expanded', 'true');
    expect(within(header()).getByText('Target 28.00 g ±5%')).toBeInTheDocument();
  });

  it('keeps the weight and metal on the header when collapsed', () => {
    renderCard();
    fireEvent.click(header());
    expect(header()).toHaveAttribute('aria-expanded', 'false');
    expect(within(header()).getByText('27.98 g · 14K Yellow Gold')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is one table: Metal, g, dwt, Finished (−5%), all to 2 decimals', () => {
    renderCard();
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Metal', 'g', 'dwt', 'Finished (−5%)']);
    expect(cells(rowOf('14K Yellow Gold'))).toEqual(['27.98', '17.99', '26.58']);
    expect(cells(rowOf('18K Yellow Gold'))).toEqual(['33.96', '21.84', '32.26']);
    expect(cells(rowOf('Platinum 950 (ruthenium)'))).toEqual(['45.38', '29.18', '43.11']);
  });

  it('lists the common five as radios, the shown metal checked and highlighted', () => {
    renderCard();
    expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual([
      '10K Yellow Gold', '14K Yellow Gold', '18K Yellow Gold', 'Sterling Silver 925', 'Platinum 950 (ruthenium)',
    ]);
    expect(screen.getByRole('radio', { name: '14K Yellow Gold' })).toBeChecked();
    expect(rowOf('14K Yellow Gold')).toHaveAttribute('data-selected', 'true');
    expect(rowOf('10K Yellow Gold')).not.toHaveAttribute('data-selected');
  });

  it('selects a metal from its radio or anywhere on its row', () => {
    const { setAlloyId } = renderCard();
    fireEvent.click(screen.getByRole('radio', { name: '18K Yellow Gold' }));
    expect(setAlloyId).toHaveBeenLastCalledWith('au18y');
    fireEvent.click(within(rowOf('Sterling Silver 925')).getAllByRole('cell')[1]);
    expect(setAlloyId).toHaveBeenLastCalledWith('ag925');
  });

  it('shows the target status once, under the table', () => {
    renderCard();
    expect(screen.getAllByText(/On target/)).toHaveLength(1);
    expect(screen.getByText('On target (−0.1%)')).toBeInTheDocument();
  });

  it('says which metal an off-target status is for when it is not the target metal', () => {
    renderCard({ alloy: findAlloy('au18y')! });
    expect(screen.getByText('21.3% over in 18K Yellow Gold')).toBeInTheDocument();
  });

  it('shows all 21 metals grouped by family on request, as the same picker', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Show all metals' }));
    expect(radios()).toHaveLength(21);
    const groups = within(screen.getByRole('table')).getAllByRole('rowheader').map((h) => h.textContent);
    expect(groups).toEqual(['Gold', 'Silver', 'Platinum', 'Palladium']);
    expect(screen.getByRole('button', { name: 'Show common metals' })).toBeInTheDocument();
  });

  it('keeps the shown metal listed even when it is not one of the common five', () => {
    renderCard({ alloy: findAlloy('au22y')! });
    expect(screen.getByRole('radio', { name: '22K Yellow Gold' })).toBeChecked();
  });

  it('cites the density exactly as written, with its source', () => {
    renderCard({ alloy: findAlloy('pt950ru')! });
    expect(screen.getByText(/Density 20\.70 g\/cm³/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'UPMR 95% Pt / 5% Ru' });
    expect(link).toHaveAttribute('href', 'https://www.unitedpmr.com/wp-content/uploads/2024/06/PT95RUTH.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says when weight is not available, with no table or figures', () => {
    renderCard({ source: { available: false, reason: NO_VOLUME_REASON } });
    expect(screen.getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(header());
    expect(within(header()).getByText('Not available')).toBeInTheDocument();
  });
});
