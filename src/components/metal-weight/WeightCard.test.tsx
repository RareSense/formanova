import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { findAlloy } from '@/lib/metal-weight/alloys';
import { NO_VOLUME_REASON, type WeightSource } from '@/lib/metal-weight/source';
import { WEIGHT_HINT_STORAGE_KEY, WeightCard } from './WeightCard';

const measured: WeightSource = { available: true, volumeMm3: 2192.4, from: 'version' };
const target = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };

function renderCard(props: Partial<Parameters<typeof WeightCard>[0]> = {}) {
  const setAlloyId = vi.fn();
  render(
    <TooltipProvider>
      <WeightCard source={measured} target={target} alloy={findAlloy('au14y')!} setAlloyId={setAlloyId} {...props} />
    </TooltipProvider>,
  );
  return { setAlloyId };
}

const header = () => screen.getByRole('button', { name: /metal weight/i });
const picker = () => screen.getByRole('radiogroup', { name: 'Metal' });
const radios = () => within(picker()).getAllByRole('radio');
const rowOf = (name: string) => screen.getByRole('radio', { name }).closest('tr') as HTMLElement;
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').slice(1).map((c) => c.textContent);

describe('WeightCard', () => {
  beforeEach(() => localStorage.clear());

  it('is open by default, with the target chip on the header line', () => {
    renderCard();
    expect(header()).toHaveAttribute('aria-expanded', 'true');
    expect(within(header()).getByText('Target 28 g ±5%')).toBeInTheDocument();
  });

  it('keeps the weight and metal on the header when collapsed', () => {
    renderCard();
    fireEvent.click(header());
    expect(header()).toHaveAttribute('aria-expanded', 'false');
    expect(within(header()).getByText('27.98 g · 14K Yellow Gold')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is one table: Metal | Grams | DWT | After polish, numbers to 2 dp', () => {
    renderCard();
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Metal', 'Grams', 'DWT', 'After polish']);
    expect(screen.getByRole('button', { name: 'About After polish' })).toBeInTheDocument();
    expect(cells(rowOf('14K Yellow Gold'))).toEqual(['27.98', '17.99', '26.58']);
    expect(cells(rowOf('18K Yellow Gold'))).toEqual(['33.96', '21.84', '32.26']);
    expect(cells(rowOf('Platinum 950'))).toEqual(['45.38', '29.18', '43.11']);
  });

  it('shows jeweller names, one line per row, the alloy detail in the row tooltip', () => {
    renderCard();
    expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual([
      '10K Yellow Gold', '14K Yellow Gold', '18K Yellow Gold', 'Sterling Silver 925', 'Platinum 950',
    ]);
    const platinum = rowOf('Platinum 950');
    expect(platinum).toHaveAttribute('title', 'Platinum 950: UPMR 95% Pt / 5% Ru, 20.70 g/cm³');
    expect(within(platinum).getByText('Platinum 950')).toHaveClass('truncate');
  });

  it('checks and highlights the shown metal', () => {
    renderCard();
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

  it('says On target once, under the table', () => {
    renderCard();
    expect(screen.getAllByText(/target/i).filter((n) => n.textContent === 'On target')).toHaveLength(1);
  });

  it('says how far over target, in the shown metal', () => {
    renderCard({ alloy: findAlloy('au18y')! });
    expect(screen.getByText('21.3% over target')).toBeInTheDocument();
  });

  it('shows the first-time hint until the first pick, and remembers it', () => {
    renderCard();
    expect(screen.getByText('Pick a metal to see its weight')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '18K Yellow Gold' }));
    expect(screen.queryByText('Pick a metal to see its weight')).toBeNull();
    expect(localStorage.getItem(WEIGHT_HINT_STORAGE_KEY)).toBe('seen');
  });

  it('does not show the hint once seen, and survives storage that throws', () => {
    localStorage.setItem(WEIGHT_HINT_STORAGE_KEY, 'seen');
    renderCard();
    expect(screen.queryByText('Pick a metal to see its weight')).toBeNull();
  });

  it('expands to More metals: all 21, grouped by family, the same picker', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'More metals' }));
    expect(radios()).toHaveLength(21);
    const groups = within(screen.getByRole('table')).getAllByRole('rowheader').map((h) => h.textContent);
    expect(groups).toEqual(['Gold', 'Silver', 'Platinum', 'Palladium']);
    expect(screen.getByRole('button', { name: 'Fewer metals' })).toBeInTheDocument();
  });

  it('keeps the shown metal listed even when it is not one of the common five', () => {
    renderCard({ alloy: findAlloy('au22y')! });
    expect(screen.getByRole('radio', { name: '22K Yellow Gold' })).toBeChecked();
  });

  it('prints only "Metal only. Stones not included." under the table; the density is behind How we calculate', () => {
    renderCard({ alloy: findAlloy('pt950ru')! });
    expect(screen.getByText('Metal only. Stones not included.')).toBeInTheDocument();
    expect(screen.queryByText(/g\/cm³/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How we calculate' }));
    expect(screen.getByText(/Weight = model volume × alloy density\./)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'UPMR 95% Pt / 5% Ru' });
    expect(link).toHaveAttribute('href', 'https://www.unitedpmr.com/wp-content/uploads/2024/06/PT95RUTH.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/20\.70 g\/cm³/)).toBeInTheDocument();
  });

  it('qualifies the weight with the casting check, without hiding it', () => {
    renderCard({ volumeFlags: ['thin_walls', 'touching_edges'] });
    expect(screen.getByText('Estimate. Casting check flagged: thin walls, touching edges.')).toBeInTheDocument();
    expect(cells(rowOf('14K Yellow Gold'))).toEqual(['27.98', '17.99', '26.58']);
  });

  it('has no casting line when nothing was flagged', () => {
    renderCard({ volumeFlags: [] });
    expect(screen.queryByText(/Casting check/)).toBeNull();
  });

  it('notes a two-tone piece: the total, weighed in the chosen metal', () => {
    renderCard({ twoTone: true });
    expect(screen.getByText('Two-tone: total of all metal parts, weighed in 14K Yellow Gold.')).toBeInTheDocument();
  });

  it('says when weight is not available, with no table or figures', () => {
    renderCard({ source: { available: false, reason: NO_VOLUME_REASON } });
    expect(screen.getByText('Weight not available for this model.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(header());
    expect(within(header()).getByText('Not available')).toBeInTheDocument();
  });
});
