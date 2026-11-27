import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ShotAngle,
  initialShotListState,
  shotListReducer,
  totalAngles,
} from '@/lib/shot-list';

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function angleFromFile(file: File): ShotAngle {
  return { id: newId(), previewUrl: URL.createObjectURL(file), file };
}

export function revokeAngleBlobs(angles: ShotAngle[]) {
  angles.forEach((a) => { if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl); });
}

/**
 * Shot List state + intent-level actions.
 * `ownsBlobs` (the main list): revoke a local preview URL once its photo leaves
 * the list. The intake drawer's staging list passes false because its photos
 * move into the main list rather than being discarded.
 */
export function useShotList({ ownsBlobs = true }: { ownsBlobs?: boolean } = {}) {
  const [state, dispatch] = useReducer(shotListReducer, initialShotListState);

  const liveBlobs = useRef(new Set<string>());
  useEffect(() => {
    if (!ownsBlobs) return;
    const now = new Set(
      state.rows.flatMap((r) => r.angles.map((a) => a.previewUrl)).filter((u) => u.startsWith('blob:')),
    );
    liveBlobs.current.forEach((u) => { if (!now.has(u)) URL.revokeObjectURL(u); });
    liveBlobs.current = now;
  }, [state.rows, ownsBlobs]);
  useEffect(() => () => liveBlobs.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addPieces = useCallback((pieces: ShotAngle[][]) => {
    if (pieces.length) dispatch({ type: 'addPieces', pieces, rowIds: pieces.map(() => newId()) });
  }, []);

  /** Each file becomes its own piece. */
  const addFilesAsPieces = useCallback((files: File[]) => {
    addPieces(files.map((f) => [angleFromFile(f)]));
  }, [addPieces]);

  const addFilesAsAngles = useCallback((rowId: string, files: File[]) => {
    dispatch({ type: 'addAngles', rowId, angles: files.map(angleFromFile) });
  }, []);

  const splitRow = useCallback((rowId: string, angleCount: number) => {
    dispatch({ type: 'splitRow', rowId, newRowIds: Array.from({ length: angleCount - 1 }, newId) });
  }, []);

  const separateAll = useCallback(() => {
    const extra = totalAngles(state) - state.rows.length;
    dispatch({ type: 'separateAll', newRowIds: Array.from({ length: extra }, newId) });
  }, [state]);


  return {
    state, dispatch, addPieces, addFilesAsPieces, addFilesAsAngles, splitRow, separateAll,
  };
}

export type ShotListApi = ReturnType<typeof useShotList>;
