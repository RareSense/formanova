/**
 * The one rule every FormaNova viewer uses to decide how a part looks:
 *   1. a material the user picked in the library (overrides everything),
 *   2. else the material baked into the file, when it is a real one,
 *   3. else a shared preset from the picker (material name, layer, object name).
 * There is no default look: a file with real PBR materials shows as authored.
 */
import type * as THREE from 'three';
import { JEWELRY_PRESETS, presetForLibraryId, type JewelryPreset } from './presets';
import { isStoneLayer, pickGem, pickMetal, gemFamily, type PartHints } from './picker';

/** Names exporters give to "no material". */
const PLACEHOLDER_NAME = /^(material|default|defaultmaterial|default[_ ]material|mat|lambert\d*|blinn\d*|phong\d*|initialshadinggroup|none|untitled|no[_ ]?material|dummy)([._ -]?\d+)?$/i;
const PLACEHOLDER_WORD = /wax|clay|placeholder|flat[_ ]?(gem|metal)|\(flat\)/i;

type PbrLike = THREE.Material & {
  color?: THREE.Color; metalness?: number; roughness?: number; transmission?: number;
  map?: unknown; normalMap?: unknown; roughnessMap?: unknown; metalnessMap?: unknown; aoMap?: unknown; emissiveMap?: unknown;
};

/** Whether a file material is a real, authored look (true) or missing/placeholder (false). */
export function isUsableFileMaterial(material: THREE.Material | null | undefined): boolean {
  if (!material) return false;
  const m = material as PbrLike;
  if (m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.aoMap || m.emissiveMap) return true;
  const name = (m.name ?? '').trim();
  // An unnamed material still counts when its values are real (judged below).
  if (name && (PLACEHOLDER_NAME.test(name) || PLACEHOLDER_WORD.test(name))) return false;
  // Grey clay: colourless, matte, not metal, not see-through.
  const c = m.color;
  if (c && (m.metalness ?? 0) < 0.1 && !(m.transmission && m.transmission > 0) && (m.roughness ?? 1) >= 0.5
    && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 0.04) return false;
  return true;
}

export type PartLook =
  | { source: 'library'; preset: JewelryPreset }
  | { source: 'file' }
  | { source: 'picker'; preset: JewelryPreset };

export interface PartLookInput extends PartHints {
  /** Library material id the user applied, if any. */
  libraryId?: string | null;
  fileMaterial?: THREE.Material | null;
  /** Name rules say this part is a stone (viewer's own classifier). */
  stoneByName?: boolean;
}

/** Which look a part gets. Same answer in every viewer. */
export function resolvePartLook(i: PartLookInput): PartLook {
  const lib = presetForLibraryId(i.libraryId);
  if (lib) return { source: 'library', preset: lib };
  if (isUsableFileMaterial(i.fileMaterial)) return { source: 'file' };
  const stone = !!i.stoneByName || isStoneLayer(i.layer) || !!gemFamily(i.materialName) || !!gemFamily(i.objectName);
  const key = stone ? pickGem(i) : pickMetal(i);
  return { source: 'picker', preset: JEWELRY_PRESETS[key] };
}
