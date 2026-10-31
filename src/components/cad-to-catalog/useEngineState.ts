import { useSyncExternalStore } from 'react';
import type { CatalogEngine, EngineState } from './engine/engine';

const EMPTY: EngineState = { fileName: '', parts: [], sets: [], selected: new Set(), info: null, canUndo: false, canRedo: false, ready: false };

/** The engine's state, re-rendering on every change it reports. */
export function useEngineState(engine: CatalogEngine | null): EngineState {
  return useSyncExternalStore(
    (cb) => (engine ? engine.subscribe(cb) : () => {}),
    () => engine?.state ?? EMPTY,
  );
}
