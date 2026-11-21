import { describe, expect, it } from 'vitest';
import { formatSchedule, isStone, stoneSchedule, type PartBox } from './stones';

const part = (layer: string, name: string, sizeMm: [number, number, number]): PartBox => ({ layer, name, sizeMm });

describe('isStone', () => {
  it('recognises stone layers and part names, in English and Chinese', () => {
    expect(isStone(part('GEMS', '', [1, 1, 1]))).toBe(true);
    expect(isStone(part('Layer 01', 'Diamond 1.3', [1, 1, 1]))).toBe(true);
    expect(isStone(part('宝石', '', [1, 1, 1]))).toBe(true);
    expect(isStone(part('METAL', 'shank', [1, 1, 1]))).toBe(false);
  });
});

describe('stoneSchedule', () => {
  it('groups the three-stone ring the way FormaNova\'s own spec sheet lists it', () => {
    const parts: PartBox[] = [
      part('GEMS', 'centre', [8, 6, 4.1]),
      part('GEMS', 'side', [6, 4, 2.9]), part('GEMS', 'side', [6.02, 3.98, 2.9]),
      ...Array.from({ length: 12 }, () => part('GEMS', 'melee', [1.3, 1.3, 0.8])),
      part('METAL', 'shank', [20, 22, 2]),
    ];
    expect(formatSchedule(stoneSchedule(parts))).toBe('Centre: 1 oval or fancy, 8.00 × 6.00 mm; Side stones: 2 oval or fancy, 6.00 × 4.00 mm; Melee: 12 stones, 1.30 mm (12 × 1.30)');
  });

  it('reads a round stone from its two largest sides whatever its orientation', () => {
    expect(stoneSchedule([part('Stones', '', [0.9, 1.5, 1.52])])).toEqual([{ count: 1, shape: 'round', sizeMm: [1.5] }]);
  });

  it('returns nothing when no part is a stone', () => {
    expect(stoneSchedule([part('METAL', '', [20, 20, 2])])).toEqual([]);
  });
});
