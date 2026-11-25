/**
 * One table of metal and stone looks for every FormaNova CAD viewer (Studio,
 * material library apply, generation history, admin workflow viewer, CAD to
 * Catalog engine).
 *
 * Source of truth: the Blender studio renderer on research-vm
 * (~/work/queue/studio_render.py). Its values are copied here as `blender`:
 *   metals: linear F0 base colour + F82 edge tint (Adobe Standard Material
 *           references), roughness clamped to 0.10..0.45, no clearcoat;
 *   stones: Principled glass, roughness 0, transmission 1, IOR (middle of the
 *           split-IOR triple), colour from Volume Absorption (colour, density 260).
 * Everything three.js needs (sRGB hex colours, attenuation colour) is derived
 * from those numbers by the functions below, never typed in by hand.
 *
 * Presets Blender has no entry for are marked `blender: null` plus a
 * `note` saying what was used instead.
 */

export type LookKind = 'metal' | 'gem' | 'pearl' | 'glass';

export interface BlenderMetal {
  /** Linear F0 base colour. */
  f0: [number, number, number];
  /** Linear F82 edge tint (three.js has no F82 input; kept for reference). */
  edge: [number, number, number];
  /** Blender's oxidised/dark rule: base x0.35, edge x0.5. */
  dark?: boolean;
}

export interface BlenderGem {
  /** [red, green, blue] IORs of the split-IOR dispersion shader. */
  iors: [number, number, number];
  /** Volume Absorption colour (linear); null = colourless (diamond). */
  absorb: [number, number, number] | null;
  /** Blender's black_stone() material (onyx): base 0.004, roughness 0.03, coat 1. */
  blackStone?: boolean;
}

export interface JewelryPreset {
  key: string;
  label: string;
  kind: LookKind;
  /** Display / surface colour, sRGB hex. */
  color: number;
  rough?: number;
  /** Colour light takes on through the stone (three attenuationColor), sRGB hex. */
  atten?: number;
  ior?: number;
  /** Chromatic spread for the refraction shader (fraction of IOR). */
  disp?: number;
  sheen?: number;
  irid?: number;
  opal?: boolean;
  dark?: boolean;
  blender: BlenderMetal | BlenderGem | null;
  /** Why the value differs from, or is missing in, Blender. */
  note?: string;
}

/** Blender studio_render.py --gem-density default. */
export const BLENDER_GEM_DENSITY = 260;
/** Light path through a stone, in metres, used to turn Blender's absorption
 * (per metre, x density) into one three.js attenuation colour. Light bounces
 * around a faceted stone many times (Cycles: 24 transmission bounces), so this is
 * several stone diameters; 15 mm matches the saturation of the Blender close-ups. */
