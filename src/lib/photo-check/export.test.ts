import { describe, expect, it } from 'vitest';
import { exportSize } from './export';

describe('exportSize', () => {
  it('keeps the fixed size by default', () => {
    expect(exportSize(2000, 2000)).toEqual({ width: 2000, height: 2000, capped: false });
  });

  it('makes it smaller and keeps the marketplace shape', () => {
    expect(exportSize(2667, 2000, 1200)).toEqual({ width: 1200, height: 900, capped: false });
  });

  it('never enlarges, and says so', () => {
    expect(exportSize(1500, 1500, 3000)).toEqual({ width: 1500, height: 1500, capped: true });
  });

  it('has a sensible minimum and ignores nonsense input', () => {
    expect(exportSize(2000, 2000, 10).width).toBe(200);
    expect(exportSize(2000, 2000, Number.NaN).width).toBe(2000);
  });
});
