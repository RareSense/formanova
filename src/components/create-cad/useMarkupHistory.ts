import { useCallback, useState } from "react";
import type { Mark } from "@/lib/design-markup";

/**
 * The marks on the picture with undo/redo. Every finished edit (draw, move,
 * resize, delete, clear) is one step, so Ctrl Z undoes exactly what the
 * customer just did.
 */
export function useMarkupHistory() {
  const [state, setState] = useState<{ past: Mark[][]; marks: Mark[]; future: Mark[][] }>({ past: [], marks: [], future: [] });

  const commit = useCallback((next: Mark[]) => {
    setState((s) => ({ past: [...s.past, s.marks], marks: next, future: [] }));
  }, []);
  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), marks: s.past[s.past.length - 1], future: [s.marks, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.marks], marks: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback(() => setState({ past: [], marks: [], future: [] }), []);

  return { marks: state.marks, commit, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
