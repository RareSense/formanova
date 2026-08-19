import { useState, useCallback, useRef, useEffect } from "react";
import { useGenerations } from "@/contexts/GenerationsContext";
import { toast } from "sonner";
import { performCreditPreflight, type PreflightResult } from "@/lib/credit-preflight";
import { AuthExpiredError, authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  RING_CAD_NURBS_WORKFLOW,
  RING_CAD_DEFAULT_TIER,
  RING_CAD_POLL_TIMEOUT_MS,
  buildRingCadStartBody,
  parseRingCadResult,
  parseRingCadFailure,
  resolveRingCadCredits,
  ringCadProgressFraction,
  isRingCadRepairing,
  type ArtifactRef,
} from "@/lib/ring-cad-nurbs-api";
import { buildReferenceInputs } from "@/lib/cad-reference-upload";
import { trackPaywallHit, trackCadGenerationCompleted } from "@/lib/posthog-events";
import { fetchCadResult } from "@/lib/generation-history-api";


interface WorkflowParams {
  model: string;
  prompt: string;
  /** Ordered reference set, 0..5 images. Index 0 is IMAGE 1 and wins every conflict. */
  referenceImages: File[];
  /** ring_cad_nurbs_v1 tier; selects both the model and the price. */
  tier?: string;
  /** Which page owns this run, so the header/toast restore link returns here. */
  cadRoute: '/text-to-cad' | '/image-to-cad';
  onWorkspaceActivate: () => void;
}

