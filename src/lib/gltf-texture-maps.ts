import type * as THREE from 'three';

const MAP_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'bumpMap', 'clearcoatNormalMap', 'sheenColorMap', 'specularColorMap',
] as const;

/** True when a material carries any authored texture (baked finish, normals, AO...). */
export function hasTextureMaps(material: THREE.Material | THREE.Material[] | null | undefined): boolean {
  if (!material) return false;
  if (Array.isArray(material)) return material.some((m) => hasTextureMaps(m));
  const rec = material as unknown as Record<string, unknown>;
  return MAP_KEYS.some((key) => rec[key] != null);
}

/** A GLB with baked textures on any part is authored as a whole: its untextured
 * accents (a black nose, enamel eyes) belong to that look too, so the viewer
 * must keep every embedded material instead of swapping in metal/gem presets. */
export function modelHasTextureMaps(materials: Array<THREE.Material | THREE.Material[] | null | undefined>): boolean {
  return materials.some((m) => hasTextureMaps(m));
}
