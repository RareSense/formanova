/**
 * Jewelry CAD tech sheet (free tool 3): the facts a manufacturer needs from a
 * CAD file, each labelled by where it came from, as the proposal requires:
 * read from the CAD file, estimated, or entered by the jeweler. Pure data and
 * functions; the browser reading and the PDF live elsewhere.
 */

export type Source = 'cad' | 'estimated' | 'you';

export const SOURCE_LABEL: Record<Source, string> = {
  cad: 'From CAD',
  estimated: 'Estimated',
  you: 'Entered by you',
};

/** Units a jeweler can choose when the file does not store them. */
export const UNIT_CHOICES = [
  { key: 'mm', label: 'Millimeters', perMm: 1 },
  { key: 'cm', label: 'Centimeters', perMm: 10 },
  { key: 'in', label: 'Inches', perMm: 25.4 },
] as const;
export type UnitKey = (typeof UNIT_CHOICES)[number]['key'];

/** Formats that never record units: the jeweler must confirm them. */
const UNITLESS = new Set(['stl', 'obj', 'ply']);

export function storesUnits(format: string): boolean {
  return !UNITLESS.has(format.toLowerCase());
}

/** What the reader found in the file, in the file's own units. */
export interface CadReading {
  fileName: string;
  format: string;
  /** Units the file states, or null when it states none. */
  fileUnits: string | null;
  /** Overall size along the file's axes, in file units: [x, y, z]. */
  size: [number, number, number];
  /** Which axis points up in the file. */
  upAxis: 'y' | 'z';
  parts: number;
  layers: string[];
  /** Rhino surfaces saved without a display mesh ("Save small"): no 3D view in the browser. */
  partsWithoutMesh: number;
}

/** Millimetres per one unit of the file. */
const MM_PER: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, um: 0.001 };

/**
 * Overall width, depth and height in millimetres, with the vertical axis last.
 * Units come from the file when it states them; otherwise from the jeweler's
 * choice, and then they are only an estimate until confirmed.
 */
export function overallSize(r: CadReading, chosen: UnitKey | null): { mm: [number, number, number]; source: Source; units: string } {
  const units = r.fileUnits ?? chosen ?? 'mm';
  const k = MM_PER[units] ?? 1;
  const [x, y, z] = r.size.map((v) => v * k) as [number, number, number];
  const mm: [number, number, number] = r.upAxis === 'z' ? [x, y, z] : [x, z, y];
  const source: Source = r.fileUnits ? 'cad' : chosen ? 'you' : 'estimated';
  return { mm, source, units };
}

/** "21.0 × 12.4 × 26.2 mm", one decimal, the way a bench sheet reads. */
export function formatSize(mm: [number, number, number]): string {
  return `${mm.map((v) => v.toFixed(1)).join(' × ')} mm`;
}

/** The fields the jeweler fills in, all optional. */
export interface EnteredFields {
  pieceName: string;
  reference: string;
  revision: string;
  metal: string;
  /** Measured values the jeweler may type over; empty means "use the measurement". */
  ringSize: string;
  band: string;
  stones: string;
  weight: string;
  finish: string;
  tolerances: string;
  hallmark: string;
  engraving: string;
  designer: string;
  customer: string;
  notes: string;
}

export const EMPTY_ENTERED: EnteredFields = {
  pieceName: '', reference: '', revision: 'A', metal: '', ringSize: '', band: '', stones: '', weight: '',
  finish: '', tolerances: '', hallmark: '', engraving: '', designer: '', customer: '', notes: '',
};

/** Values the tool measures from the model, which the jeweler can type over. */
export const MEASURED_FIELDS: { key: 'ringSize' | 'band' | 'stones' | 'weight'; label: string; placeholder: string }[] = [
  { key: 'ringSize', label: 'Ring size', placeholder: 'e.g. US 7 · 17.3 mm inside' },
  { key: 'band', label: 'Band at the back', placeholder: 'e.g. 2.0 mm wide × 1.4 mm thick' },
  { key: 'stones', label: 'Stones', placeholder: 'e.g. 1 × round 6.50 mm; 24 × round 1.30 mm' },
  { key: 'weight', label: 'Metal weight', placeholder: 'e.g. 3.2 g' },
];

/** Fields only the jeweler can give. Metal is chosen from a list on the page. */
export const ENTERED_LABELS: { key: keyof EnteredFields; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'finish', label: 'Finish', placeholder: 'e.g. high polish, matte band' },
  { key: 'tolerances', label: 'Tolerances', placeholder: 'e.g. ±0.05 mm on seats' },
  { key: 'hallmark', label: 'Hallmark / stamp', placeholder: 'e.g. 750, maker’s mark inside the shank' },
  { key: 'engraving', label: 'Engraving', placeholder: 'e.g. “Always” inside, 1.2 mm script' },
  { key: 'designer', label: 'Designer', placeholder: 'Your name or studio' },
  { key: 'customer', label: 'Customer / order no.', placeholder: 'e.g. Order 2041' },
  { key: 'notes', label: 'Production notes', placeholder: 'e.g. cast in one piece, set after polish', wide: true },
];

/** One line of the "From the file" block, with its source. */
export interface ReadRow {
  label: string;
  value: string;
  source: Source;
}

export function readRows(r: CadReading, chosen: UnitKey | null): ReadRow[] {
  const size = overallSize(r, chosen);
  const unitText = r.fileUnits
    ? (UNIT_CHOICES.find((u) => u.key === r.fileUnits)?.label ?? r.fileUnits)
    : `${UNIT_CHOICES.find((u) => u.key === (chosen ?? 'mm'))?.label} (not stored in ${r.format.toUpperCase()} files)`;
  const rows: ReadRow[] = [
    { label: 'File', value: r.fileName, source: 'cad' },
    { label: 'Units', value: unitText, source: r.fileUnits ? 'cad' : chosen ? 'you' : 'estimated' },
    { label: 'Overall size (W × D × H)', value: formatSize(size.mm), source: size.source },
    { label: 'Parts', value: String(r.parts), source: 'cad' },
  ];
  if (r.layers.length) rows.push({ label: 'Layers', value: layerText(r.layers), source: 'cad' });
  return rows;
}

/** Safe PDF file name from the piece name or the CAD file name. */
export function sheetFileName(entered: EnteredFields, cadFileName: string): string {
  const base = [entered.pieceName.trim() || cadFileName.replace(/\.[^.]+$/, ''), entered.reference.trim(), 'tech sheet']
    .filter(Boolean).join(' ');
  return `${base.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'tech-sheet'}.pdf`;
}

/**
 * Layer names worth printing: the last part of each path, without names that
 * are only numbers and punctuation ("3, 5 :: 17"), which mean nothing on a sheet.
 */
export function layerText(layers: string[]): string {
  const named = [...new Set(layers.map((l) => l.split('::').pop()!.trim()).filter((l) => /\p{L}/u.test(l)))];
  const unnamed = layers.length - layers.filter((l) => /\p{L}/u.test(l.split('::').pop()!)).length;
  const parts = [...named];
  if (unnamed) parts.push(`${unnamed} unnamed`);
  return parts.join(', ');
}
