import { describe, expect, it } from 'vitest';
import { MATERIAL_LIBRARY } from '@/components/cad-studio/materials';
import { METAL_ALLOYS, findAlloy } from '@/lib/metal-weight/alloys';
import { alloyForAppearance, appearanceForAlloy } from './appearance';

const metalIds = new Set(MATERIAL_LIBRARY.filter((m) => m.category === 'metal').map((m) => m.id));

describe('appearanceForAlloy', () => {
  it('gives every alloy a look that exists in the Material panel', () => {
    for (const alloy of METAL_ALLOYS) expect(metalIds.has(appearanceForAlloy(alloy).id)).toBe(true);
  });

  it('maps gold by colour, silver, platinum and palladium', () => {
    expect(['au10y', 'au14wpd', 'au18r', 'au24', 'ag925', 'pt950ir', 'pd950'].map((id) => appearanceForAlloy(findAlloy(id)!).id)).toEqual([
      'gold-yellow-polished', 'gold-white-polished', 'gold-rose-polished', 'gold-yellow-polished',
      'silver-natural-polished', 'platinum-natural-polished', 'platinum-natural-polished',
    ]);
  });
});

describe('alloyForAppearance', () => {
  const from = (materialId: string, currentId: string) => alloyForAppearance(materialId, findAlloy(currentId)!);

  it('keeps the karat when the gold colour changes', () => {
    expect(from('gold-rose-polished', 'au18y')).toBe('au18r');
    expect(from('gold-white-polished', 'au10y')).toBe('au10w'); // nickel white is the default White
  });

  it('keeps the exact alloy when the look already matches it', () => {
    expect(from('gold-white-polished', 'au14wpd')).toBe('au14wpd');
    expect(from('gold-yellow-brushed', 'au22y')).toBe('au22y');
    expect(from('platinum-natural-polished', 'pt950ir')).toBe('pt950ir');
  });

  it('falls back to 14K when the karat has no alloy in that colour', () => {
    expect(from('gold-rose-polished', 'au22y')).toBe('au14r');
  });

  it('moves between families to their default alloy', () => {
    expect(from('gold-yellow-polished', 'ag925')).toBe('au14y');
    expect(from('silver-natural-brushed', 'au18y')).toBe('ag925');
    expect(from('platinum-natural-polished', 'au18y')).toBe('pt950ru');
  });

  it('has no alloy for a look without a cited density, or an unknown id', () => {
    for (const id of ['copper-natural-polished', 'rhodium-natural-polished', 'rhodium-black-polished', 'nope']) {
      expect(from(id, 'au14y')).toBeNull();
    }
  });
});
