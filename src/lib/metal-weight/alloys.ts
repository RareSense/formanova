/**
 * The metals a CAD piece can be weighed in, each with a density read from a
 * named alloy's published data sheet (spec 2026-11-02, Appendix A).
 *
 * The rule this table exists to keep: an alloy without a cited density is not
 * in it, so it can never be picked and no weight is ever shown for it. Nothing
 * here is a placeholder or an average of sources. A value changes only with a
 * new source document, and the source_url changes with it.
 */

export type MetalFamily = 'gold' | 'silver' | 'platinum' | 'palladium';
export type MetalColour = 'yellow' | 'white' | 'rose';

export interface MetalAlloy {
  id: string;
  /** The Appendix A label, as sent in the request's material block. */
  label: string;
  /**
   * What jewellers read on screen. The label, except platinum, whose alloy
   * detail lives in the row tooltip; iridium keeps its word so two rows never
   * share a name.
   */
  name: string;
  family: MetalFamily;
  /** Gold karat; null for silver, platinum and palladium. */
  karat: number | null;
  colour: MetalColour;
  density_g_cm3: number;
  /** The density exactly as the source writes it ("11.0", "20.70"), for display. */
  density_cited: string;
  /** The named alloy the density belongs to, e.g. "UPMR 204 Standard Yellow". */
  alloy: string;
  source_url: string;
}

const STULLER = 'https://www.stuller.com/articles/view/specific-gravity-melting-point-or-various-metals-and-alloys/';
const UPMR_204 = 'https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf';
const UPMR_900 = 'https://www.unitedpmr.com/wp-content/uploads/2021/11/900.pdf';
const UPMR_PD1 = 'https://www.unitedpmr.com/wp-content/uploads/2021/10/PD1.pdf';
const UPMR_520 = 'https://www.unitedpmr.com/wp-content/uploads/2021/10/520.pdf';

/** Appendix A, row for row. UPMR densities are for the finished karat alloy. */
export const METAL_ALLOYS: readonly MetalAlloy[] = [
  { id: 'au9y', label: '9K Yellow Gold', name: '9K Yellow Gold', family: 'gold', karat: 9, colour: 'yellow', density_g_cm3: 11.1, density_cited: '11.1', alloy: 'Cookson 9ct CY', source_url: 'https://www.cooksongold.com/downloads/files/bullion/9ctCY_properties_sheet.pdf' },
  { id: 'au9w', label: '9K White Gold', name: '9K White Gold', family: 'gold', karat: 9, colour: 'white', density_g_cm3: 11.9, density_cited: '11.9', alloy: 'Cookson 9ct WM (silver-based white)', source_url: 'https://www.cooksongold.com/downloads/files/bullion/9ctWM_properties_sheet.pdf' },
  { id: 'au9r', label: '9K Rose Gold', name: '9K Rose Gold', family: 'gold', karat: 9, colour: 'rose', density_g_cm3: 11.1, density_cited: '11.1', alloy: 'Cookson 9ct MR (5N red)', source_url: 'https://www.cooksongold.com/downloads/files/bullion/9ctMR_properties_sheet.pdf' },
  { id: 'au10y', label: '10K Yellow Gold', name: '10K Yellow Gold', family: 'gold', karat: 10, colour: 'yellow', density_g_cm3: 11.24, density_cited: '11.24', alloy: 'UPMR 204 Standard Yellow', source_url: UPMR_204 },
  { id: 'au10w', label: '10K White Gold (nickel)', name: '10K White Gold (nickel)', family: 'gold', karat: 10, colour: 'white', density_g_cm3: 11.0, density_cited: '11.0', alloy: 'UPMR 900 Premium White', source_url: UPMR_900 },
  { id: 'au10wpd', label: '10K White Gold (palladium)', name: '10K White Gold (palladium)', family: 'gold', karat: 10, colour: 'white', density_g_cm3: 12.7, density_cited: '12.7', alloy: 'UPMR PD1', source_url: UPMR_PD1 },
  { id: 'au10r', label: '10K Rose Gold', name: '10K Rose Gold', family: 'gold', karat: 10, colour: 'rose', density_g_cm3: 11.68, density_cited: '11.68', alloy: 'UPMR 520 Russian Red', source_url: UPMR_520 },
  { id: 'au14y', label: '14K Yellow Gold', name: '14K Yellow Gold', family: 'gold', karat: 14, colour: 'yellow', density_g_cm3: 12.76, density_cited: '12.76', alloy: 'UPMR 204 Standard Yellow', source_url: UPMR_204 },
  { id: 'au14w', label: '14K White Gold (nickel)', name: '14K White Gold (nickel)', family: 'gold', karat: 14, colour: 'white', density_g_cm3: 12.55, density_cited: '12.55', alloy: 'UPMR 900 Premium White', source_url: UPMR_900 },
  { id: 'au14wpd', label: '14K White Gold (palladium)', name: '14K White Gold (palladium)', family: 'gold', karat: 14, colour: 'white', density_g_cm3: 14.08, density_cited: '14.08', alloy: 'UPMR PD1', source_url: UPMR_PD1 },
  { id: 'au14r', label: '14K Rose Gold', name: '14K Rose Gold', family: 'gold', karat: 14, colour: 'rose', density_g_cm3: 13.16, density_cited: '13.16', alloy: 'UPMR 520 Russian Red', source_url: UPMR_520 },
  { id: 'au18y', label: '18K Yellow Gold', name: '18K Yellow Gold', family: 'gold', karat: 18, colour: 'yellow', density_g_cm3: 15.49, density_cited: '15.49', alloy: 'UPMR 713 Bright Yellow', source_url: 'https://www.unitedpmr.com/wp-content/uploads/2021/10/713.pdf' },
  { id: 'au18w', label: '18K White Gold (nickel)', name: '18K White Gold (nickel)', family: 'gold', karat: 18, colour: 'white', density_g_cm3: 14.59, density_cited: '14.59', alloy: 'UPMR 900 Premium White', source_url: UPMR_900 },
  { id: 'au18wpd', label: '18K White Gold (palladium)', name: '18K White Gold (palladium)', family: 'gold', karat: 18, colour: 'white', density_g_cm3: 15.84, density_cited: '15.84', alloy: 'UPMR PD2 Vanilla White', source_url: 'https://www.unitedpmr.com/wp-content/uploads/2026/08/Alloy-PD-2.pdf' },
  { id: 'au18r', label: '18K Rose Gold', name: '18K Rose Gold', family: 'gold', karat: 18, colour: 'rose', density_g_cm3: 15.09, density_cited: '15.09', alloy: 'UPMR 520 Russian Red', source_url: UPMR_520 },
  { id: 'au22y', label: '22K Yellow Gold', name: '22K Yellow Gold', family: 'gold', karat: 22, colour: 'yellow', density_g_cm3: 17.55, density_cited: '17.55', alloy: 'UPMR 821', source_url: 'https://www.unitedpmr.com/wp-content/uploads/2021/10/821.pdf' },
  { id: 'au24', label: '24K Fine Gold', name: '24K Fine Gold', family: 'gold', karat: 24, colour: 'yellow', density_g_cm3: 19.32, density_cited: '19.32', alloy: 'Pure gold', source_url: STULLER },
  { id: 'ag925', label: 'Sterling Silver 925', name: 'Sterling Silver 925', family: 'silver', karat: null, colour: 'white', density_g_cm3: 10.36, density_cited: '10.36', alloy: 'Sterling (Ag/Cu)', source_url: STULLER },
  { id: 'pt950ru', label: 'Platinum 950 (ruthenium)', name: 'Platinum 950', family: 'platinum', karat: null, colour: 'white', density_g_cm3: 20.70, density_cited: '20.70', alloy: 'UPMR 95% Pt / 5% Ru', source_url: 'https://www.unitedpmr.com/wp-content/uploads/2024/06/PT95RUTH.pdf' },
  { id: 'pt950ir', label: 'Platinum 950 (iridium)', name: 'Platinum 950 (iridium)', family: 'platinum', karat: null, colour: 'white', density_g_cm3: 21.50, density_cited: '21.50', alloy: '5% iridium platinum', source_url: STULLER },
  { id: 'pd950', label: 'Palladium 950', name: 'Palladium 950', family: 'palladium', karat: null, colour: 'white', density_g_cm3: 12.10, density_cited: '12.10', alloy: 'UPMR PD950-GR7', source_url: 'https://unitedpmr.com/wp-content/uploads/2024/07/PD950GR7.pdf' },
];

