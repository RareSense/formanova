/** Snap rules for the phone's bottom sheet (CadPhoneSheet), kept pure so they test without a DOM. */

export type CadSheetSnap = 'peek' | 'half' | 'full';

export interface CadSheetHeights {
  peek: number;
  half: number;
  full: number;
}

const ORDER: CadSheetSnap[] = ['peek', 'half', 'full'];
/** A drag at least this long moves one step even when it ends nearer to where it started. */
const FLICK_PX = 40;

/** Where a drag that started at `start` and left the sheet `height` px tall should settle. */
export function sheetAfterDrag(start: CadSheetSnap, height: number, heights: CadSheetHeights): CadSheetSnap {
  const nearest = ORDER.reduce((best, s) => (Math.abs(height - heights[s]) < Math.abs(height - heights[best]) ? s : best));
  if (nearest !== start) return nearest;
  const delta = height - heights[start];
  if (Math.abs(delta) < FLICK_PX) return start;
  const i = ORDER.indexOf(start) + (delta > 0 ? 1 : -1);
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, i))];
}

/** A tab press: opens a peeking sheet, switches an open one, or lowers it when the open tab is pressed again. */
export function sheetAfterTabPress(snap: CadSheetSnap, active: string, pressed: string): { snap: CadSheetSnap; tab: string } {
  if (snap === 'peek') return { snap: 'half', tab: pressed };
  if (pressed === active) return { snap: 'peek', tab: active };
  return { snap, tab: pressed };
}
