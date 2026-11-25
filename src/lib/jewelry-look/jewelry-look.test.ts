import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GEM_REFERENCE_PATH_M,
  JEWELRY_PRESETS, LIBRARY_ID_TO_PRESET, STUDIO_EXPOSURE, STUDIO_SOFTBOXES, STUDIO_WORLD,
  absorptionTransmittance, isStoneLayer, isUsableFileMaterial, layerOf, resolvePartLook, linearRgbToHex, pickGem, pickMetal, studioEnvironmentPixels,
} from '.';

describe('pickGem', () => {
  it('layer beats the object name: diamond_round_01 on stones_ruby is ruby', () => {
    expect(pickGem({ objectName: 'diamond_round_01', layer: 'stones_ruby' })).toBe('ruby');
  });
  it('colour word refines the family: lab_orange_sapphire on stones_sapphire', () => {
    expect(pickGem({ objectName: 'lab_orange_sapphire', layer: 'stones_sapphire' })).toBe('orangeSapphire');
  });
  it('material name wins over layer and object name', () => {
    expect(pickGem({ materialName: 'Emerald', layer: 'stones_ruby', objectName: 'diamond_01' })).toBe('emerald');
  });
  it('new stones', () => {
    expect(pickGem({ objectName: 'pink_sapphire_3' })).toBe('pinkSapphire');
    expect(pickGem({ layer: 'stones_yellow_sapphire' })).toBe('yellowSapphire');
    expect(pickGem({ objectName: 'Padparadscha oval' })).toBe('padparadscha');
    expect(pickGem({ materialName: 'gem_col_orange' })).toBe('orangeSapphire');
  });
  it('falls back to diamond; colour words need word boundaries', () => {
    expect(pickGem({ objectName: 'CenterStone' })).toBe('diamond');
    expect(pickGem({ objectName: 'centered_stone' })).toBe('diamond');
  });
});

describe('pickMetal / layers', () => {
  it('follows the Blender regexes', () => {
    expect(pickMetal({ materialName: 'band_metal_18k_yellow_gold' })).toBe('gold18k');
    expect(pickMetal({ objectName: 'shank_rose' })).toBe('roseGold');
    expect(pickMetal({ objectName: 'Band' })).toBe('gold18k');
  });
  it('reads stone layers and glTF extras', () => {
    expect(isStoneLayer('stones_ruby')).toBe(true);
    expect(isStoneLayer('Stones::Melee')).toBe(true);
    expect(isStoneLayer('metal')).toBe(false);
    const parent = { userData: { layer: 'stones_ruby' }, parent: null };
    expect(layerOf({ userData: {}, parent })).toBe('stones_ruby');
  });
});

describe('presets derive from the Blender values', () => {
  it('metal colour is Blender linear F0 in sRGB', () => {
    expect(JEWELRY_PRESETS.gold18k.color).toBe(linearRgbToHex([1.0, 0.76, 0.4]));
    expect(JEWELRY_PRESETS.gold18k.rough).toBe(0.1);
  });
  it('gem IOR and absorption come from Blender', () => {
    expect(JEWELRY_PRESETS.ruby.ior).toBe(1.77);
    expect(JEWELRY_PRESETS.diamond.ior).toBe(2.42);
    const t = absorptionTransmittance([0.85, 0.06, 0.12], GEM_REFERENCE_PATH_M);
    expect(JEWELRY_PRESETS.ruby.atten).toBe(linearRgbToHex(t));
  });
  it('every library id maps to a preset', () => {
    for (const key of Object.values(LIBRARY_ID_TO_PRESET)) expect(JEWELRY_PRESETS[key]).toBeDefined();
  });
  it('studio light: Blender exposure, world and softboxes', () => {
    expect(STUDIO_EXPOSURE).toBeCloseTo(2 ** -1.4, 6);
    expect(STUDIO_SOFTBOXES.map((s) => s.name)).toEqual(['top', 'key', 'fill', 'strip_L', 'strip_R', 'front_low', 'spark']);
    const px = studioEnvironmentPixels(64, 32);
    // straight up hits the top softbox; straight down is the plain world
    const up = ((31 * 64) + 0) * 4, down = 0;
    expect(px[up]).toBeGreaterThan(1);
    expect(px[down]).toBeCloseTo(STUDIO_WORLD, 5);
  });
});

describe('every viewer reads the same presets', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
  it.each([
    'src/components/text-to-cad/CADCanvas.tsx',
    'src/components/cad-studio/materials.ts',
    'src/components/generations/scissor-glb-materials.ts',
    'src/components/cad-to-catalog/engine/materials.ts',
    'src/components/cad-to-catalog/engine/look.ts',
    'src/components/generations/ScissorGLBGrid.tsx',
  ])('%s imports @/lib/jewelry-look', (file) => {
    expect(read(file)).toMatch(/from ["']@\/lib\/jewelry-look["']/);
  });
  it('admin workflow viewer opens models in the shared-look engine', () => {
    expect(read('src/components/admin/workflow-view/model-viewer.ts')).toContain("@/components/cad-to-catalog/engine/engine");
  });
});

describe('resolvePartLook: one rule for every viewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const THREE = require('three') as typeof import('three');
  const baked = new THREE.MeshPhysicalMaterial({ name: 'band_18k_yellow', color: 0xc8aa5a, metalness: 1, roughness: 0.2 });
  it('keeps a real baked material', () => {
    expect(resolvePartLook({ fileMaterial: baked, objectName: 'band' })).toEqual({ source: 'file' });
    const gem = new THREE.MeshPhysicalMaterial({ name: 'gem_col_orange', color: 0xee6e14, transmission: 1 });
    expect(resolvePartLook({ fileMaterial: gem, objectName: 'stone_1' }).source).toBe('file');
  });
  it('falls back by name/layer when the material is missing or a placeholder', () => {
    expect(resolvePartLook({ fileMaterial: null, objectName: 'diamond_round_01', layer: 'stones_ruby' })).toMatchObject({ source: 'picker', preset: { key: 'ruby' } });
    const clay = new THREE.MeshStandardMaterial({ name: 'clay', color: 0x888888, metalness: 0, roughness: 0.8 });
    expect(resolvePartLook({ fileMaterial: clay, objectName: 'shank_rose' })).toMatchObject({ source: 'picker', preset: { key: 'roseGold' } });
    expect(resolvePartLook({ fileMaterial: new THREE.MeshStandardMaterial({ name: 'Material.001' }), objectName: 'lab_orange_sapphire', layer: 'stones_sapphire' }))
      .toMatchObject({ source: 'picker', preset: { key: 'orangeSapphire' } });
    expect(isUsableFileMaterial(new THREE.MeshStandardMaterial())).toBe(false);
  });
  it('library apply overrides the baked material', () => {
    expect(resolvePartLook({ libraryId: 'ruby', fileMaterial: baked, objectName: 'band' })).toMatchObject({ source: 'library', preset: { key: 'ruby' } });
  });
});