// Maps, not object lookups: an id read from a payload or from storage must
// never resolve through the prototype ("__proto__", "constructor").
const BY_ID = new Map(METAL_ALLOYS.map((a) => [a.id, a]));

/**
 * Profile ids already sent in requests before this table. White gold maps to
 * the nickel family, the default White. Pt950/Co is left out until a supplier
 * confirms its density (published values conflict), so it resolves to nothing.
 */
const LEGACY_IDS = new Map<string, string | null>([
  ['sterling_silver', 'ag925'],
  ['14k_yellow_gold', 'au14y'],
  ['14k_white_gold', 'au14w'],
  ['14k_rose_gold', 'au14r'],
  ['18k_yellow_gold', 'au18y'],
  ['18k_white_gold', 'au18w'],
  ['18k_rose_gold', 'au18r'],
  ['platinum_cobalt', null],
]);

/** The alloy for a current or legacy id, or null when there is no cited density for it. */
export function findAlloy(id: unknown): MetalAlloy | null {
  if (typeof id !== 'string') return null;
  const direct = BY_ID.get(id);
  if (direct) return direct;
  const mapped = LEGACY_IDS.get(id);
  return mapped ? BY_ID.get(mapped) ?? null : null;
}

/** Shown when nothing says which metal a piece is in. */
export const DEFAULT_ALLOY_ID = 'au14y';

/** The chips and the short compare table. */
export const COMMON_ALLOY_IDS = ['au10y', 'au14y', 'au18y', 'ag925', 'pt950ru'] as const;
export const COMMON_ALLOYS: readonly MetalAlloy[] = COMMON_ALLOY_IDS.map((id) => BY_ID.get(id) as MetalAlloy);

/** The grouped select, in table order within each family. */
export const ALLOY_GROUPS = ([
  ['gold', 'Gold'],
  ['silver', 'Silver'],
  ['platinum', 'Platinum'],
  ['palladium', 'Palladium'],
] as const).map(([family, label]) => ({ family, label, alloys: METAL_ALLOYS.filter((a) => a.family === family) }));

/** "10K", "925", "Pt950", "Pd950": the compact form for version and history tags. */
export function alloyShortLabel(alloy: MetalAlloy): string {
  if (alloy.family === 'gold') return `${alloy.karat}K`;
  if (alloy.family === 'silver') return '925';
  return alloy.family === 'platinum' ? 'Pt950' : 'Pd950';
}

/** The start request's material block. Same three keys the toolkit already validates. */
export function materialPayload(alloy: MetalAlloy): { alloy: string; density_g_cm3: number; density_source: string } {
  return {
    alloy: alloy.label,
    density_g_cm3: alloy.density_g_cm3,
    density_source: `${alloy.alloy}: ${alloy.source_url}`,
  };
}
