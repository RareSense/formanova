import { describe, it, expect } from 'vitest';
import { hslTokenToRgb } from './theme-color';

const round = (c: number[] | null) => c?.map((v) => Math.round(v * 255));

describe('hslTokenToRgb', () => {
  it('reads Tailwind HSL tokens', () => {
    expect(round(hslTokenToRgb('0 0% 100%'))).toEqual([255, 255, 255]);
    expect(round(hslTokenToRgb(' 0 0% 0% '))).toEqual([0, 0, 0]);
    // FormaNova gold accent
    expect(round(hslTokenToRgb('42 85% 38%'))).toEqual([179, 130, 15]);
  });

  it('returns null for anything else so the orb keeps its fallback colour', () => {
    expect(hslTokenToRgb('')).toBeNull();
    expect(hslTokenToRgb('#ffffff')).toBeNull();
  });
});
