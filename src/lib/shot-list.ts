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

export type AssigneeKind = 'model' | 'scene';

/** A model (On-Model) or scene (Product Shot) paired with a piece. One per shot. */
export interface ShotAssignee {
  /** Stable key: `preset:<id>` or `asset:<id>`, so the same model is never on a row twice. */
  id: string;
  kind: AssigneeKind;
  name: string;
  /** Artifact proxy URL; render via useAuthenticatedImage. */
  imageUrl: string;
  source: 'preset' | 'user';
  /** Preset id (source=preset) or asset id (source=user). */
  refId: string;
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
  | { type: 'mergeSelected' }
  | { type: 'groupAll' }
  | { type: 'separateAll'; newRowIds: string[] }
  | { type: 'reset' }
  | { type: 'removeSelected' }
  | { type: 'setAssignees'; rowIds: string[]; kind: AssigneeKind; assignees: ShotAssignee[] }
  | { type: 'replaceAssignee'; rowId: string; oldId: string; assignee: ShotAssignee }
  | { type: 'removeAssignee'; rowId: string; assigneeId: string }
  | { type: 'applyToAll'; fromRowId: string; kind: AssigneeKind }
  | { type: 'toggleSelect'; rowId: string }
  | { type: 'selectAll' }
  | { type: 'clearSelection' };

export const initialShotListState: ShotListState = { rows: [], selectedIds: [] };

/** A row with 2+ angles is High Precision, whatever the global toggle says. */
export function rowPrecision(row: ShotRow): RowPrecision {
  return row.angles.length >= 2 ? 'multi-angle' : 'standard';
}

/**
 * Assignees of the active kind. Rows keep models and scenes side by side, so
 * switching On-Model / Product Shot never drops a pairing.
 */
export function rowAssignees(row: ShotRow, kind: AssigneeKind): ShotAssignee[] {
  return row.assignees.filter((a) => a.kind === kind);
}

/** One shot per assigned model/scene of the active kind. */
export function rowShotCount(row: ShotRow, kind: AssigneeKind): number {
  return rowAssignees(row, kind).length;
}

export function totalShotCount(state: ShotListState, kind: AssigneeKind): number {
  return state.rows.reduce((sum, r) => sum + rowShotCount(r, kind), 0);
}

function sameAssignees(a: ShotAssignee[], b: ShotAssignee[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id);
}

/** True when some other row's pairing differs, so "Apply to all" would change something. */
export function canApplyToAll(state: ShotListState, rowId: string, kind: AssigneeKind): boolean {
  const row = state.rows.find((r) => r.id === rowId);
  if (!row || state.rows.length < 2) return false;
  const mine = rowAssignees(row, kind);
  return mine.length > 0 && state.rows.some((r) => r.id !== rowId && !sameAssignees(rowAssignees(r, kind), mine));
}

function dedupe(list: ShotAssignee[]): ShotAssignee[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

/** Replace the row's assignees of `kind`, keeping the other kind untouched. */
function withAssignees(row: ShotRow, kind: AssigneeKind, next: ShotAssignee[]): ShotRow {
  const others = row.assignees.filter((a) => a.kind !== kind);
  return { ...row, assignees: [...others, ...dedupe(next.filter((a) => a.kind === kind))] };
}

export function canAddAngle(row: ShotRow): boolean {
  return row.angles.length < MAX_ANGLES_PER_PIECE;
}

function selectedRows(state: ShotListState): ShotRow[] {
  return state.rows.filter((r) => state.selectedIds.includes(r.id));
}

function angleTotal(rows: ShotRow[]): number {
  return rows.reduce((n, r) => n + r.angles.length, 0);
}

/** Tap-to-merge: 2+ pieces selected and the result fits the 3-angle cap. */
export function canMergeSelected(state: ShotListState): boolean {
  const rows = selectedRows(state);
  return rows.length >= 2 && angleTotal(rows) <= MAX_ANGLES_PER_PIECE;
}

export function canGroupAll(state: ShotListState): boolean {
  return state.rows.length >= 2 && angleTotal(state.rows) <= MAX_ANGLES_PER_PIECE;
}

export function totalAngles(state: ShotListState): number {
  return angleTotal(state.rows);
}

/** Merge `rows` (in list order) into the first one; others are dropped. */
function mergeInto(state: ShotListState, rows: ShotRow[]): ShotListState {
  if (rows.length < 2 || angleTotal(rows) > MAX_ANGLES_PER_PIECE) return state;
  const [target, ...rest] = rows;
  const gone = new Set(rest.map((r) => r.id));
  return {
    rows: state.rows
      .filter((r) => !gone.has(r.id))
      .map((r) => (r.id === target.id ? { ...r, angles: rows.flatMap((x) => x.angles) } : r)),
    selectedIds: [],
  };
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

    case 'mergeSelected':
      return mergeInto(state, selectedRows(state));

    case 'groupAll':
      return mergeInto(state, state.rows);

    case 'separateAll': {
      const needed = angleTotal(state.rows) - state.rows.length;
      if (needed <= 0 || action.newRowIds.length < needed) return state;
      let k = 0;
      const rows = state.rows.flatMap((row) =>
        row.angles.map((angle, i) =>
          i === 0
            ? { ...row, angles: [angle] }
            : { id: action.newRowIds[k++], angles: [angle], assignees: [...row.assignees] },
        ),
      );
      return { rows, selectedIds: [] };
    }

    case 'removeSelected': {
      if (!state.selectedIds.length) return state;
      const gone = new Set(state.selectedIds);
      return { rows: state.rows.filter((r) => !gone.has(r.id)), selectedIds: [] };
    }

    case 'setAssignees': {
      const ids = new Set(action.rowIds);
      if (!state.rows.some((r) => ids.has(r.id))) return state;
      return {
        ...state,
        rows: state.rows.map((r) => (ids.has(r.id) ? withAssignees(r, action.kind, action.assignees) : r)),
      };
    }

    case 'replaceAssignee':
      return mapRow(state, action.rowId, (r) => {
        const i = r.assignees.findIndex((a) => a.id === action.oldId);
        if (i < 0) return r;
        if (action.assignee.id !== action.oldId && r.assignees.some((a) => a.id === action.assignee.id)) {
          // Already paired with this row: just drop the old one.
          return { ...r, assignees: r.assignees.filter((a) => a.id !== action.oldId) };
        }
        const assignees = [...r.assignees];
        assignees[i] = action.assignee;
        return { ...r, assignees };
      });

    case 'removeAssignee':
      return mapRow(state, action.rowId, (r) =>
        r.assignees.some((a) => a.id === action.assigneeId)
          ? { ...r, assignees: r.assignees.filter((a) => a.id !== action.assigneeId) }
          : r,
      );

    case 'applyToAll': {
      const from = state.rows.find((r) => r.id === action.fromRowId);
      if (!from) return state;
      const src = rowAssignees(from, action.kind);
      return { ...state, rows: state.rows.map((r) => (r.id === from.id ? r : withAssignees(r, action.kind, src))) };
    }

    case 'reset':
      return state.rows.length || state.selectedIds.length ? initialShotListState : state;

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
