import { describe, expect, it } from 'vitest';
import { scheduleRows, stoneSchedule, stonesOnLayers } from './stones';

describe('stone rows', () => {
  it('names centre, side stones and melee like a workshop sheet', () => {
    const g = stoneSchedule([
      { layer: 'GEMS', name: '', sizeMm: [8, 6, 4] },
      { layer: 'GEMS', name: '', sizeMm: [6, 4, 3] }, { layer: 'GEMS', name: '', sizeMm: [6, 4, 3] },
      ...Array.from({ length: 12 }, () => ({ layer: 'GEMS', name: '', sizeMm: [1.3, 1.3, 0.8] as [number, number, number] })),
    ]);
    expect(scheduleRows(g)).toEqual([
      { label: 'Centre', value: '1 oval or fancy, 8.00 × 6.00 mm' },
      { label: 'Side stones', value: '2 oval or fancy, 6.00 × 4.00 mm' },
      { label: 'Melee', value: '12 stones, 1.30 mm (12 × 1.30)' },
    ]);
  });
  it('takes stones from a layer the jeweler picks', () => {
    const parts = [{ layer: 'Layer 03', name: '', sizeMm: [5, 5, 3] as [number, number, number] }, { layer: 'Layer 01', name: '', sizeMm: [20, 20, 3] as [number, number, number] }];
    expect(stoneSchedule(stonesOnLayers(parts, ['Layer 03']))).toEqual([{ count: 1, shape: 'round', sizeMm: [5] }]);
  });
});
