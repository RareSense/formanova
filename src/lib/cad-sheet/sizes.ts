/**
 * Ring size systems a maker may work in, all from the inside diameter. The
 * inside diameter in millimeters is always printed too, since every bench
 * understands it.
 *  - US/Canada: diameter = 11.63 + 0.8128 × size mm, quarter sizes.
 *  - UK/Australia (BS 6820): letter A is 37.83 mm around, each letter +1.25 mm, half letters.
 *  - EU/ISO 8653: the inside circumference in millimeters.
 *  - Japan and India: about the circumference minus 40 mm, whole sizes.
 */
export type SizeSystem = 'us' | 'uk' | 'eu' | 'jp' | 'in';

export const SIZE_SYSTEMS: { key: SizeSystem; label: string }[] = [
  { key: 'us', label: 'US / Canada' },
  { key: 'uk', label: 'UK / Australia' },
  { key: 'eu', label: 'EU / ISO' },
  { key: 'jp', label: 'Japan' },
  { key: 'in', label: 'India' },
];

export type LengthUnit = 'mm' | 'in';

/** A length for the sheet, e.g. "2.00 mm" or "0.079 in". */
export function formatLength(mm: number, unit: LengthUnit): string {
  return unit === 'in' ? `${(mm / 25.4).toFixed(3)} in` : `${mm.toFixed(2)} mm`;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function ringSizeIn(system: SizeSystem, innerDiameterMm: number): string {
  const circ = Math.PI * innerDiameterMm;
  switch (system) {
    case 'us': {
      const s = Math.round(((innerDiameterMm - 11.63) / 0.8128) * 4) / 4;
      return `US ${Number.isInteger(s) ? s : s.toFixed(2).replace(/0$/, '')}`;
    }
    case 'uk': {
      const halves = Math.round(((circ - 37.83) / 1.25) * 2);
      if (halves < 0) return 'UK below A';
      const i = Math.floor(halves / 2);
      const letter = i < 26 ? LETTERS[i] : `Z+${i - 25}`;
      return `UK ${letter}${halves % 2 ? '½' : ''}`;
    }
    case 'eu': return `EU ${Math.round(circ)}`;
    case 'jp': return `Japan ${Math.max(1, Math.round(circ - 40))}`;
    case 'in': return `India ${Math.max(1, Math.round(circ - 40))}`;
  }
}

/** "US 7 · 17.3 mm inside" (or 0.681 in inside). */
export function formatRingSizeIn(system: SizeSystem, innerDiameterMm: number, unit: LengthUnit): string {
  const inside = unit === 'in' ? `${(innerDiameterMm / 25.4).toFixed(3)} in` : `${innerDiameterMm.toFixed(1)} mm`;
  return `${ringSizeIn(system, innerDiameterMm)} · ${inside} inside`;
}

/** The size system most makers in the visitor's region use. */
export function defaultSizeSystem(lang: string): SizeSystem {
  const l = lang.toLowerCase();
  if (/^en-(gb|au|nz|ie|za)/.test(l)) return 'uk';
  if (l.startsWith('ja')) return 'jp';
  if (l === 'en-in' || l.startsWith('hi')) return 'in';
  if (/^en(-us|-ca)?$/.test(l) || l.startsWith('es-mx') || l.startsWith('fr-ca')) return 'us';
  return 'eu';
}
