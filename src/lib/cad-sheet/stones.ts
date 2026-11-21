/**
 * Stone schedule from a CAD file's parts: which parts are stones (by layer or
 * part name), their shape and size from their outline, grouped like a bench
 * sheet ("24 × round 1.30 mm"). An estimate from geometry: the jeweler checks
 * it and can type over it.
 */

/** One part of the file: its layer, name and overall size in millimetres. */
export interface PartBox {
  layer: string;
  name: string;
  sizeMm: [number, number, number];
}

const STONE_WORDS = /\b(gem|gems|gemstones?|stones?|diamonds?|melee|brilliants?|cz|zircon|moissanite|sapphires?|rub(y|ies)|emeralds?|pearls?|crystals?|onyx|opals?|topaz|amethyst|garnet|aquamarine)\b|宝石|钻|石/i;

export function isStone(part: PartBox): boolean {
  return STONE_WORDS.test(part.layer) || STONE_WORDS.test(part.name);
}

export interface StoneGroup {
  count: number;
  shape: 'round' | 'oval or fancy';
  /** Round: [diameter]. Oval or fancy: [length, width]. */
  sizeMm: number[];
}

/**
 * Groups stones by shape and size. A stone's face is its two largest sides; it
 * is round when they differ by under 6%. Sizes are rounded to 0.05 mm so the
 * same stone modelled twice falls in one group.
 */
export function stoneSchedule(parts: PartBox[]): StoneGroup[] {
  const groups = new Map<string, StoneGroup>();
  for (const p of parts) {
    if (!isStone(p)) continue;
    const [a, b] = [...p.sizeMm].sort((x, y) => y - x);
    if (a <= 0) continue;
    const q = (v: number) => Math.round(v * 20) / 20;
    const round = (a - b) / a < 0.06;
    const g: StoneGroup = round ? { count: 1, shape: 'round', sizeMm: [q((a + b) / 2)] } : { count: 1, shape: 'oval or fancy', sizeMm: [q(a), q(b)] };
    const key = `${g.shape}|${g.sizeMm.join('x')}`;
    const had = groups.get(key);
    if (had) had.count++;
    else groups.set(key, g);
  }
  // Largest stones first, as a bench sheet lists them.
  return [...groups.values()].sort((x, y) => Math.max(...y.sizeMm) - Math.max(...x.sizeMm));
}

/** "1 × oval or fancy 8.00 × 6.00 mm; 24 × round 1.30 mm" */
export function formatSchedule(groups: StoneGroup[]): string {
  return groups
    .map((g) => `${g.count} × ${g.shape} ${g.sizeMm.map((v) => v.toFixed(2)).join(' × ')} mm`)
    .join('; ');
}
