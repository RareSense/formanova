/**
 * useEditBeforeCad
 *
 * Image to CAD's "Edit before CAD" wiring, kept out of the page:
 * - the Use as is / Edit before CAD choice and the editor window;
 * - after the design is approved, the approved pictures replace the upload,
 *   and the choice is not asked again ("Edited design approved · Edit again")
 *   until the customer changes the pictures themselves;
 * - Generate CAD inside the editor runs the page's normal CAD start once the
 *   approved pictures are in place, so credits, progress and the result are
 *   exactly the existing flow.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEstimatedCost } from '@/hooks/use-estimated-cost';
import { RING_CAD_NURBS_WORKFLOW } from '@/lib/ring-cad-nurbs-api';
import type { DesignUse } from '@/components/text-to-cad/DesignUseChoice';

interface UseEditBeforeCadOptions {
  enabled: boolean;
  model: string;
  tier: string;
  referenceImages: File[];
  replaceReferenceImages: (files: File[]) => Promise<void> | void;
  /** Starts the page's normal CAD run with the current pictures and dimensions. */
  startCad: () => void;
  isGenerating: boolean;
}

export function useEditBeforeCad({ enabled, model, tier, referenceImages, replaceReferenceImages, startCad, isGenerating }: UseEditBeforeCadOptions) {
  const [designUse, setDesignUse] = useState<DesignUse>('as_is');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editApproved, setEditApproved] = useState(false);
  const [pendingCad, setPendingCad] = useState(false);

  const { cost: cadCost, loading: cadCostLoading } = useEstimatedCost({
    workflowName: RING_CAD_NURBS_WORKFLOW,
    model,
    pricingContext: { llm_tier: tier },
  });

  const applyApproved = useCallback(async (files: File[]) => {
    await replaceReferenceImages(files);
    setEditApproved(true);
    setDesignUse('as_is');
  }, [replaceReferenceImages]);

  // Start the CAD on the render after the approved pictures are in place, so
  // the run is built from them and not from the original upload.
  useEffect(() => {
    if (!pendingCad) return;
    setPendingCad(false);
    setEditorOpen(false);
    startCad();
  }, [pendingCad, referenceImages, startCad]);

  /** The customer changed the pictures by hand: it is a fresh upload again. */
  const picturesChanged = useCallback(() => setEditApproved(false), []);

  return {
    designUse,
    setDesignUse,
    editApproved,
    picturesChanged,
    openEditor: enabled ? () => setEditorOpen(true) : undefined,
    editorProps: {
      open: editorOpen,
      source: referenceImages[0] ?? null,
      onCancel: () => setEditorOpen(false),
      onKeep: (files: File[]) => { void applyApproved(files).then(() => setEditorOpen(false)); },
      onCreateCad: (files: File[]) => { void applyApproved(files).then(() => setPendingCad(true)); },
      cadCost,
      cadCostLoading,
      creatingCad: pendingCad || isGenerating,
    },
  };
}