export const GEM_REFERENCE_PATH_M = 0.015;
/** Blender clamps polished metal roughness to at least this. */
export const BLENDER_MIN_METAL_ROUGHNESS = 0.1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
export function linearRgbToHex([r, g, b]: [number, number, number]): number {
  const to = (v: number) => Math.round(linearToSrgb(v) * 255);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

/** Transmittance of Blender's Volume Absorption (colour, density) over `pathM` metres. */
export function absorptionTransmittance(absorb: [number, number, number], pathM: number, density = BLENDER_GEM_DENSITY): [number, number, number] {
  return absorb.map((c) => Math.exp(-density * (1 - c) * pathM)) as [number, number, number];
}

function metal(key: string, label: string, b: BlenderMetal, rough = BLENDER_MIN_METAL_ROUGHNESS, note?: string): JewelryPreset {
  const f0 = b.dark ? (b.f0.map((c) => c * 0.35) as [number, number, number]) : b.f0;
  return { key, label, kind: 'metal', color: linearRgbToHex(f0), rough, blender: b, note };
}

function gem(key: string, label: string, b: BlenderGem, extra: Partial<JewelryPreset> = {}): JewelryPreset {
  const ior = b.iors[1];
  // Chromatic spread the refraction shader uses: Blender's split IOR, as a fraction.
  const disp = +((b.iors[2] - b.iors[0]) / (2 * ior)).toFixed(4);
  if (b.blackStone) {
    return { key, label, kind: 'gem', color: linearRgbToHex([0.004, 0.004, 0.005]), atten: 0x000000, ior, rough: 0.03, disp, dark: true, blender: b, ...extra };
  }
  const deep = b.absorb ? absorptionTransmittance(b.absorb, GEM_REFERENCE_PATH_M) : [1, 1, 1] as [number, number, number];
  const face = b.absorb ? absorptionTransmittance(b.absorb, GEM_REFERENCE_PATH_M / 3) : [1, 1, 1] as [number, number, number];
  return { key, label, kind: 'gem', color: linearRgbToHex(face), atten: linearRgbToHex(deep), ior, rough: 0, disp, blender: b, ...extra };
}

// Blender METALS rows (linear F0, F82).
const B_YELLOW18: BlenderMetal = { f0: [1.0, 0.76, 0.4], edge: [0.995, 0.89, 0.65] };
const B_ROSE: BlenderMetal = { f0: [0.98, 0.64, 0.52], edge: [0.99, 0.82, 0.74] };
const B_WHITE: BlenderMetal = { f0: [0.74, 0.7, 0.66], edge: [0.88, 0.86, 0.84] };
const B_SILVER: BlenderMetal = { f0: [0.98, 0.97, 0.95], edge: [0.99, 0.985, 0.975] };
const B_STEEL: BlenderMetal = { f0: [0.53, 0.51, 0.49], edge: [0.76, 0.75, 0.74] };
const B_COPPER: BlenderMetal = { f0: [0.93, 0.62, 0.52], edge: [0.99, 0.8, 0.74] };
const B_9K: BlenderMetal = { f0: [0.93, 0.72, 0.43], edge: [0.98, 0.88, 0.7] };

// Blender GEMS rows.
const B_DIAMOND: BlenderGem = { iors: [2.4, 2.42, 2.45], absorb: null };
const B_SAPPHIRE: BlenderGem = { iors: [1.76, 1.77, 1.78], absorb: [0.015, 0.035, 0.45] };
const B_GREEN: BlenderGem = { iors: [1.73, 1.74, 1.75], absorb: [0.08, 0.7, 0.18] };
const B_AQUA: BlenderGem = { iors: [1.57, 1.58, 1.59], absorb: [0.5, 0.82, 1.0] };
const B_AMETHYST: BlenderGem = { iors: [1.54, 1.55, 1.56], absorb: [0.55, 0.25, 0.8] };
const B_RUBY: BlenderGem = { iors: [1.76, 1.77, 1.78], absorb: [0.85, 0.06, 0.12] };
const CORUNDUM: [number, number, number] = [1.76, 1.77, 1.78];
const NOT_IN_BLENDER = 'Not in studio_render.py; corundum IOR from Blender, absorption colour chosen to match the stone.';

export const JEWELRY_PRESETS: Record<string, JewelryPreset> = Object.fromEntries(([
  // ── Metals ──
  metal('gold18k', 'Yellow Gold', B_YELLOW18),
  metal('roseGold', 'Rose Gold', B_ROSE),
  metal('whiteGold', 'White Gold', B_WHITE),
  metal('platinum', 'Platinum', B_WHITE),
  metal('silver', 'Silver', B_SILVER),
  metal('gold9k', '9k Gold', B_9K),
  metal('copper', 'Copper', B_COPPER),
  metal('steel', 'Steel', B_STEEL),
  metal('rhodium', 'Rhodium', B_WHITE, BLENDER_MIN_METAL_ROUGHNESS, 'Blender has no rhodium; uses its white/platinum row.'),
  metal('blackRhodium', 'Black Rhodium', { ...B_WHITE, dark: true }, 0.28, "Blender's dark rule (base x0.35) on the white row; roughness 0.28 kept from the old look."),
  metal('goldBrushed', 'Brushed Gold', B_YELLOW18, 0.3),
  metal('goldSatin', 'Satin Gold', B_YELLOW18, 0.2),
  metal('goldMatte', 'Matte Gold', B_YELLOW18, 0.45),
  metal('silverBrushed', 'Brushed Silver', B_SILVER, 0.25),
  metal('brass', 'Brass', B_9K, BLENDER_MIN_METAL_ROUGHNESS, 'Blender has no brass; uses its 9k gold row.'),
  metal('titanium', 'Titanium', B_STEEL, 0.15, 'Blender has no titanium; uses its steel row.'),
  metal('blackTitanium', 'Black Titanium', { ...B_STEEL, dark: true }, 0.2, "Blender has no titanium; steel row with Blender's dark rule."),
  // Default look on load, before the user picks a material (not a real metal; no Blender equivalent).
  { key: 'wax', label: 'Casting Wax', kind: 'pearl', color: 0x1f6e44, blender: null, note: 'Display-only casting wax.' },
  { key: 'stoneBlue', label: 'Stone Blue', kind: 'metal', color: 0x3f6fc4, rough: 0.22, blender: null, note: 'Display-only unassigned stone.' },

  // ── Stones ──
  gem('diamond', 'Diamond', B_DIAMOND),
  gem('ruby', 'Ruby', B_RUBY),
  gem('sapphire', 'Sapphire', B_SAPPHIRE),
  gem('emerald', 'Emerald', B_GREEN, { note: 'Blender groups emerald with tsavorite/peridot (IOR 1.74).' }),
  gem('tsavorite', 'Tsavorite', B_GREEN),
  gem('peridot', 'Peridot', B_GREEN),
  gem('aquamarine', 'Aquamarine', B_AQUA),
  gem('amethyst', 'Amethyst', B_AMETHYST),
  gem('blackDiamond', 'Black Diamond', { iors: B_DIAMOND.iors, absorb: null, blackStone: true }),
  gem('orangeSapphire', 'Orange Sapphire', { iors: CORUNDUM, absorb: [0.95, 0.42, 0.06] }, { note: NOT_IN_BLENDER }),
  gem('pinkSapphire', 'Pink Sapphire', { iors: CORUNDUM, absorb: [0.95, 0.4, 0.62] }, { note: NOT_IN_BLENDER }),
  gem('yellowSapphire', 'Yellow Sapphire', { iors: CORUNDUM, absorb: [0.97, 0.82, 0.12] }, { note: NOT_IN_BLENDER }),
  gem('padparadscha', 'Padparadscha', { iors: CORUNDUM, absorb: [0.97, 0.55, 0.42] }, { note: NOT_IN_BLENDER }),
  gem('champagne', 'Champagne', { iors: B_DIAMOND.iors, absorb: [0.95, 0.8, 0.55] }, { note: 'Not in Blender; diamond IOR, warm absorption.' }),
  gem('citrine', 'Citrine', { iors: [1.54, 1.55, 1.56], absorb: [0.96, 0.7, 0.1] }, { note: 'Not in Blender; quartz IOR as amethyst.' }),
  gem('topaz', 'London Topaz', { iors: [1.6, 1.61, 1.62], absorb: [0.1, 0.45, 0.6] }, { note: 'Not in Blender.' }),
  gem('garnet', 'Garnet', { iors: [1.72, 1.73, 1.74], absorb: [0.6, 0.02, 0.04] }, { note: 'Not in Blender.' }),
  gem('tanzanite', 'Tanzanite', { iors: [1.68, 1.69, 1.7], absorb: [0.3, 0.22, 0.8] }, { note: 'Not in Blender.' }),
  gem('morganite', 'Morganite', { iors: [1.57, 1.58, 1.59], absorb: [0.97, 0.75, 0.8] }, { note: 'Not in Blender.' }),
  // Locket and amulet windows: clear see-through pane.
  { key: 'clearGlass', label: 'Clear Glass', kind: 'glass', color: 0xffffff, blender: null, note: 'Blender has no glass window material.' },

  // ── Pearls and opal (Blender has none; kept from the previous look) ──
  { key: 'pearlWhite', label: 'White Pearl', kind: 'pearl', color: 0xfdfaf3, sheen: 0xf6dfda, blender: null, note: 'Not in Blender.' },
  { key: 'pearlGolden', label: 'Golden Pearl', kind: 'pearl', color: 0xf0d9a2, sheen: 0xf6c86a, blender: null, note: 'Not in Blender.' },
  { key: 'pearlPink', label: 'Pink Pearl', kind: 'pearl', color: 0xf6d5d8, sheen: 0xf2aab6, blender: null, note: 'Not in Blender.' },
  { key: 'pearlBlack', label: 'Tahitian', kind: 'pearl', color: 0x2e3438, sheen: 0x4fa08c, irid: 0.85, blender: null, note: 'Not in Blender.' },
  { key: 'opal', label: 'Opal', kind: 'pearl', color: 0xf2f0ea, sheen: 0xffffff, irid: 1, opal: true, blender: null, note: 'Not in Blender.' },
] as JewelryPreset[]).map((p) => [p.key, p]));

/** Studio material-library ids -> preset key. */
export const LIBRARY_ID_TO_PRESET: Record<string, string> = {
  'gold-yellow-polished': 'gold18k',
  'gold-rose-polished': 'roseGold',
  'gold-white-polished': 'whiteGold',
  'gold-yellow-brushed': 'goldBrushed',
  'gold-yellow-satin': 'goldSatin',
  'gold-yellow-matte': 'goldMatte',
  'platinum-natural-polished': 'platinum',
  'silver-natural-polished': 'silver',
  'silver-natural-brushed': 'silverBrushed',
  'rhodium-black-polished': 'blackRhodium',
  'rhodium-natural-polished': 'rhodium',
  'copper-natural-polished': 'copper',
  'brass-natural-polished': 'brass',
  'titanium-natural-polished': 'titanium',
  'titanium-black-polished': 'blackTitanium',
  diamond: 'diamond',
  ruby: 'ruby',
  sapphire: 'sapphire',
  emerald: 'emerald',
  amethyst: 'amethyst',
  topaz: 'topaz',
  aquamarine: 'aquamarine',
  'black-diamond': 'blackDiamond',
  'orange-sapphire': 'orangeSapphire',
  'pink-sapphire': 'pinkSapphire',
  'yellow-sapphire': 'yellowSapphire',
  padparadscha: 'padparadscha',
};

export function presetForLibraryId(id: string | undefined | null): JewelryPreset | undefined {
  const key = id ? LIBRARY_ID_TO_PRESET[id] : undefined;
  return key ? JEWELRY_PRESETS[key] : undefined;
}

/** Blender restyle keeps the file's metal roughness, clamped to 0.10..0.45.
 * Used for parts the picker styles; a library choice (brushed, matte) keeps its own. */
export function blenderMetalRoughness(fileRough: number | null | undefined, fallback = BLENDER_MIN_METAL_ROUGHNESS): number {
  if (fileRough == null || !Number.isFinite(fileRough)) return fallback;
  return Math.min(Math.max(fileRough, BLENDER_MIN_METAL_ROUGHNESS), 0.45);
}
