import { useState, useCallback, useRef, useEffect } from "react";
import { useCredits } from "@/contexts/CreditsContext";
import { toast } from "sonner";
import { performCreditPreflight, type PreflightResult } from "@/lib/credit-preflight";
import { TOOL_COSTS } from "@/lib/credits-api";
import { AuthExpiredError, authenticatedFetch } from "@/lib/authenticated-fetch";
import { pollWorkflow, type PollWorkflowResult } from "@/lib/poll-workflow";
import {
  resolveCadTerminalNode,
  resolveCadProgressNode,
  parseCadResult,
  type CadGenerationResult,
} from "@/lib/cad-poll-resolvers";
import {
  CAD_EDIT_WORKFLOW,
  CAD_IMAGE_GENERATION_WORKFLOW,
  buildCadEditStartBody,
  buildImageCadStartBody,
  CAD_GENERATION_WORKFLOW,
  buildCadGenerationStartBody,
} from "@/lib/cad-workflows";
import { resolveCadGenerationTier } from "@/lib/cad-tier";
import {
  RING_CAD_NURBS_WORKFLOW,
  RING_CAD_DEFAULT_TIER,
  RING_CAD_POLL_TIMEOUT_MS,
  buildRingCadStartBody,
  parseRingCadResult,
  parseRingCadFailure,
  isRingCadSuccess,
  resolveRingCadCredits,
  ringCadProgressFraction,
  isRingCadRepairing,
  type ArtifactRef,
} from "@/lib/ring-cad-nurbs-api";
import { trackPaywallHit, trackCadGenerationCompleted } from "@/lib/posthog-events";

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface WorkflowParams {
  model: string;
  prompt: string;
  /** Ordered reference set, 0..5 images. Index 0 is IMAGE 1 and wins every conflict. */
  referenceImages: File[];
  /** ring_cad_nurbs_v1 tier; selects both the model and the price. */
  tier?: string;
  pushUndo: (label: string) => void;
  userId: string | undefined;
  onWorkspaceActivate: () => void;
}

