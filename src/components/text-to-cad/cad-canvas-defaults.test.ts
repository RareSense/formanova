import { describe, it, expect } from 'vitest';
import type { MaterialDef } from '@/components/cad-studio/materials';
import { referenceKeyForMaterial, isStoneLook } from './CADCanvas';

const def = (fields: Partial<MaterialDef>) => fields as MaterialDef;

describe('referenceKeyForMaterial defaults', () => {
  it('shows a flat metal default as green casting wax', () => {
    expect(referenceKeyForMaterial(def({ id: 'flat-metal-band', category: 'metal' }), 'Band')).toBe('wax');
  });

  it('shows a flat gem default as stone blue', () => {
    expect(referenceKeyForMaterial(def({ id: 'flat-gem-pave', category: 'gemstone' }), 'Pave_Gem_00')).toBe('stoneBlue');
  });

  it('keeps library materials unchanged', () => {
    expect(referenceKeyForMaterial(def({ id: 'gold-yellow-polished', category: 'metal' }), 'Band')).toBe('gold18k');
  });

  it('keeps name-based classification for unassigned parts', () => {
    expect(referenceKeyForMaterial(undefined, 'Pave_Gem_00')).toBe('diamond');
  });
});

describe('isStoneLook', () => {
  it('counts the blue default as a stone and wax as metal', () => {
    expect(isStoneLook('stoneBlue')).toBe(true);
    expect(isStoneLook('wax')).toBe(false);
    expect(isStoneLook('diamond')).toBe(true);
    expect(isStoneLook('gold18k')).toBe(false);
    expect(isStoneLook(null)).toBe(false);
  });
});
