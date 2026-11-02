import { describe, expect, it } from 'vitest';
import { findAlloy } from './alloys';
import {
  FINISHING_TOOLTIP,
  formatTargetChip,
  formatPercent,
  formatTagWeight,
  formatTargetStatus,
  formatWeight,
  castingCheckLine,
  metalWeightLine,
  targetSummary,
} from './format';

describe('format', () => {
  it('shows grams and pennyweight to 2 dp', () => {
    expect(formatWeight(27.975024)).toBe('27.98 g · 17.99 dwt');
  });

  it('shows a signed percent to 1 dp, with no negative zero', () => {
    expect(formatPercent(0.015)).toBe('+1.5%');
    expect(formatPercent(-0.146)).toBe('−14.6%');
    expect(formatPercent(-0.0004)).toBe('0.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('words the target status the way jewellers say it', () => {
    expect(formatTargetStatus({ kind: 'on', deviation: 0.015 })).toBe('On target');
    expect(formatTargetStatus({ kind: 'over', deviation: 0.08 })).toBe('8% over target');
    expect(formatTargetStatus({ kind: 'over', deviation: 0.2129 })).toBe('21.3% over target');
    expect(formatTargetStatus({ kind: 'under', deviation: -0.03 })).toBe('3% under target');
  });

  it('shows target grams without trailing zeros', () => {
    expect(formatTargetChip({ grams: 28, tolerancePct: 5, alloyId: null })).toBe('Target 28 g ±5%');
    expect(formatTargetChip({ grams: 28.5, tolerancePct: 2.5, alloyId: null })).toBe('Target 28.5 g ±2.5%');
    expect(formatTargetChip({ grams: 27.975, tolerancePct: 5, alloyId: null })).toBe('Target 27.98 g ±5%');
  });

  it('notes the finishing loss for the After polish header', () => {
    expect(FINISHING_TOOLTIP).toBe('About 5% lost in finishing');
  });

  it('gives the status, with the exact grams for its tooltip', () => {
    const target = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };
    expect(targetSummary(27.975024, target, findAlloy('au14y')!)).toMatchObject({
      text: 'On target', detail: '27.98 g against a 28 g target (±5%)',
    });
    expect(targetSummary(33.960276, target, findAlloy('au18y')!)).toMatchObject({
      text: '21.3% over target', detail: '33.96 g in 18K Yellow Gold against a 28 g target set in 14K Yellow Gold (±5%)',
    });
    expect(targetSummary(20, null, findAlloy('au18y')!)).toBeNull();
  });

  it('treats a legacy target alloy id as the alloy it maps to', () => {
    const target = { grams: 28, tolerancePct: 5, alloyId: '14k_yellow_gold' };
    expect(targetSummary(27.975024, target, findAlloy('au14y')!)?.detail).toBe('27.98 g against a 28 g target (±5%)');
  });

  it('builds the download line, or nothing when there is no weight', () => {
    expect(metalWeightLine({ available: true, volumeMm3: 2192.4, from: 'version' }, findAlloy('au14y')!))
      .toBe('14K Yellow Gold · 27.98 g (17.99 dwt)');
    expect(metalWeightLine({ available: true, volumeMm3: 2192.4, from: 'version' }, findAlloy('pt950ru')!))
      .toBe('Platinum 950 · 45.38 g (29.18 dwt)');
    expect(metalWeightLine({ available: false, reason: 'x' }, findAlloy('au14y')!)).toBeNull();
  });

  it('words casting-check flags in plain jeweller language', () => {
    expect(castingCheckLine(['thin_walls', 'touching_edges'])).toBe('Estimate. Casting check flagged: thin walls, touching edges.');
    expect(castingCheckLine(['self_intersections_not_checked', 'self_intersections', 'stones_not_held']))
      .toBe('Estimate. Casting check flagged: self-intersections not checked, self-intersections, stones not held.');
  });

  it('humanises unknown flags, drops repeats, and says nothing for none', () => {
    expect(castingCheckLine(['sprue_too_thin', 'Porosity-Risk', 'thin_walls', 'thin_walls'])).toBe('Estimate. Casting check flagged: sprue too thin, porosity risk, thin walls.');
    expect(castingCheckLine([])).toBeNull();
    expect(castingCheckLine(null)).toBeNull();
  });

  it('shows the tag weight to 1 dp', () => {
    expect(formatTagWeight(27.975024)).toBe('28.0 g');
  });
});