export function useImageToCADWorkflow({
  model,
  prompt,
  referenceImages,
  tier = RING_CAD_DEFAULT_TIER,
  pushUndo,
  userId,
  onWorkspaceActivate,
}: WorkflowParams) {
  const { refreshCredits } = useCredits();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [creditBlock, setCreditBlock] = useState<PreflightResult | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [glbUrl, setGlbUrl] = useState<string | undefined>(undefined);
  const [glbArtifact, setGlbArtifact] = useState<{ uri: string; type: string; bytes: number; sha256: string } | null>(null);
  const [sourceWorkflowId, setSourceWorkflowId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  /** The machinable deliverable. Present only for ring_cad_nurbs_v1 runs. */
  const [threedmArtifact, setThreedmArtifact] = useState<ArtifactRef | null>(null);
  /** 0..1, derived from node_visit_seq rather than a named progress node. */
  const [progressFraction, setProgressFraction] = useState(0);
  /** Backend-authored failure copy, safe to show the user directly. */
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  /** Exports fine but some part is not a closed solid - flag before manufacture. */
  const [notAllSolid, setNotAllSolid] = useState(false);

  const pollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { pollAbortRef.current?.abort(); }, []);

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
      // Images go up as data: URLs; the server stores them content-addressed.
      const dataUris = await Promise.all(referenceImages.map(fileToDataUri));
      const requestBody = buildRingCadStartBody({
        referenceImages: dataUris,
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

      pollAbortRef.current?.abort();
      const pollAbort = new AbortController();
      pollAbortRef.current = pollAbort;

      let genPollResult: PollWorkflowResult<unknown>;
      try {
        genPollResult = await pollWorkflow<unknown>({
          mode: 'status-then-result',
          fetchStatus: () => authenticatedFetch(`/api/status/${encodeURIComponent(workflow_id)}`, { signal: pollAbort.signal }),
          // /result blocks until the run finishes, so it is fetched once, after
          // status reports terminal - never as a poll.
          fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
          resolveState: (statusData) => {
            const s = statusData as { runtime?: { state?: string } };
            return (s.runtime?.state || 'unknown').toLowerCase();
          },
          parseResult: (d) => d,
          onStatusData: (statusData) => {
            // Progress comes from node_visit_seq, not named nodes: this workflow
            // has 46 of them and does not report a current-node label.
            setProgressFraction(ringCadProgressFraction(statusData));
            setProgressStep(isRingCadRepairing(statusData) ? "repairing" : "building");
          },
          intervalMs: 5000,
          timeoutMs: RING_CAD_POLL_TIMEOUT_MS,
          max404s: 13,
          maxPollErrors: 10,
          maxResultRetries: 1,
          signal: pollAbort.signal,
        });
      } catch (err) {
        if (err instanceof AuthExpiredError) return;
        throw err;
      }

      if (genPollResult.status === 'cancelled') return;

      const raw = genPollResult.result;

      if (!isRingCadSuccess(raw)) {
        const failure = parseRingCadFailure(raw);
        setFailureMessage(failure.userMessage);
        setProgressStep("failed_final");
        setIsGenerating(false);
        setGenerationFailed(true);
        // A failed run releases the whole credit hold, so the balance changed.
        refreshCredits().catch(() => {});
        return;
      }

      // All three validation_status values are successes carrying a usable ring.
      const parsed = parseRingCadResult(raw);
      setThreedmArtifact(parsed.threedmArtifact);
      setNotAllSolid(parsed.notAllSolid);
      if (parsed.glbArtifact) setGlbArtifact(parsed.glbArtifact);
      if (parsed.glbUrl) setGlbUrl(parsed.glbUrl);

      trackCadGenerationCompleted({ category: 'ring', prompt_length: prompt.trim().length, duration_ms: Date.now() - cadGenStartTime });
      setProgressStep("_loading");
      setIsModelLoading(true);
      setIsGenerating(false);
      refreshCredits().catch(() => {});
      setHasModel(true);

    } catch (err) {
      console.error("ImageToCAD generation failed:", err);
      setIsGenerating(false);
      setProgressStep("");
      setGenerationFailed(true);
    }
  }, [prompt, referenceImages, tier, isGenerating, refreshCredits, onWorkspaceActivate]);

  const runEditWithPrompt = useCallback(async (promptText: string, label: string) => {
    if (!promptText.trim()) { toast.error("Please describe the edit"); return; }
    if (isGenerating || isEditing) return;
    if (!sourceWorkflowId) { toast.error("Generate a ring before editing"); return; }

    const modelKey = `${CAD_EDIT_WORKFLOW}:${model}`;
    const requiredCredits = TOOL_COSTS[modelKey] ?? TOOL_COSTS[CAD_EDIT_WORKFLOW] ?? 5;
    try {
      const result = await performCreditPreflight(CAD_EDIT_WORKFLOW, 1, { model });
      const balance = result.currentBalance;
      const cost = result.estimatedCredits > 0 ? result.estimatedCredits : requiredCredits;
      if (balance < cost) { setCreditBlock({ approved: false, estimatedCredits: cost, currentBalance: balance }); return; }
      setCreditBlock(null);
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error('[ImageToCAD Edit Preflight] failed:', err);
      setCreditBlock(null);
    }

    pushUndo(label);
    setIsEditing(true);
    setIsGenerating(true);
    setRetryAttempt(0);
    setProgressStep("generate_initial");

    try {
      const startRes = await authenticatedFetch(`/api/run/${CAD_EDIT_WORKFLOW}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCadEditStartBody(promptText, sourceWorkflowId, model)),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `Failed to start edit (${startRes.status})`);
      }

      const { workflow_id } = await startRes.json();
      if (!workflow_id) throw new Error("No workflow_id returned");

      pollAbortRef.current?.abort();
      const pollAbort = new AbortController();
      pollAbortRef.current = pollAbort;

      let editPollResult: PollWorkflowResult<CadGenerationResult>;
      try {
        editPollResult = await pollWorkflow<CadGenerationResult>({
          mode: 'status-then-result',
          fetchStatus: () => authenticatedFetch(`/api/status/${encodeURIComponent(workflow_id)}`, { signal: pollAbort.signal }),
          fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
          resolveState: (statusData) => {
            const s = statusData as { runtime?: { state?: string }; progress?: { state?: string }; state?: string };
            const state = (s.runtime?.state || s.progress?.state || s.state || 'unknown').toLowerCase();
            return (['failed', 'budget_exhausted', 'terminated', 'cancelled', 'timed_out', 'timeout'].includes(state)) ? 'completed' : state;
          },
          resolveTerminalNode: resolveCadTerminalNode,
          resolveProgressNode: resolveCadProgressNode,
          parseResult: (d) => parseCadResult(d, 'edit'),
          onProgress: ({ node, retryCount }) => {
            setProgressStep(node);
            if (retryCount > 0) setRetryAttempt(retryCount);
          },
          onStatusData: (statusData) => {
            const s = statusData as { runtime?: { state?: string } };
            const state = (s.runtime?.state || "").toLowerCase();
            if (state === "failed" || state === "budget_exhausted") setProgressStep("failed_final");
          },
          intervalMs: 2000,
          timeoutMs: 60 * 60 * 1000,
          max404s: 13,
          maxPollErrors: 10,
          maxResultRetries: 1,
          signal: pollAbort.signal,
        });
      } catch (err) {
        if (err instanceof AuthExpiredError) return;
        throw err;
      }

      if (editPollResult.status === 'cancelled') return;

      const { glb_url, artifact: editArtifact } = editPollResult.result;
      setGlbArtifact(editArtifact);
      setGlbUrl(glb_url);
      setProgressStep("_loading");
      setIsModelLoading(true);
      setIsGenerating(false);
      setIsEditing(false);
      refreshCredits().catch(() => {});
      setHasModel(true);
      setSourceWorkflowId(workflow_id);
      toast.success(`${label} applied`);

    } catch (err) {
      console.error(`Edit "${label}" failed:`, err);
      toast.error(err instanceof Error ? err.message : "Edit failed");
      setIsGenerating(false);
      setIsEditing(false);
      setProgressStep("");
    }
  }, [model, isGenerating, isEditing, sourceWorkflowId, pushUndo, refreshCredits, userId]);

  const simulateEdit = useCallback(async () => {
    await runEditWithPrompt(editPrompt, "AI edit");
    setEditPrompt("");
  }, [editPrompt, runEditWithPrompt]);

  const resetWorkflow = useCallback(() => {
    setHasModel(false);
    setRetryAttempt(0);
    setProgressStep("");
    setSourceWorkflowId(null);
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    setGlbUrl(undefined);
  }, [glbUrl]);

  return {
    isGenerating, isEditing, hasModel, setHasModel,
    isModelLoading, setIsModelLoading,
    progressStep, setProgressStep,
    retryAttempt, creditBlock, setCreditBlock,
    generationFailed, setGenerationFailed,
    glbUrl, setGlbUrl, glbArtifact, setGlbArtifact,
    sourceWorkflowId, setSourceWorkflowId,
    editPrompt, setEditPrompt,
    threedmArtifact, setThreedmArtifact,
    progressFraction, failureMessage, notAllSolid,
    simulateGeneration, simulateEdit,
    resetWorkflow,
  };
}
