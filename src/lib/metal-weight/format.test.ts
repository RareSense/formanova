import { describe, expect, it } from 'vitest';
import { findAlloy } from './alloys';
import {
  FINISHING_NOTE,
  formatPercent,
  formatTagWeight,
  formatTargetStatus,
  formatWeight,
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

  it('words the target status', () => {
    expect(formatTargetStatus({ kind: 'on', deviation: 0.015 })).toBe('On target +1.5%');
    expect(formatTargetStatus({ kind: 'over', deviation: 0.146 })).toBe('14.6% over');
    expect(formatTargetStatus({ kind: 'under', deviation: -0.03 })).toBe('3.0% under');
  });

  it('notes the finishing loss', () => {
    expect(FINISHING_NOTE).toBe('after finishing (−5%)');
  });

  it('names the previewed alloy when it is not the one the target was set in', () => {
    const target = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };
    expect(targetSummary(27.975024, target, findAlloy('au14y')!)?.text).toBe('On target −0.1%');
    expect(targetSummary(33.960276, target, findAlloy('au18y')!)?.text).toBe('21.3% over in 18K Yellow Gold');
    expect(targetSummary(33.960276, { ...target, alloyId: null }, findAlloy('au18y')!)?.text).toBe('21.3% over');
    expect(targetSummary(20, null, findAlloy('au18y')!)).toBeNull();
  });

  it('treats a legacy target alloy id as the alloy it maps to', () => {
    const target = { grams: 28, tolerancePct: 5, alloyId: '14k_yellow_gold' };
    expect(targetSummary(27.975024, target, findAlloy('au14y')!)?.text).toBe('On target −0.1%');
  });

  it('builds the download line, or nothing when there is no weight', () => {
    expect(metalWeightLine({ available: true, volumeMm3: 2192.4, from: 'version' }, findAlloy('au14y')!))
      .toBe('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt');
    expect(metalWeightLine({ available: false, reason: 'x' }, findAlloy('au14y')!)).toBeNull();
  });

  it('shows the tag weight to 1 dp', () => {
    expect(formatTagWeight(27.975024)).toBe('28.0 g');
  });
});
