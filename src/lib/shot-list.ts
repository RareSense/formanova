/**
 * Shot List state for the Bulk Studio workspace.
 *
 * Pure reducer: one row = one physical jewelry piece with 1-3 equal reference
 * angles. No angle is a "cover"; order is upload order and is passed as-is to
 * `jewelry_image_urls[]` at generation time.
 *
 * The global Single/Multi-Angle toggle is view-only and lives outside this
 * reducer, so switching it can never drop uploaded angles.
 */

/** Matches the current High Effort backend contract (1-3 jewelry images). */
export const MAX_ANGLES_PER_PIECE = 3;

export interface ShotAngle {
  id: string;
  /** Local object URL or remote URL used for the thumbnail. */
  previewUrl: string;
  /** Present until the file is uploaded (M2). */
  file?: File;
  /** Set after upload / when picked from Past Jewelry. */
  assetId?: string;
  url?: string;
}

export interface ShotAssignee {
  id: string;
  kind: 'model' | 'scene';
  name: string;
  imageUrl: string;
}

export interface ShotRow {
  id: string;
  angles: ShotAngle[];
  assignees: ShotAssignee[];
}

export interface ShotListState {
  rows: ShotRow[];
  selectedIds: string[];
}

export type RowPrecision = 'standard' | 'multi-angle';

export type ShotListAction =
  | { type: 'addPieces'; pieces: ShotAngle[][]; rowIds: string[] }
  | { type: 'removeRow'; rowId: string }
  | { type: 'addAngles'; rowId: string; angles: ShotAngle[] }
  | { type: 'removeAngle'; rowId: string; angleId: string }
  | { type: 'moveAngle'; rowId: string; from: number; to: number }
  | { type: 'mergeRows'; sourceId: string; targetId: string }
  | { type: 'splitRow'; rowId: string; newRowIds: string[] }
  | { type: 'toggleSelect'; rowId: string }
  | { type: 'selectAll' }
  | { type: 'clearSelection' };

export const initialShotListState: ShotListState = { rows: [], selectedIds: [] };

/** A row with 2+ angles is High Precision, whatever the global toggle says. */
export function rowPrecision(row: ShotRow): RowPrecision {
  return row.angles.length >= 2 ? 'multi-angle' : 'standard';
}

/** One shot per assigned model/scene. */
export function rowShotCount(row: ShotRow): number {
  return row.assignees.length;
}

export function totalShotCount(state: ShotListState): number {
  return state.rows.reduce((sum, r) => sum + rowShotCount(r), 0);
}

export function canAddAngle(row: ShotRow): boolean {
  return row.angles.length < MAX_ANGLES_PER_PIECE;
}

function mapRow(state: ShotListState, rowId: string, fn: (r: ShotRow) => ShotRow): ShotListState {
  let changed = false;
  const rows = state.rows.map((r) => {
    if (r.id !== rowId) return r;
    const next = fn(r);
    if (next !== r) changed = true;
    return next;
  });
  return changed ? { ...state, rows } : state;
}

function dropRow(state: ShotListState, rowId: string): ShotListState {
  if (!state.rows.some((r) => r.id === rowId)) return state;
  return {
    rows: state.rows.filter((r) => r.id !== rowId),
    selectedIds: state.selectedIds.filter((id) => id !== rowId),
  };
}

export function shotListReducer(state: ShotListState, action: ShotListAction): ShotListState {
  switch (action.type) {
    case 'addPieces': {
      const rows = action.pieces
        .map((angles, i) => ({
          id: action.rowIds[i],
          angles: angles.slice(0, MAX_ANGLES_PER_PIECE),
          assignees: [],
        }))
        .filter((r) => r.id && r.angles.length > 0);
      return rows.length ? { ...state, rows: [...state.rows, ...rows] } : state;
    }

    case 'removeRow':
      return dropRow(state, action.rowId);

    case 'addAngles':
      return mapRow(state, action.rowId, (r) => {
        const room = MAX_ANGLES_PER_PIECE - r.angles.length;
        if (room <= 0 || action.angles.length === 0) return r;
        return { ...r, angles: [...r.angles, ...action.angles.slice(0, room)] };
      });

    case 'removeAngle': {
      const row = state.rows.find((r) => r.id === action.rowId);
      if (!row || !row.angles.some((a) => a.id === action.angleId)) return state;
      // Removing the only photo removes the piece.
      if (row.angles.length === 1) return dropRow(state, action.rowId);
      return mapRow(state, action.rowId, (r) => ({
        ...r,
        angles: r.angles.filter((a) => a.id !== action.angleId),
      }));
    }

    case 'moveAngle':
      return mapRow(state, action.rowId, (r) => {
        const { from, to } = action;
        const n = r.angles.length;
        if (from === to || from < 0 || to < 0 || from >= n || to >= n) return r;
        const angles = [...r.angles];
        const [moved] = angles.splice(from, 1);
        angles.splice(to, 0, moved);
        return { ...r, angles };
      });

    case 'mergeRows': {
      // Source photos become extra angles of target. Refused if it would exceed the cap.
      if (action.sourceId === action.targetId) return state;
      const source = state.rows.find((r) => r.id === action.sourceId);
      const target = state.rows.find((r) => r.id === action.targetId);
      if (!source || !target) return state;
      if (source.angles.length + target.angles.length > MAX_ANGLES_PER_PIECE) return state;
      const merged = mapRow(state, target.id, (r) => ({
        ...r,
        angles: [...r.angles, ...source.angles],
      }));
      return dropRow(merged, source.id);
    }

    case 'splitRow': {
      const idx = state.rows.findIndex((r) => r.id === action.rowId);
      if (idx < 0) return state;
      const row = state.rows[idx];
      if (row.angles.length < 2) return state;
      if (action.newRowIds.length < row.angles.length - 1) return state;
      // First angle stays in the original row (keeps its assignees); the rest become new pieces right after it.
      const pieces: ShotRow[] = row.angles.map((angle, i) =>
        i === 0
          ? { ...row, angles: [angle] }
          : { id: action.newRowIds[i - 1], angles: [angle], assignees: [...row.assignees] },
      );
      const rows = [...state.rows];
      rows.splice(idx, 1, ...pieces);
      return { ...state, rows };
    }

    case 'toggleSelect': {
      if (!state.rows.some((r) => r.id === action.rowId)) return state;
      const on = state.selectedIds.includes(action.rowId);
      return {
        ...state,
        selectedIds: on
          ? state.selectedIds.filter((id) => id !== action.rowId)
          : [...state.selectedIds, action.rowId],
      };
    }

    case 'selectAll':
      return { ...state, selectedIds: state.rows.map((r) => r.id) };

    case 'clearSelection':
      return state.selectedIds.length ? { ...state, selectedIds: [] } : state;

    default:
      return state;
  }
}
