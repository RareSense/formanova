import { useEffect, useRef } from 'react';

interface Options {
  /** `restoreCount` from useImageToCADWorkflow: bumps once per restore. */
  restoreCount: number;
  /** `restoredPrompt` from useImageToCADWorkflow; may land after the restore. */
  restoredPrompt: string | null;
  prompt: string;
  setPrompt: (prompt: string) => void;
  /** Runs once per restore, e.g. to drop this session's reference photos. */
  onRestore?: () => void;
}

/**
 * Shows a restored run's own prompt in the page's prompt box.
 *
 * The page stays mounted across restores, so whatever was typed this session
 * used to stay in the box (it only filled an empty one) and read as if it
 * were the restored run's brief. A restore now replaces it: with the run's
 * prompt, or with nothing when the run had none.
 *
 * The prompt can land after the restore (looked up once the model is shown).
 * It fills the box only while the box still holds what the restore put there,
 * so it never replaces what the user typed in the meantime.
 */
export function useRestoredRunPrompt({ restoreCount, restoredPrompt, prompt, setPrompt, onRestore }: Options) {
  const handledCount = useRef(0);
  /** What the restore last put in the box; anything else is the user's. */
  const applied = useRef<string | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => {
    if (restoreCount === 0) return;
    if (restoreCount !== handledCount.current) {
      handledCount.current = restoreCount;
      onRestore?.();
      const next = restoredPrompt ?? '';
      applied.current = next;
      setPrompt(next);
      return;
    }
    if (restoredPrompt && promptRef.current === applied.current) {
      applied.current = restoredPrompt;
      setPrompt(restoredPrompt);
    }
  }, [restoreCount, restoredPrompt]); // eslint-disable-line react-hooks/exhaustive-deps -- reacts to restores only; setPrompt and onRestore are read, not followed, so the user's typing never re-runs it
}
