// Metal and stone presets: FormaNova's REFERENCE_MATERIALS (text-to-CAD Refract
// mode), the look the CAD to Pictures tool shoots with.

import * as THREE from 'three';
import { referenceGemMaterial, type GemSpec } from './gems';

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

export const METALS: Preset[] = [
  { id: 'gold-yellow', name: 'Yellow Gold', color: '#ffd88a', roughness: 0.08 },
  { id: 'gold-rose', name: 'Rose Gold', color: '#f6c1a6', roughness: 0.08 },
  { id: 'gold-white', name: 'White Gold', color: '#f7f4ec', roughness: 0.07 },
  { id: 'platinum', name: 'Platinum', color: '#e9e9e7', roughness: 0.11 },
  { id: 'silver', name: 'Sterling Silver', color: '#fbfaf6', roughness: 0.05 },
  { id: 'gold-brushed', name: 'Brushed Gold', color: '#ffd88a', roughness: 0.3 },
  { id: 'silver-brushed', name: 'Brushed Silver', color: '#fbfaf6', roughness: 0.25 },
  { id: 'rhodium-black', name: 'Black Rhodium', color: '#3b3b40', roughness: 0.28 },
].map((m) => ({ ...m, kind: 'metal' as const, env: 1.15 }));

const REF_GEM: Record<string, GemSpec> = {
  diamond: { color: 0xffffff, atten: 0xffffff, ior: 2.42, disp: 0.02 },
  ruby: { color: 0xf26a8c, atten: 0x9e0f34, ior: 1.76 },
  sapphire: { color: 0x4f7ce0, atten: 0x0c2f9e, ior: 1.76 },
  emerald: { color: 0x46c684, atten: 0x02702f, ior: 1.57 },
  'black-diamond': { color: 0x17171c, atten: 0x000000, ior: 2.42 },
  amethyst: { color: 0xb488e2, atten: 0x5c1e96, ior: 1.54 },
  topaz: { color: 0x4b9dbd, atten: 0x0e4a66, ior: 1.61 },
  aquamarine: { color: 0xaee2de, atten: 0x2f9e96, ior: 1.57 },
};

const hex = (n: number) => `#${new THREE.Color(n).getHexString()}`;
export const GEMS: Preset[] = [
  { id: 'diamond', name: 'Diamond', ior: 2.42, env: 3.0, atten: '#ffffff' },
  { id: 'ruby', name: 'Ruby', ior: 1.77, env: 2.5, atten: '#9b111e' },
  { id: 'sapphire', name: 'Sapphire', ior: 1.77, env: 2.5, atten: '#0f52ba' },
  { id: 'emerald', name: 'Emerald', ior: 1.58, env: 2.5, atten: '#046307' },
  { id: 'black-diamond', name: 'Black Diamond', ior: 2.42, env: 2.0, atten: '#0a0a0a', transmission: 0.4, metalness: 0.3, roughness: 0.05 },
  { id: 'amethyst', name: 'Amethyst', ior: 1.54, env: 2.5, atten: '#6b3fa0' },
  { id: 'topaz', name: 'Topaz', ior: 1.64, env: 2.5, atten: '#ffc87c' },
  { id: 'aquamarine', name: 'Aquamarine', ior: 1.57, env: 2.5, atten: '#7fffd4' },
].map((g) => ({ ...g, kind: 'gem' as const, color: hex(REF_GEM[g.id].color) }));

export const PRESETS = new Map<string, Preset>([...METALS, ...GEMS].map((m) => [m.id, m]));
export const metalByName = (name: string) => METALS.find((m) => m.name.toLowerCase() === name.toLowerCase()) || null;

// Which gem a stone part is, from its material or part name (FormaNova's
// REFERENCE_TYPE_RULES, limited to these stones); diamond otherwise.
const GEM_NAME_RULES: [RegExp, string][] = [[/ruby/i, 'ruby'], [/sapphire/i, 'sapphire'], [/emerald/i, 'emerald'], [/amethyst/i, 'amethyst'],
  [/aqua/i, 'aquamarine'], [/topaz/i, 'topaz'], [/onyx|black[_ ]?diamond/i, 'black-diamond']];
export const gemFromName = (name: string) => GEM_NAME_RULES.find(([re]) => re.test(name))?.[1] || 'diamond';

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
      const key = `ref|${m.id}|${shade}|${geometry.uuid}`;
      if (!this.made.has(key)) {
        const spec = { ...REF_GEM[m.id], color: shaded(hex(REF_GEM[m.id].color), shade).getHex() };
        this.made.set(key, referenceGemMaterial(geometry, refEnv, spec, m.name));
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
