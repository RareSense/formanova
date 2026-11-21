import { describe, expect, it } from 'vitest';
import { defaultSizeSystem, formatRingSizeIn, ringSizeIn } from './sizes';

describe('ring size systems', () => {
  const us7 = 17.32; // US 7
  it('gives each region its own size for the same finger', () => {
    expect(ringSizeIn('us', us7)).toBe('US 7');
    expect(ringSizeIn('eu', us7)).toBe('EU 54');
    expect(ringSizeIn('uk', us7)).toMatch(/^UK N½?$/);
    expect(ringSizeIn('jp', us7)).toBe('Japan 14');
  });
  it('prints the inside in inches when asked', () => {
    expect(formatRingSizeIn('us', us7, 'in')).toBe('US 7 · 0.682 in inside');
  });
  it('picks the region from the browser language', () => {
    expect(defaultSizeSystem('en-GB')).toBe('uk');
    expect(defaultSizeSystem('en-US')).toBe('us');
    expect(defaultSizeSystem('de-DE')).toBe('eu');
    expect(defaultSizeSystem('ja-JP')).toBe('jp');
  });
});
