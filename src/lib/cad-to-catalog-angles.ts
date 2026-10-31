/**
 * cad-to-catalog-angles.ts
 *
 * Camera angles per jewellery type. Everyone starts from the CAD to Pictures
 * tool's angles; "Save as default" keeps a customer's own set per type in this
 * browser. Angles are relative to the piece (direction, distance, lens), so
 * one set fits every ring, not only the one it was made on.
 */
import type { JewelryCategory, PlannedAngle } from '@/lib/cad-to-catalog-queue';

const KEY = 'formanova_catalog_angles_v1';

// Directions are in the viewer's Y-up space after the piece is stood on the floor.
export const DEFAULT_ANGLES: PlannedAngle[] = [
  { name: 'Three-quarter', dir: [0.62, 0.42, 0.66] },
  { name: 'Front', dir: [0, 0.12, 1] },
  { name: 'Side', dir: [1, 0.12, 0] },
  { name: 'Top', dir: [0.001, 1, 0.02] },
  { name: 'Low hero', dir: [-0.55, 0.18, 0.82] },
];

type Store = Partial<Record<JewelryCategory, PlannedAngle[]>>;

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

const valid = (a: PlannedAngle) => typeof a?.name === 'string' && Array.isArray(a.dir) && a.dir.length === 3 && a.dir.every(Number.isFinite);

/** The angles a type is shot from: the saved set, else the defaults. */
export function anglesFor(category: JewelryCategory): PlannedAngle[] {
  const own = read()[category];
  return Array.isArray(own) && own.length && own.every(valid) ? own : DEFAULT_ANGLES;
}

export function hasOwnAngles(category: JewelryCategory): boolean {
  return anglesFor(category) !== DEFAULT_ANGLES;
}

/** Returns false when the browser would not keep it (private mode, full storage). */
export function saveAngles(category: JewelryCategory, angles: PlannedAngle[]): boolean {
  if (!angles.length || !angles.every(valid)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [category]: angles }));
    return true;
  } catch {
    return false;
  }
}

export function resetAngles(category: JewelryCategory): void {
  const s = read();
  delete s[category];
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* nothing kept to reset */ }
}
