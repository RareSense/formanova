import { describe, expect, it } from 'vitest';
import fixture from './cad-part-classifier.fixture.json';
import { cadFamilyMembers, cadPartFamilyKey, cadPartKind, groupCadParts } from './cad-part-families';

describe('cadPartFamilyKey', () => {
  it.each([
    ['Pave_Gem_00', 'pave gem'],
    ['Pave_Gem_-1_0', 'pave gem'],
    ['PaveGem_0', 'pave gem'],
    ['pave_L_01_gem', 'pave gem'],
    ['pave_R_01_gem', 'pave gem'],
    ['shankA_pave_l01_gem', 'shank pave gem'],
    ['AccentStone.L.Up', 'accent stone'],
    ['AccentStone.R.Dn', 'accent stone'],
    ['Prong_Claw_0_1', 'prong claw'],
    ['CenterProng_-1_1_mesh', 'center prong'],
    ['HaloDiamond.inner.00', 'halo diamond inner'],
    ['HaloDiamond.outer.00', 'halo diamond outer'],
    ['shank_copy_2', 'shank'],
    ['42', '42'],
  ])('%s -> %s', (name, key) => {
    expect(cadPartFamilyKey(name)).toBe(key);
  });
});

describe('cadPartKind', () => {
  it('sorts stones from metal, and counts unknown parts as metal', () => {
    expect(cadPartKind('Pave_Gem_00')).toBe('stone');
    expect(cadPartKind('Prong_Claw_0_1')).toBe('metal');
    expect(cadPartKind('rose_outer_upper_fold')).toBe('metal');
  });

  it('agrees with the classifier on every recorded part name', () => {
    const { gem, metal } = fixture as { gem: string[]; metal: string[] };
    for (const name of gem) expect(cadPartKind(name)).toBe('stone');
    for (const name of metal) expect(cadPartKind(name)).toBe('metal');
  });
});

describe('groupCadParts', () => {
  const names = [
    'Shank_Base_mesh', 'Pave_Gem_00', 'Pave_Gem_01', 'Pave_Gem_02',
    'Prong_Claw_0_1', 'Prong_Claw_0_2', 'center_diamond', 'rose_petal_1',
  ];

  it('puts stones first, then metal; bigger families first', () => {
    const groups = groupCadParts(names);
    expect(groups.map((g) => [g.kind, g.label, g.names.length])).toEqual([
      ['stone', 'Pave gem', 3],
      ['stone', 'Center diamond', 1],
      ['metal', 'Prong claw', 2],
      ['metal', 'Rose petal', 1],
      ['metal', 'Shank base', 1],
    ]);
  });

  it('keeps the original part names in each family, in input order', () => {
    expect(groupCadParts(names)[0].names).toEqual(['Pave_Gem_00', 'Pave_Gem_01', 'Pave_Gem_02']);
  });
});

describe('cadFamilyMembers', () => {
  it('returns every part with the same family', () => {
    const all = ['pave_L_01_gem', 'pave_R_07_gem', 'Prong_Claw_0_1'];
    expect(cadFamilyMembers('pave_R_07_gem', all)).toEqual(['pave_L_01_gem', 'pave_R_07_gem']);
  });
});
