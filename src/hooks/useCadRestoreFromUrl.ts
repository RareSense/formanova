import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { CadRoute } from '@/lib/cad-analytics';

interface Options {
  /** The page that owns this restore, and where the stripped URL lands. */
  cadRoute: CadRoute;
  /** `restoreCompletedWorkflow` from useImageToCADWorkflow. */
  restoreCompletedWorkflow: (
    workflowId: string | null,
    fallbackGlbUrl?: string | null,
  ) => Promise<boolean>;
  /** Called when the result could not be loaded. */
  onFailure: () => void;
}

/**
 * Boots a CAD page into a completed result carried on the URL.
 *
 * Keyed on the search params rather than on mount. Both internal restore
 * links (the completion toast, the header indicator) are usually clicked
 * while the matching CAD page is already mounted: React Router swaps the
 * query string without remounting the route, so a mount-only effect never
 * re-ran and the restore silently did nothing. Depending on the params means
 * arriving at the same route again still restores.
 *
 * The redundant run this creates is harmless. Stripping the params navigates
 * to a bare route, which re-runs this effect with nothing to restore and
 * returns immediately, so there is no loop.
 *
 * Extracted from TextToCAD and ImageToCAD, which had the same effect
 * character for character apart from the route string.
 */
export function useCadRestoreFromUrl({ cadRoute, restoreCompletedWorkflow, onFailure }: Options) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const glbParam = searchParams.get('glb');
    const workflowIdParam = searchParams.get('workflow_id');
    const workflowId = workflowIdParam?.trim() || null;
    if (!glbParam && !workflowId) return;

    void restoreCompletedWorkflow(workflowId, glbParam).then((restored) => {
      if (!restored) onFailure();
    });

    // Clean the params from the URL. This re-runs the effect with an empty
    // query string, which is the early return above.
    navigate(cadRoute, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps -- cadRoute is a per-page constant; navigate is router-stable; restoreCompletedWorkflow and onFailure are excluded because they are fresh identities every render and including them would re-fire the restore on unrelated re-renders. Regression to watch: if either ever needs to change behaviour mid-restore, this list has to be revisited.
}
