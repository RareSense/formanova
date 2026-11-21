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
    if (Math.min(...p.sizeMm) < 0.05) continue; // flat: a reference picture or outline, not a stone
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
  return scheduleRows(groups).map((r) => `${r.label}: ${r.value}`).join('; ');
}

/** Only parts on these layers are stones: the jeweler's choice when layer names don't say. */
export function stonesOnLayers(parts: PartBox[], layers: string[]): PartBox[] {
  const set = new Set(layers);
  // Tag them so stoneSchedule's name test passes; their own names stay untouched.
  return parts.filter((p) => set.has(p.layer)).map((p) => ({ ...p, layer: `stone ${p.layer}` }));
}

/**
 * The schedule as bench-sheet rows, like FormaNova's workshop specification:
 * "Centre: 1 oval, 8.00 × 6.00 mm", "Side stones", "Melee".
 */
export function scheduleRows(groups: StoneGroup[]): { label: string; value: string }[] {
  const shape = (g: StoneGroup) => (g.shape === 'round' ? 'round' : 'oval or fancy');
  const size = (g: StoneGroup) => `${g.sizeMm.map((v) => v.toFixed(2)).join(' × ')} mm`;
  const big = groups.filter((g) => Math.max(...g.sizeMm) >= 2.5);
  const small = groups.filter((g) => Math.max(...g.sizeMm) < 2.5);
  const rows: { label: string; value: string }[] = [];
  big.forEach((g, i) => {
    if (i === 0 && g.count === 1 && groups.length > 1) rows.push({ label: 'Centre', value: `1 ${shape(g)}, ${size(g)}` });
    else rows.push({ label: rows.length ? 'Side stones' : 'Stones', value: `${g.count} ${shape(g)}, ${size(g)}` });
  });
  if (small.length) {
    // Melee in one line, as a bench sheet gives it: count, size range, the commonest sizes.
    const total = small.reduce((n, g) => n + g.count, 0);
    const sizes = small.flatMap((g) => g.sizeMm);
    const range = Math.min(...sizes) === Math.max(...sizes) ? `${Math.max(...sizes).toFixed(2)} mm` : `${Math.min(...sizes).toFixed(2)} to ${Math.max(...sizes).toFixed(2)} mm`;
    const top = [...small].sort((x, y) => y.count - x.count).slice(0, 3).map((g) => `${g.count} × ${g.sizeMm.map((v) => v.toFixed(2)).join(' × ')}`);
    const more = small.length > 3 ? `, +${small.length - 3} more sizes` : '';
    rows.push({ label: 'Melee', value: `${total} stones, ${range} (${top.join(', ')}${more})` });
  }
  return rows;
}
