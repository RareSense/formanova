/**
 * Metals and typical densities (g/cm³) for a weight estimate. Values are the
 * typical figures published in casting-supplier alloy charts; real alloys vary
 * (white golds most of all), so the sheet labels the weight Estimated and the
 * jeweler can type their own alloy's density. Proposal: "Alloys vary, so any
 * density defaults should be sourced and editable."
 */
export interface Metal {
  key: string;
  label: string;
  density: number;
}

export const METALS: Metal[] = [
  { key: 'ag925', label: 'Sterling silver 925', density: 10.36 },
  { key: 'au10y', label: '10K yellow gold', density: 11.57 },
  { key: 'au14y', label: '14K yellow gold', density: 13.07 },
  { key: 'au14w', label: '14K white gold', density: 12.61 },
  { key: 'au14r', label: '14K rose gold', density: 13.0 },
  { key: 'au18y', label: '18K yellow gold', density: 15.58 },
  { key: 'au18w', label: '18K white gold', density: 14.64 },
  { key: 'au18r', label: '18K rose gold', density: 15.15 },
  { key: 'au22y', label: '22K yellow gold', density: 17.8 },
  { key: 'pt950', label: 'Platinum 950', density: 20.1 },
  { key: 'pd950', label: 'Palladium 950', density: 12.0 },
];

/** Grams from a volume in mm³ and a density in g/cm³ (1 cm³ = 1000 mm³). */
export function weightGrams(volumeMm3: number, density: number): number {
  return (volumeMm3 / 1000) * density;
}

/** "1.98 g (150.9 mm³ at 13.07 g/cm³)" */
export function formatWeight(volumeMm3: number, density: number): string {
  return `${weightGrams(volumeMm3, density).toFixed(2)} g (${volumeMm3.toFixed(1)} mm³ at ${density} g/cm³)`;
}