export function useImageToCADWorkflow({
  model,
  prompt,
  referenceImages,
  tier = RING_CAD_DEFAULT_TIER,
  cadRoute,
  onWorkspaceActivate,
}: WorkflowParams) {
  const { generations, trackCadGeneration } = useGenerations();

  const [isGenerating, setIsGenerating] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [creditBlock, setCreditBlock] = useState<PreflightResult | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [glbUrl, setGlbUrl] = useState<string | undefined>(undefined);
  const [glbArtifact, setGlbArtifact] = useState<{ uri: string; type: string; bytes: number; sha256: string } | null>(null);
  const [sourceWorkflowId, setSourceWorkflowId] = useState<string | null>(null);
  /** The machinable deliverable. Present only for ring_cad_nurbs_v1 runs. */
  const [threedmArtifact, setThreedmArtifact] = useState<ArtifactRef | null>(null);
  /** Backend-authored failure copy, safe to show the user directly. */
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  /** Exports fine but some part is not a closed solid - flag before manufacture. */
  const [notAllSolid, setNotAllSolid] = useState(false);

  const pollAbortRef = useRef<AbortController | null>(null);
  const generationStartRef = useRef<number>(0);
  /**
   * Set by handleKeepCreating. While true the on-page overlay stops following
   * the run, so results land via the toast instead of yanking the user back
   * into a workspace they deliberately left.
   */
  const hasNavigatedAway = useRef(false);

  useEffect(() => () => { pollAbortRef.current?.abort(); }, []);

  const trackedRun = generations.find(g => g.workflowId === sourceWorkflowId && g.kind === 'cad');

  // Mirror the context-owned run into local state for the on-page overlay.
  useEffect(() => {
    if (!trackedRun || hasNavigatedAway.current) return;

    if (trackedRun.status === 'running') {
      setProgressStep(trackedRun.generationStep.startsWith('Fixing') ? 'repairing' : 'building');
      return;
    }

    if (trackedRun.status === 'failed') {
      setProgressStep('failed_final');
      setIsGenerating(false);
      setGenerationFailed(true);
      return;
    }

    if (trackedRun.status === 'completed') {
      // Backend completion is terminal even if result hydration is still in
      // flight. Never leave the generation overlay running on GLB parsing.
      setIsGenerating(false);
      if (!trackedRun.glbUrl) {
        setProgressStep('');
        return;
      }
      setGlbUrl(trackedRun.glbUrl);
      setGlbArtifact({ uri: trackedRun.glbUrl, type: 'model/gltf-binary', bytes: 0, sha256: '' });
      if (trackedRun.threedmUrl) {
        setThreedmArtifact({ uri: trackedRun.threedmUrl, url: trackedRun.threedmUrl, type: 'model/3dm', bytes: 0, sha256: '' });
      }
      trackCadGenerationCompleted({
        category: 'ring',
        prompt_length: prompt.trim().length,
        duration_ms: Date.now() - (generationStartRef.current || Date.now()),
      });
      setProgressStep('_loading');
      setIsModelLoading(true);
      setHasModel(true);
    }
  }, [trackedRun?.status, trackedRun?.glbUrl, trackedRun?.threedmUrl, trackedRun?.generationStep]); // eslint-disable-line react-hooks/exhaustive-deps -- prompt/trackedRun object excluded: only the run's own transitions should re-drive the overlay, and including the object would re-fire on every progress tick

  /** Leaves the run running in the background and returns to the upload screen. */
  const handleKeepCreating = useCallback(() => {
    hasNavigatedAway.current = true;
    setIsGenerating(false);
    setProgressStep('');
    setGenerationFailed(false);
  }, []);

  /**
   * Restores a completed CAD run from a stable workflow id. The GLB query
   * parameter is only an eager-render hint; /api/result remains the source of
   * truth so refresh/new-session links also recover the machinable 3DM.
   */
  const restoreCompletedWorkflow = useCallback(async (
    workflowId: string | null,
    fallbackGlbUrl?: string | null,
  ): Promise<boolean> => {
    hasNavigatedAway.current = false;
    onWorkspaceActivate();
    setIsGenerating(false);
    setGenerationFailed(false);
    setFailureMessage(null);
    setSourceWorkflowId(workflowId);
    setThreedmArtifact(null);

    const seedGlb = (url: string) => {
      setHasModel(true);
      setIsModelLoading(true);
      setProgressStep('_loading');
      setGlbUrl(url);
      setGlbArtifact({ uri: url, type: 'model/gltf-binary', bytes: 0, sha256: '' });
    };

    if (fallbackGlbUrl) seedGlb(fallbackGlbUrl);

    const result = workflowId ? await fetchCadResult(workflowId) : null;
    const resolvedGlbUrl = result?.glb_url ?? fallbackGlbUrl ?? null;
    if (!resolvedGlbUrl) {
      setIsModelLoading(false);
      setProgressStep('');
      setGenerationFailed(true);
      setFailureMessage('The completed CAD result could not be loaded.');
      return false;
    }

    if (resolvedGlbUrl !== fallbackGlbUrl) seedGlb(resolvedGlbUrl);
    if (result?.threedm_url) {
      setThreedmArtifact({
        uri: result.threedm_url,
        url: result.threedm_url,
        type: 'model/vnd.rhino.3dm',
        bytes: 0,
        sha256: '',
      });
    }
    return true;
  }, [onWorkspaceActivate]);

  const simulateGeneration = useCallback(async () => {
    if (isGenerating) return;
    const imageCount = referenceImages.length;
    const hasPrompt = !!prompt.trim();
    if (imageCount === 0 && !hasPrompt) {
      toast.error("Upload an image or describe your ring first");
      return;
    }

    // The tier is the price selector for ring_cad_nurbs_v1 (70 or 100 credits).
    const fallbackCredits = resolveRingCadCredits(tier);

    try {
      const result = await performCreditPreflight(RING_CAD_NURBS_WORKFLOW, 1, {
        pricingContext: { llm_tier: tier },
      });
      const balance = result.currentBalance;
      const cost = result.estimatedCredits > 0 ? result.estimatedCredits : fallbackCredits;
      if (balance < cost) {
        setCreditBlock({ approved: false, estimatedCredits: cost, currentBalance: balance });
        trackPaywallHit({ category: 'ring', steps_completed: 1 });
        return;
      }
      setCreditBlock(null);
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error('[ImageToCAD Preflight] failed, skipping block:', err);
      setCreditBlock(null);
    }

    const cadGenStartTime = Date.now();
    // A previous run's Keep Creating leaves this true, which would otherwise
    // permanently block this hook's trackedRun mirror effect from ever
    // syncing this new run's progress/completion into the on-page viewport.
    hasNavigatedAway.current = false;
    onWorkspaceActivate();
    setIsGenerating(true);
    setGenerationFailed(false);
    setFailureMessage(null);
    setRetryAttempt(0);
    setHasModel(false);
    setSourceWorkflowId(null);
    setThreedmArtifact(null);
    setProgressStep("analyzing");

    try {
      const requestBody = buildRingCadStartBody({
        referenceImages: await buildReferenceInputs(referenceImages),
        userDescription: prompt,
        tier,
      });

      // JWT only - the tenant API key and on-behalf-of header are applied by the
      // backend proxy and must never be sent from the browser (AI_RULES section 1).
      const startRes = await authenticatedFetch(`/api/run/state/${RING_CAD_NURBS_WORKFLOW}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `Failed to start generation (${startRes.status})`);
      }

      const { workflow_id } = await startRes.json();
      if (!workflow_id) throw new Error("No workflow_id returned");
      setSourceWorkflowId(workflow_id);

      // Hand the run to GenerationsContext, which polls above the routes. That
      // is what lets the user press Keep Creating and leave: this hook's own
      // poll below only drives the on-page overlay while they stay.
      trackCadGeneration({
        workflowId: workflow_id,
        label: prompt.trim() ? prompt.trim().slice(0, 40) : 'Image to 3D',
        cadRoute,
      });

      // Polling is now GenerationsContext's job. The effect below mirrors that
      // run's state into this hook so the on-page overlay still updates while
      // the user stays, without a second poll hitting the same endpoints.
      generationStartRef.current = cadGenStartTime;

    } catch (err) {
      console.error("ImageToCAD generation failed:", err);
      // Surface the real reason. A start failure (bad payload, workflow not
      // active on this environment) is actionable, and hiding it behind the
      // generic message means the user only sees it with DevTools open.
      setFailureMessage(err instanceof Error && err.message ? err.message : null);
      setIsGenerating(false);
      setProgressStep("failed_final");
      setGenerationFailed(true);
    }
  }, [prompt, referenceImages, tier, cadRoute, isGenerating, onWorkspaceActivate, trackCadGeneration]);

  const resetWorkflow = useCallback(() => {
    hasNavigatedAway.current = false;
    setHasModel(false);
    setRetryAttempt(0);
    setProgressStep("");
    setSourceWorkflowId(null);
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    setGlbUrl(undefined);
  }, [glbUrl]);

  return {
    isGenerating, hasModel, setHasModel,
    isModelLoading, setIsModelLoading,
    progressStep, setProgressStep,
    retryAttempt, creditBlock, setCreditBlock,
    generationFailed, setGenerationFailed,
    glbUrl, setGlbUrl, glbArtifact, setGlbArtifact,
    sourceWorkflowId, setSourceWorkflowId,
    threedmArtifact, setThreedmArtifact,
    failureMessage, notAllSolid,
    simulateGeneration,
    restoreCompletedWorkflow,
    handleKeepCreating,
    resetWorkflow,
  };
}
