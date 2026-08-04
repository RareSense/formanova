import { describe, expect, it } from 'vitest';
import { colorListValue, normalizeHexColor, tintColor } from '@/lib/brand-colors';

describe('brand colour helpers', () => {
  describe('tintColor', () => {
    it('mixes toward white by the given amount', () => {
      expect(tintColor('#000000', 0.5)).toBe('#808080');
      expect(tintColor('#000000', 1)).toBe('#FFFFFF');
      expect(tintColor('#7A2233', 0)).toBe('#7A2233');
    });

    it('mixes toward black when the surface is dark', () => {
      expect(tintColor('#FFFFFF', 0.5, true)).toBe('#808080');
      expect(tintColor('#FFFFFF', 1, true)).toBe('#000000');
    });

    it('clamps out-of-range amounts instead of producing invalid channels', () => {
      expect(tintColor('#7A2233', 5)).toBe('#FFFFFF');
      expect(tintColor('#7A2233', -5)).toBe('#7A2233');
    });

    it('returns the input unchanged when it is not a full hex triplet', () => {
      expect(tintColor('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
    });
  });

  describe('existing readers still behave', () => {
    it('expands shorthand hex and rgb into #RRGGBB', () => {
      expect(normalizeHexColor('#abc')).toEqual(['#AABBCC']);
      expect(normalizeHexColor('rgb(255, 0, 0)')).toEqual(['#FF0000']);
    });

    it('reads weighted palette records from the scanner', () => {
      expect(colorListValue([{ hex: '#F8F8F7', weight: 0.5, source: 'product_image' }]))
        .toEqual(['#F8F8F7']);
    });
  });
});
