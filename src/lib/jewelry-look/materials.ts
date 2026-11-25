/**
 * three.js materials built from JEWELRY_PRESETS, for viewers without their own
 * refraction shader (history grid, CAD to Catalog fallback). CADCanvas builds
 * its materials from the same presets in its own file.
 */
import * as THREE from 'three';
import type { JewelryPreset } from './presets';

/** Environment intensity per kind. 1 = the Blender light as is. */
export const STUDIO_ENV_INTENSITY = { metal: 1, gem: 1, pearl: 1, glass: 1 } as const;

export interface JewelryMaterialOptions {
  /** Stone size in world units (sets thickness/attenuation distance). */
  stoneSize?: number;
  side?: THREE.Side;
  /** Mirror-like solid stone (the Studio's Simple gems), for renderers where
   * transmission cannot work (scissor-split canvases draw it black). */
  simpleGem?: boolean;
}

export function makeJewelryMaterial(p: Omit<JewelryPreset, "key" | "blender">, opts: JewelryMaterialOptions = {}): THREE.MeshPhysicalMaterial {
  const side = opts.side ?? THREE.DoubleSide;
  let m: THREE.MeshPhysicalMaterial;
  if (p.kind === 'metal') {
    m = new THREE.MeshPhysicalMaterial({ color: p.color, metalness: 1, roughness: p.rough ?? 0.1, envMapIntensity: STUDIO_ENV_INTENSITY.metal, side });
  } else if (p.kind === 'glass') {
    m = new THREE.MeshPhysicalMaterial({ color: p.color, metalness: 0, roughness: 0, transparent: true, opacity: 0.12, depthWrite: false, side });
  } else if (p.kind === 'pearl') {
    m = new THREE.MeshPhysicalMaterial({
      color: p.color, metalness: 0, roughness: p.opal ? 0.14 : 0.24, clearcoat: 1, clearcoatRoughness: 0.12,
      iridescence: p.irid ?? 0.45, iridescenceIOR: 1.9, iridescenceThicknessRange: p.opal ? [100, 800] : [120, 440],
      sheen: 0.6, sheenColor: new THREE.Color(p.sheen ?? 0xffffff), sheenRoughness: 0.4,
      envMapIntensity: STUDIO_ENV_INTENSITY.pearl, side,
    });
  } else if (p.dark) {
    // Blender black_stone(): near-black base, roughness 0.03, full coat.
    m = new THREE.MeshPhysicalMaterial({ color: p.color, metalness: 0, roughness: p.rough ?? 0.03, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: STUDIO_ENV_INTENSITY.gem, side });
  } else if (opts.simpleGem) {
    // Deep stone colour plus a little self-light standing in for the light a real
    // stone gathers inside; without it the stone reads grey against the dark world.
    const deep = new THREE.Color(p.atten ?? p.color);
    m = new THREE.MeshPhysicalMaterial({
      color: deep, metalness: 0.55, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0,
      emissive: deep, emissiveIntensity: 0.35, envMapIntensity: STUDIO_ENV_INTENSITY.gem, side,
    });
  } else {
    // Blender gem_material(): clear glass, roughness 0, transmission 1, IOR, colour by absorption.
    const size = Math.max(opts.stoneSize ?? 1, 1e-4);
    m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0, transmission: 1,
      ior: Math.min(p.ior ?? 1.5, 2.333), thickness: size, specularIntensity: 1,
      // atten is the colour after GEM_REFERENCE_PATH_M (about seven stone diameters of light path).
      attenuationColor: new THREE.Color(p.atten ?? 0xffffff), attenuationDistance: size * 7,
      envMapIntensity: STUDIO_ENV_INTENSITY.gem, side,
    });
  }
  m.name = p.label;
  if ("key" in p) m.userData.jewelryPreset = (p as JewelryPreset).key;
  return m;
}
