// Metal and stone presets: FormaNova's REFERENCE_MATERIALS (text-to-CAD Refract
// mode), the look the CAD to Pictures tool shoots with.

import * as THREE from 'three';
import { referenceGemMaterial, type GemSpec } from './gems';
import { JEWELRY_PRESETS, STUDIO_ENV_INTENSITY, pickGem, pickMetal, type PartHints } from '@/lib/jewelry-look';

export type PresetKind = 'metal' | 'gem';
export interface Preset {
  id: string;
  name: string;
  kind: PresetKind;
  color: string;
  roughness?: number;
  env?: number;
  ior?: number;
  atten?: string;
  transmission?: number;
  metalness?: number;
}

/** A part's material: a preset (with optional shade / polish), or what the file says (null). */
export interface Choice {
  kind: 'preset';
  id: string;
  shade?: number;
  rough?: number;
}

// Engine preset id -> shared jewelry-look preset (derived from the Blender studio renderer).
const METAL_KEYS: [string, string][] = [
  ['gold-yellow', 'gold18k'], ['gold-rose', 'roseGold'], ['gold-white', 'whiteGold'], ['platinum', 'platinum'],
  ['silver', 'silver'], ['gold-brushed', 'goldBrushed'], ['silver-brushed', 'silverBrushed'], ['rhodium-black', 'blackRhodium'],
];
const GEM_KEYS: [string, string][] = [
  ['diamond', 'diamond'], ['ruby', 'ruby'], ['sapphire', 'sapphire'], ['emerald', 'emerald'], ['black-diamond', 'blackDiamond'],
  ['amethyst', 'amethyst'], ['topaz', 'topaz'], ['aquamarine', 'aquamarine'], ['orange-sapphire', 'orangeSapphire'],
  ['pink-sapphire', 'pinkSapphire'], ['yellow-sapphire', 'yellowSapphire'], ['padparadscha', 'padparadscha'],
];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export const METALS: Preset[] = METAL_KEYS.map(([id, key]) => {
  const p = JEWELRY_PRESETS[key];
  return { id, name: p.label, kind: 'metal' as const, color: hex(p.color), roughness: p.rough, env: STUDIO_ENV_INTENSITY.metal };
});

const REF_GEM: Record<string, GemSpec> = Object.fromEntries(GEM_KEYS.map(([id, key]) => {
  const p = JEWELRY_PRESETS[key];
  return [id, { color: p.color, atten: p.atten ?? 0xffffff, ior: p.ior!, disp: p.disp }];
}));

export const GEMS: Preset[] = GEM_KEYS.map(([id, key]) => {
  const p = JEWELRY_PRESETS[key];
  return {
    id, name: p.label, kind: 'gem' as const, color: hex(p.color), ior: p.ior, env: STUDIO_ENV_INTENSITY.gem,
    atten: hex(p.atten ?? 0xffffff), roughness: p.rough,
    ...(p.dark ? { transmission: 0, metalness: 0 } : {}),
  };
});

export const PRESETS = new Map<string, Preset>([...METALS, ...GEMS].map((m) => [m.id, m]));
export const metalByName = (name: string) => METALS.find((m) => m.name.toLowerCase() === name.toLowerCase()) || null;

const GEM_ID_BY_KEY = new Map(GEM_KEYS.map(([id, key]) => [key, id]));
/** Engine gem id for a stone part, from the shared picker (material, layer, object name). */
export function gemFor(h: PartHints): string {
  const key = pickGem(h);
  return GEM_ID_BY_KEY.get(key) ?? (/sapphire|padparad/i.test(key) ? 'sapphire' : 'diamond');
}
const METAL_ID_BY_KEY = new Map(METAL_KEYS.map(([id, key]) => [key, id]));
/** Engine metal id for a part, from the shared picker (Blender's metal regexes); null if the engine has no such preset. */
export function metalFor(h: PartHints): string | null {
  return METAL_ID_BY_KEY.get(pickMetal(h)) ?? null;
}
/** Back-compat: one combined name string. */
export const gemFromName = (name: string) => gemFor({ objectName: name });

/** shade -1..1: darker .. lighter version of the preset colour. */
export function shaded(color: string, shade = 0): THREE.Color {
  const c = new THREE.Color(color);
  if (!shade) return c;
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  hsl.l = shade > 0 ? hsl.l + (1 - hsl.l) * shade * 0.7 : hsl.l * (1 + shade * 0.8);
  return c.setHSL(hsl.h, hsl.s, hsl.l, THREE.SRGBColorSpace);
}

/** Swatch colour of a choice (CSS), or the file's own colour. */
export function swatchColor(choice: Choice | null, fileColor: string) {
  if (!choice) return fileColor;
  return `#${shaded(PRESETS.get(choice.id)!.color, choice.shade).getHexString(THREE.SRGBColorSpace)}`;
}

/**
 * Preset materials, shared by every part with the same choice (and, for gems,
 * the same stone shape), so 1,000 pavé stones cost one material each.
 */
export class MaterialCache {
  private made = new Map<string, THREE.Material>();
  /** World-unit step a ray takes into a stone (gemEntryStep of the open piece). */
  gemStep = 0.001;

  /** refEnv: the raw studio HDRI the gem shader samples; until it loads stones get physical glass. */
  material(choice: Choice, geometry: THREE.BufferGeometry, partSize: number, refEnv: THREE.Texture | null): THREE.Material {
    const m = PRESETS.get(choice.id)!;
    const shade = choice.shade || 0;
    const color = shaded(m.color, shade);
    if (m.kind === 'metal') {
      const r = choice.rough ?? m.roughness!;
      const key = `${m.id}|${shade}|${r}`;
      if (!this.made.has(key)) {
        this.made.set(key, new THREE.MeshPhysicalMaterial({
          name: m.name, color, metalness: 1, roughness: r, reflectivity: 1,
          clearcoat: 0, clearcoatRoughness: 0, envMapIntensity: m.env, side: THREE.DoubleSide,
        }));
      }
      return this.made.get(key)!;
    }
    if (refEnv) {
      const key = `ref|${m.id}|${shade}|${geometry.uuid}|${this.gemStep}`;
      if (!this.made.has(key)) {
        const spec = { ...REF_GEM[m.id], color: shaded(hex(REF_GEM[m.id].color), shade).getHex() };
        this.made.set(key, referenceGemMaterial(geometry, refEnv, spec, m.name, this.gemStep));
      }
      return this.made.get(key)!;
    }
    const thick = +(Math.max(partSize || 1, 0.01) * 0.6).toPrecision(2);
    const key = `${m.id}|${shade}|${thick}`;
    if (!this.made.has(key)) {
      this.made.set(key, new THREE.MeshPhysicalMaterial({
        name: m.name, color, metalness: m.metalness ?? 0, roughness: m.roughness ?? 0,
        transmission: m.transmission ?? 1, ior: Math.min(m.ior!, 2.333), thickness: thick,
        specularIntensity: 1, envMapIntensity: m.env, clearcoat: 1, clearcoatRoughness: 0,
        attenuationColor: new THREE.Color(m.atten), attenuationDistance: thick * 1.5, side: THREE.DoubleSide,
      }));
    }
    return this.made.get(key)!;
  }

  dispose() {
    for (const m of this.made.values()) m.dispose();
    this.made.clear();
  }
}
