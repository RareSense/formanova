import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  ShotAngle,
  initialShotListState,
  shotListReducer,
  totalShotCount,
} from '@/lib/shot-list';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function angleFromFile(file: File): ShotAngle {
  return { id: newId(), previewUrl: URL.createObjectURL(file), file };
}

/**
 * Shot List state + intent-level actions. Owns local object URLs and revokes
 * them once a photo leaves the list.
 */
export function useShotList() {
  const [state, dispatch] = useReducer(shotListReducer, initialShotListState);

  const liveBlobs = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(
      state.rows.flatMap((r) => r.angles.map((a) => a.previewUrl)).filter((u) => u.startsWith('blob:')),
    );
    liveBlobs.current.forEach((u) => { if (!now.has(u)) URL.revokeObjectURL(u); });
    liveBlobs.current = now;
  }, [state.rows]);
  useEffect(() => () => liveBlobs.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /** Each file becomes its own piece (M2 adds grouping in the intake drawer). */
  const addFilesAsPieces = useCallback((files: File[]) => {
    const pieces = files.map((f) => [angleFromFile(f)]);
    dispatch({ type: 'addPieces', pieces, rowIds: pieces.map(newId) });
  }, []);

  const addFilesAsAngles = useCallback((rowId: string, files: File[]) => {
    dispatch({ type: 'addAngles', rowId, angles: files.map(angleFromFile) });
  }, []);

  const splitRow = useCallback((rowId: string, angleCount: number) => {
    dispatch({ type: 'splitRow', rowId, newRowIds: Array.from({ length: angleCount - 1 }, newId) });
  }, []);

  const shotCount = useMemo(() => totalShotCount(state), [state]);

  return { state, dispatch, addFilesAsPieces, addFilesAsAngles, splitRow, shotCount };
}
