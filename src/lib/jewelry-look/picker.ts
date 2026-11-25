/**
 * Which stone / metal preset a CAD part gets, from what the file says about it.
 *
 * Stones, in priority order:
 *   1. the material name (an explicit assignment always wins),
 *   2. the layer (Rhino layers like `stones_ruby`),
 *   3. words in the object name.
 * The first source naming a gem family (ruby, sapphire, ...) sets the family;
 * a colour word from any source then refines it (sapphire + orange ->
 * orangeSapphire). A colour with no family picks the matching stone. Else diamond.
 */

export interface PartHints {
  materialName?: string | null;
  layer?: string | null;
  objectName?: string | null;
}

// Specific names first: they are families of their own.
const FAMILY_RULES: [RegExp, string][] = [
  [/padparad?scha/, 'padparadscha'],
  [/onyx|black[\s_-]*diamond|black[\s_-]*stone/, 'blackDiamond'],
  [/ruby/, 'ruby'],
  [/sapphire(?!.*crystal)/, 'sapphire'],
  [/tsavorite/, 'tsavorite'],
  [/emerald/, 'emerald'],
  [/peridot/, 'peridot'],
  [/aqua/, 'aquamarine'],
  [/amethyst/, 'amethyst'],
  [/citrine/, 'citrine'],
  [/topaz/, 'topaz'],
  [/garnet/, 'garnet'],
  [/tanzanit/, 'tanzanite'],
  [/morganite/, 'morganite'],
  [/champagne/, 'champagne'],
  [/diamond|melee|brilliant/, 'diamond'],
];

const COLOURS = ['orange', 'pink', 'yellow', 'red', 'blue', 'green', 'purple', 'violet', 'black'] as const;
type Colour = typeof COLOURS[number];

/** family + colour -> refined preset. */
const REFINE: Record<string, Partial<Record<Colour, string>>> = {
  sapphire: { orange: 'orangeSapphire', pink: 'pinkSapphire', yellow: 'yellowSapphire', red: 'ruby' },
  diamond: { black: 'blackDiamond', yellow: 'champagne' },
};

/** A colour with no family. */
const COLOUR_ONLY: Record<Colour, string> = {
  orange: 'orangeSapphire', pink: 'pinkSapphire', yellow: 'yellowSapphire', red: 'ruby',
  blue: 'sapphire', green: 'emerald', purple: 'amethyst', violet: 'amethyst', black: 'blackDiamond',
};

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();
const words = (s: string) => s.split(/[^a-z]+/).filter(Boolean);

export function gemFamily(text: string | null | undefined): string | null {
  const t = norm(text);
  if (!t) return null;
  return FAMILY_RULES.find(([re]) => re.test(t))?.[1] ?? null;
}

export function colourWord(text: string | null | undefined): Colour | null {
  const w = words(norm(text));
  return COLOURS.find((c) => w.includes(c)) ?? null;
}

export function pickGem(h: PartHints): string {
  const sources = [h.materialName, h.layer, h.objectName];
  let family: string | null = null;
  for (const s of sources) { family = gemFamily(s); if (family) break; }
  let colour: Colour | null = null;
  for (const s of sources) { colour = colourWord(s); if (colour) break; }
  if (family) return (colour && REFINE[family]?.[colour]) || family;
  if (colour) return COLOUR_ONLY[colour];
  return 'diamond';
}

/** Whether a layer name marks stones (`stones`, `stones_ruby`, `Stones::Melee`). */
export function isStoneLayer(layer: string | null | undefined): boolean {
  return /^(stones?|gems?)(\b|_|:|$)/i.test((layer ?? '').trim());
}

// Blender studio_render.py METALS regex order.
const METAL_RULES: [RegExp, string][] = [
  [/black[\s_-]*rhodium/, 'blackRhodium'],
  [/18k.*yellow|yellow.*18k|gold.*18|750/, 'gold18k'],
  [/rose/, 'roseGold'],
  [/white|platinum|pt9/, 'whiteGold'],
  [/9k/, 'gold9k'],
  [/gold|14k|yellow/, 'gold18k'],
  [/silver|925/, 'silver'],
  [/steel|316|iron/, 'steel'],
  [/titanium/, 'titanium'],
  [/copper/, 'copper'],
];

export function pickMetal(h: PartHints): string {
  for (const s of [h.materialName, h.layer, h.objectName]) {
    const t = norm(s);
    if (/platinum|pt9/.test(t)) return 'platinum';
    const hit = METAL_RULES.find(([re]) => re.test(t));
    if (hit) return hit[1];
  }
  return 'gold18k';
}

/** Layer name of a three.js object: glTF extras (`layer`, `layer_name`, `rhinoLayer`) on it or a parent. */
export function layerOf(obj: { userData?: Record<string, unknown>; parent?: unknown } | null | undefined): string | null {
  let o = obj as { userData?: Record<string, unknown>; parent?: unknown } | null | undefined;
  for (let i = 0; o && i < 6; i++) {
    const d = o.userData ?? {};
    for (const k of ['layer', 'layer_name', 'layerName', 'rhinoLayer']) {
      if (typeof d[k] === 'string' && d[k]) return d[k] as string;
    }
    o = o.parent as typeof o;
  }
  return null;
}
