/**
 * The bridge between the two ways a metal is chosen on the CAD page: the
 * weight's cited alloy (karat and colour) and the Material panel's look
 * ("All metal parts", MATERIAL_LIBRARY, which knows colour but not karat).
 * One choice drives both, so the page never shows two metals at once.
 *
 * Palladium has no look of its own in the library; it shares platinum's
 * white-grey. Looks without a cited density (copper, rhodium, brass…) have no
 * alloy, so picking one changes the look and leaves the weight's metal alone.
 */
import { MATERIAL_LIBRARY, type MaterialDef } from '@/components/cad-studio/materials';
import { DEFAULT_ALLOY_ID, METAL_ALLOYS, findAlloy, type MetalAlloy } from '@/lib/metal-weight/alloys';

const LOOKS = new Map(MATERIAL_LIBRARY.filter((m) => m.category === 'metal').map((m) => [m.id, m]));

function look(id: string): MaterialDef {
  return LOOKS.get(id) as MaterialDef;
}

/** The Material panel look for an alloy: its id (to apply) and preview (for the swatch). */
export function appearanceForAlloy(alloy: MetalAlloy): MaterialDef {
  if (alloy.family === 'gold') return look(`gold-${alloy.colour}-polished`);
  if (alloy.family === 'silver') return look('silver-natural-polished');
  return look('platinum-natural-polished');
}

const DEFAULT_GOLD_KARAT = findAlloy(DEFAULT_ALLOY_ID)?.karat ?? 14;

function goldIn(colour: string, karat: number | null): MetalAlloy | undefined {
  return METAL_ALLOYS.find((a) => a.family === 'gold' && a.colour === colour && a.karat === karat);
}

/**
 * The alloy a Material panel look stands for, staying as close to the current
 * alloy as the look allows: same karat for a gold colour change, the exact
 * current alloy when the look already matches it. Null when the look has no
 * cited alloy.
 */
export function alloyForAppearance(materialId: string, current: MetalAlloy): string | null {
  const material = LOOKS.get(materialId);
  if (!material) return null;
  if (material.type === 'gold') {
    const colour = material.alloy;
    if (current.family === 'gold' && current.colour === colour) return current.id;
    const karat = current.family === 'gold' ? current.karat : DEFAULT_GOLD_KARAT;
    return (goldIn(colour, karat) ?? goldIn(colour, DEFAULT_GOLD_KARAT))?.id ?? null;
  }
  if (material.type === 'silver') return current.family === 'silver' ? current.id : 'ag925';
  if (material.type === 'platinum') return current.family === 'platinum' ? current.id : 'pt950ru';
  return null;
}
