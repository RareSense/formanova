import { describe, it, expect } from 'vitest';
import { orbAmp } from './RubyOrb';

describe('orb movement from the voice', () => {
  it('stays still for silence and room noise', () => {
    expect(orbAmp(0)).toBe(0);
    expect(orbAmp(0.008)).toBe(0);
    expect(orbAmp(Number.NaN)).toBe(0);
  });

  it('moves clearly with normal speech and tops out on loud speech', () => {
    expect(orbAmp(0.05)).toBeGreaterThan(0.5);
    expect(orbAmp(0.05)).toBeLessThan(0.7);
    expect(orbAmp(0.2)).toBe(1);
  });

  it('louder always means more movement', () => {
    const levels = [0.012, 0.03, 0.06, 0.09, 0.12].map(orbAmp);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});
