import { useState, useCallback, useRef, useEffect } from "react";
import { useGenerations } from "@/contexts/GenerationsContext";
import { toast } from "sonner";
import { useCreditPreflight } from "@/hooks/use-credit-preflight";
import { AuthExpiredError, authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  RING_CAD_NURBS_WORKFLOW,
  RING_CAD_DEFAULT_TIER,
  DEFAULT_CAD_JEWELRY_TYPE,
  RING_CAD_POLL_TIMEOUT_MS,
  buildRingCadStartBody,
  parseRingCadResult,
  parseRingCadFailure,
  ringCadProgressFraction,
  isRingCadRepairing,
  type ArtifactRef,
  type CadJewelryType,
} from "@/lib/ring-cad-nurbs-api";
import { buildReferenceInputs } from "@/lib/cad-reference-upload";
import {
  trackPaywallHit,
  trackCadGenerationStarted,
  trackCadGenerationFailed,
  trackCadImproveRequested,
  trackCadResultRestored,
} from "@/lib/posthog-events";
import {
  resolveCadSource,
  resolveRestoreEntry,
  consumeFirstCadGeneration,
  buildCadGenerationProps,
} from "@/lib/cad-analytics";
import { fetchCadResult } from "@/lib/generation-history-api";
import { fetchCadRunInputs } from "@/lib/cad-result-api";
import {
  CadImproveError,
  findRingForWorkflow,
  improveWorkflowFor,
  canImproveVersion,
  latestVersion,
  startImproveFromVersion,
  versionLabel,
  type CadRing,
  type CadRestoreSeed,
} from "@/lib/cad-versions-api";
import { cadStatusNotice, type CadStatusNotice } from '@/lib/cad-status-copy';



interface WorkflowParams {
  model: string;
  prompt: string;
  /** Ordered reference set, 0..5 images. Index 0 is IMAGE 1 and wins every conflict. */
  referenceImages: File[];
  /** ring_cad_nurbs_v1 tier; selects both the model and the price. */
  tier?: string;
  /** Product to build, sent as payload.jewelry_type. Defaults to ring. */
  jewelryType?: CadJewelryType;
  /** Which page owns this run, so the header/toast restore link returns here. */
  cadRoute: '/text-to-cad' | '/image-to-cad';
  /**
   * True when the URL carries a workflow_id or glb to restore, so the very
   * first paint is already the loading state. The restore itself runs in a
   * mount effect and then awaits the result, which is long enough to flash
   * the empty "Workspace Ready" panel at anyone arriving from the result
   * email.
   */
  restoringFromUrl?: boolean;
  onWorkspaceActivate: () => void;
}

export function useImageToCADWorkflow({
  model,
  prompt,
  referenceImages,
  tier = RING_CAD_DEFAULT_TIER,
  jewelryType = DEFAULT_CAD_JEWELRY_TYPE,
  cadRoute,
  restoringFromUrl = false,
  onWorkspaceActivate,
}: WorkflowParams) {
  const { generations, trackCadGeneration } = useGenerations();

  const [isGenerating, setIsGenerating] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(restoringFromUrl);
  const [progressStep, setProgressStep] = useState(restoringFromUrl ? "_loading" : "");
  const [retryAttempt, setRetryAttempt] = useState(0);
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
  /**
   * The saved ring this run produced, once the vault has it.
   *
   * Null for a run under an older workflow, which saved no versions at all,
   * and for a run whose version row has not been written yet. Either way the
   * Improve button stays hidden rather than pointing at nothing.
   */
  const [ring, setRing] = useState<CadRing | null>(null);
  /** Why the last Improve press could not start, in the user's own terms. */
  const [improveMessage, setImproveMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<CadStatusNotice | null>(null);
  /**
   * The photos and text a restored run was made from.
   *
   * A ring opened from history rebuilt the model but not the brief behind it,
   * so the panel came up blank. Empty for a run with no photos, and the prompt
   * stays null when none was typed, so nothing invents a brief that never
   * existed.
   */
  const [restoredReferenceUrls, setRestoredReferenceUrls] = useState<string[]>([]);
  const [restoredPrompt, setRestoredPrompt] = useState<string | null>(null);
  /** Which version the panel is showing; the newest until the user picks another. */
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  /**
   * True only while a run this page started is still on its way to the screen.
   *
   * "Ring generated successfully" fires when a model finishes loading, and a
   * model finishes loading when a ring is opened from history or a version is
   * clicked too, which announced a generation that never happened. The flag is
   * set when this page starts a run and consumed by the first model that
   * arrives afterwards.
   */
  const awaitingGeneratedToastRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const generationStartRef = useRef<number>(0);
  /** What cad_generation_started reported for is_first_ever, so the completed
   *  event reports the same value instead of re-consuming a flag that has
   *  already flipped. */
  const startedFirstEverRef = useRef(false);
  /**
   * Set by handleKeepCreating. While true the on-page overlay stops following
   * the run, so results land via the toast instead of yanking the user back
   * into a workspace they deliberately left.
   */
  const hasNavigatedAway = useRef(false);

  useEffect(() => () => { pollAbortRef.current?.abort(); }, []);

  /** Which CAD tool this hook instance is serving. Both pages share this hook,
   *  so every analytics event carries this rather than being duplicated per
   *  page. */
  const cadSource = resolveCadSource(cadRoute);

  /** Shared credit gate. Blocking behaviour (save return path, redirect to
   *  /credits with the shortfall) belongs to the hook, not to this workflow. */
  const { checkCredits } = useCreditPreflight();

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
      setStatusNotice(cadStatusNotice(trackedRun.cadFailureReasonCode));
      // Stage 'run': backend accepted the job and then failed. Kept distinct
      // from a 'start' failure because the causes share nothing.
      trackCadGenerationFailed({
        source: cadSource,
        workflow_id: trackedRun.workflowId,
        failure_stage: 'run',
        duration_ms: Date.now() - (generationStartRef.current || Date.now()),
        // has_failure_message is deliberately omitted: TrackedGeneration
        // carries no failure text, so sending false here would assert
        // something this layer cannot actually observe.
      });
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
      // An unsealed part cannot be cast or printed, so this has to be shown
      // next to the download rather than only logged.
      setNotAllSolid(trackedRun.notAllSolid === true);
      setGlbUrl(trackedRun.glbUrl);
      setGlbArtifact({ uri: trackedRun.glbUrl, type: 'model/gltf-binary', bytes: 0, sha256: '' });
      if (trackedRun.threedmUrl) {
        setThreedmArtifact({ uri: trackedRun.threedmUrl, url: trackedRun.threedmUrl, type: 'model/3dm', bytes: 0, sha256: '' });
      }
      // cad_generation_completed is NOT emitted here. This effect does not run
      // once the page unmounts and bails out early on hasNavigatedAway, so
      // every run finishing after the user left was never counted.
      // GenerationsContext owns the poll, outlives the page and emits it there.
      setProgressStep('_loading');
      setIsModelLoading(true);
      setHasModel(true);
    }
  }, [trackedRun?.status, trackedRun?.glbUrl, trackedRun?.threedmUrl, trackedRun?.generationStep, trackedRun?.cadFailureReasonCode]); // eslint-disable-line react-hooks/exhaustive-deps -- prompt/referenceImages/tier/cadRoute/cadSource and the trackedRun object are excluded: only the run's own transitions should re-drive the overlay, and including the object would re-fire on every progress tick. The analytics values are read from the closure of the render in which status changed, which is the correct moment for them. Regression to watch: if a future edit fires an event here on something other than a status transition, those values could be stale.

  /**
   * Looks up the ring this run saved, which is what the Improve button needs.
   *
   * Runs once a model is on screen, which is after /result has returned, so
   * the version row is already written and the first attempt normally hits.
   * The lookup retries internally for the case where the caller arrived from
   * /status alone, where the write can still be a moment away.
   *
   * A run under an older workflow saves no ring, so this settles on null and
   * the bar keeps holding the download by itself.
   */
  useEffect(() => {
    // Starts as soon as the run has a result, not once the GLB has finished
    // loading: parsing a heavy ring takes seconds, and waiting for it left the
    // button missing on a ring that was already saved and improvable.
    const ready = trackedRun ? trackedRun.status === 'completed' : hasModel;
    if (!ready || !sourceWorkflowId) return;
    let cancelled = false;
    findRingForWorkflow(sourceWorkflowId)
      .then(async (found) => {
        if (cancelled) return;
        setRing(found);
        const producedVersion = (found?.versions ?? []).find(
          (version) => version.source_workflow_id === sourceWorkflowId,
        );
        if (producedVersion) setSelectedVersionId(producedVersion.asset_id);
        // The photos and brief belong to the ring, not to the press: an
        // improve run's own inputs are the saved files it was handed, so
        // opening V3 from history showed no reference images at all. They come
        // from the run that made version 0, whichever version is on screen.
        const root = (found?.versions ?? []).find((v) => (v.position ?? 0) === 0);
        if (root?.source_workflow_id && root.source_workflow_id !== sourceWorkflowId) {
          const inputs = await fetchCadRunInputs(root.source_workflow_id);
          if (cancelled) return;
          if (inputs.referenceImageUrls.length) setRestoredReferenceUrls(inputs.referenceImageUrls);
          if (inputs.prompt) setRestoredPrompt(inputs.prompt);
        }
      })
      .catch(() => {
        if (!cancelled) setRing(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasModel, trackedRun?.status, sourceWorkflowId]);

  const versions = ring?.versions ? [...ring.versions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
  const latestRingVersion = ring ? latestVersion(ring) : null;
  /** What Improve acts on: the version on screen, which is the newest until picked. */
  const activeVersion = versions.find((v) => v.asset_id === selectedVersionId) ?? latestRingVersion;

  /** Opens an earlier version in the viewer. Its files are already published. */
  const selectVersion = useCallback((assetId: string) => {
    const version = (ring?.versions ?? []).find((v) => v.asset_id === assetId);
    if (!version?.glb_url) return;
    awaitingGeneratedToastRef.current = false;
    setStatusNotice(null);
    setSelectedVersionId(assetId);
    setGlbUrl(version.glb_url);
    setGlbArtifact({ uri: version.glb_url, type: 'model/gltf-binary', bytes: 0, sha256: '' });
    setThreedmArtifact(version.threedm_url
      ? { uri: version.threedm_url, url: version.threedm_url, type: 'model/3dm', bytes: 0, sha256: '' }
      : null);
    setIsModelLoading(true);
    setHasModel(true);
  }, [ring]);

  /**
   * One repair pass on the newest version, saved as the next one.
   *
   * The backend starts the run: the one-improve-per-ring rule lives on its
   * endpoint, and it holds the credits itself, so there is no preflight here.
   * The started run is handed to GenerationsContext exactly as a generation
   * is, so the existing poll, overlay and toast carry it without knowing it
   * came from a different button.
   */
  const improveFromLatestVersion = useCallback(async () => {
    if (!activeVersion || !canImproveVersion(activeVersion) || ring?.improve_running) return;
    setImproveMessage(null);
    // The same gate every paid run uses: it saves this page as the return
    // path, shows the balance against the price, and sends the user to
    // /credits. Reaching the endpoint's own 402 instead would swap that
    // shared flow for a toast that says less and leads nowhere.
    const approved = await checkCredits(improveWorkflowFor({ family: ring?.family }), 1);
    if (!approved) return;
    try {
      const started = await startImproveFromVersion(activeVersion.asset_id);
      const fromVersion = (activeVersion.position ?? 0) + 1;
      trackCadImproveRequested({
        workflow_id: started.workflow_id,
        source: cadSource,
        from_version: fromVersion,
      });
      hasNavigatedAway.current = false;
      // The current ring stays mounted while Improve runs. Marking a success
      // toast as owed here makes that already-loaded model announce itself as
      // newly generated before the improve workflow has produced anything.
      awaitingGeneratedToastRef.current = false;
      onWorkspaceActivate();
      setIsGenerating(true);
      setGenerationFailed(false);
      setFailureMessage(null);
      setStatusNotice(null);
      setNotAllSolid(false);
      // Keep the inspected version, its references and the version strip on
      // screen while Improve runs. A no-change/error result creates no new
      // model, so clearing these would leave an empty workspace afterward.
      setProgressStep('building');
      generationStartRef.current = Date.now();
      setSourceWorkflowId(started.workflow_id);
      trackCadGeneration({
        workflowId: started.workflow_id,
        label: `Improve ${versionLabel(activeVersion)}`,
        cadRoute,
        analytics: {
          ...buildCadGenerationProps({ cadRoute, prompt, referenceImageCount: referenceImages.length, tier }),
          is_first_ever: false,
          operation: 'improve',
          from_version: fromVersion,
          ...(started.projected_cost !== undefined ? { projected_cost: started.projected_cost } : {}),
          ...(started.authorized_budget !== undefined ? { authorized_budget: started.authorized_budget } : {}),
        },
      });
    } catch (error) {
      if (error instanceof CadImproveError && error.failure === 'insufficient_credits') {
        // The balance moved between the gate above and the start call, so hand
        // it back to the same shared flow rather than explaining it here.
        await checkCredits(improveWorkflowFor({ family: ring?.family }), 1);
        return;
      }
      const message =
        error instanceof CadImproveError
          ? error.message
          : 'Could not start the improvement. Please try again.';
      setImproveMessage(message);
      toast.error(message);
    }
  }, [activeVersion, cadRoute, cadSource, checkCredits, onWorkspaceActivate, prompt, referenceImages.length, ring?.family, ring?.improve_running, tier, trackCadGeneration]);

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
    seed?: CadRestoreSeed,
  ): Promise<boolean> => {
    // Captured synchronously, before the await below. Both pages strip the
    // query string once this resolves (navigate(..., { replace: true })), so
    // reading the marker afterwards would always see an unmarked URL and
    // report every internal restore as external.
    const entry = resolveRestoreEntry(window.location.search);

    hasNavigatedAway.current = false;
    onWorkspaceActivate();
    setIsGenerating(false);
    setGenerationFailed(false);
    setFailureMessage(null);
    setStatusNotice(null);
    setSourceWorkflowId(workflowId);
    setRing(seed?.ring ?? null);
    setSelectedVersionId(seed?.selectedVersionId ?? null);
    setRestoredReferenceUrls(seed?.referenceImageUrls ?? []);
    setRestoredPrompt(seed?.prompt ?? null);
    setThreedmArtifact(null);
    setIsModelLoading(true);
    setProgressStep('_loading');

    const seedGlb = (url: string) => {
      setHasModel(true);
      setIsModelLoading(true);
      setProgressStep('_loading');
      setGlbUrl(url);
      setGlbArtifact({ uri: url, type: 'model/gltf-binary', bytes: 0, sha256: '' });
    };

    // Restoring shows a ring that already existed; nothing was generated here.
    awaitingGeneratedToastRef.current = false;
    if (fallbackGlbUrl) seedGlb(fallbackGlbUrl);

    const result = workflowId ? await fetchCadResult(workflowId) : null;
    setNotAllSolid(result?.not_all_solid === true);
    const resolvedGlbUrl = result?.glb_url ?? fallbackGlbUrl ?? null;
    if (!resolvedGlbUrl) {
      setIsModelLoading(false);
      setProgressStep('');
      setGenerationFailed(true);
      setFailureMessage('The completed CAD result could not be loaded.');
      trackCadResultRestored({ source: cadSource, entry, restore_ok: false });
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
    trackCadResultRestored({ source: cadSource, entry, restore_ok: true });
    if (workflowId) {
      // After the model, never before it: the ring is what the user came for,
      // and this is only the brief beside it.
      void fetchCadRunInputs(workflowId).then(({ referenceImageUrls, prompt }) => {
        setRestoredReferenceUrls(referenceImageUrls);
        setRestoredPrompt(prompt);
      });
    }
    return true;
  }, [onWorkspaceActivate, cadSource]);

  const simulateGeneration = useCallback(async () => {
    if (isGenerating) return;
    const imageCount = referenceImages.length;
    const hasPrompt = !!prompt.trim();
    if (imageCount === 0 && !hasPrompt) {
      toast.error("Upload an image or describe your ring first");
      return;
    }

    // Same gate every paid workflow uses. checkCredits owns the comparison, the
    // saved return path and the redirect to /credits, so CAD does not restate
    // any of it. The tier price is backend's to set and it moves, so no
    // fallback figure is written here; when the estimate is unavailable the
    // start call below is the authority and rejects with 402.
    const approved = await checkCredits(RING_CAD_NURBS_WORKFLOW, 1, {
      pricingContext: { llm_tier: tier },
    });
    if (!approved) {
      trackPaywallHit({ category: 'ring', steps_completed: 1, source: cadSource });
      return;
    }

    const cadGenStartTime = Date.now();
    // A previous run's Keep Creating leaves this true, which would otherwise
    // permanently block this hook's trackedRun mirror effect from ever
    // syncing this new run's progress/completion into the on-page viewport.
    hasNavigatedAway.current = false;
    awaitingGeneratedToastRef.current = true;
    onWorkspaceActivate();
    setIsGenerating(true);
    setGenerationFailed(false);
    setFailureMessage(null);
    setRetryAttempt(0);
    setHasModel(false);
    setSourceWorkflowId(null);
    setThreedmArtifact(null);
    // Clear the previous ring's solidity result: a stale warning on a new run
    // is worse than none, because it trains people to ignore it.
    setNotAllSolid(false);
    // Likewise the previous ring: improving from it while a new one builds
    // would start a press on a ring the user is no longer looking at.
    setRing(null);
    setImproveMessage(null);
    setStatusNotice(null);
    setRestoredReferenceUrls([]);
    setRestoredPrompt(null);
    setSelectedVersionId(null);
    setProgressStep("analyzing");

    try {
      const requestBody = buildRingCadStartBody({
        referenceImages: await buildReferenceInputs(referenceImages),
        userDescription: prompt,
        tier,
        jewelryType,
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

      // Fired only once a workflow_id exists, so a start that never reached
      // the backend counts as a failure rather than inflating the top of the
      // funnel and depressing the conversion rate.
      startedFirstEverRef.current = consumeFirstCadGeneration();
      const cadAnalytics = {
        ...buildCadGenerationProps({ cadRoute, prompt, referenceImageCount: referenceImages.length, tier }),
        is_first_ever: startedFirstEverRef.current,
        operation: 'generate' as const,
      };
      trackCadGenerationStarted({ ...cadAnalytics, workflow_id });

      // Hand the run to GenerationsContext, which polls above the routes. That
      // is what lets the user press Keep Creating and leave: this hook's own
      // poll below only drives the on-page overlay while they stay.
      trackCadGeneration({
        workflowId: workflow_id,
        label: prompt.trim() ? prompt.trim().slice(0, 40) : 'Image to CAD',
        cadRoute,
        // The same bundle the started event just reported, handed over so the
        // completion event can be emitted by the context when the run settles.
        // The two ends of the funnel therefore describe the run identically,
        // and completion no longer depends on this page still being mounted.
        analytics: cadAnalytics,
      });

      // Polling is now GenerationsContext's job. The effect below mirrors that
      // run's state into this hook so the on-page overlay still updates while
      // the user stays, without a second poll hitting the same endpoints.
      generationStartRef.current = cadGenStartTime;

    } catch (err) {
      console.error("ImageToCAD generation failed:", err);
      // Stage 'start': the run never got a workflow_id, so nothing was charged
      // and nothing is polling. Usually a bad payload or the workflow not
      // being active on this environment.
      trackCadGenerationFailed({
        source: cadSource,
        failure_stage: 'start',
        duration_ms: Date.now() - cadGenStartTime,
        has_failure_message: err instanceof Error && !!err.message,
      });
      // Surface the real reason. A start failure (bad payload, workflow not
      // active on this environment) is actionable, and hiding it behind the
      // generic message means the user only sees it with DevTools open.
      setFailureMessage(err instanceof Error && err.message ? err.message : null);
      setIsGenerating(false);
      setProgressStep("failed_final");
      setGenerationFailed(true);
    }
  }, [prompt, referenceImages, tier, jewelryType, cadRoute, cadSource, isGenerating, onWorkspaceActivate, trackCadGeneration, checkCredits]);

  const resetWorkflow = useCallback(() => {
    hasNavigatedAway.current = false;
    setHasModel(false);
    setRetryAttempt(0);
    setProgressStep("");
    setSourceWorkflowId(null);
    setRing(null);
    setImproveMessage(null);
    setRestoredReferenceUrls([]);
    setRestoredPrompt(null);
    setSelectedVersionId(null);
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    setGlbUrl(undefined);
  }, [glbUrl]);

  /**
   * Stable callback for CADCanvas' onModelReady handler.
   *
   * Returning this as a new inline function on every render changes
   * ImageToCAD's handleModelReady identity. CADCanvas treats that callback as
   * part of its model-ready effect, so the identity churn re-runs the effect,
   * updates state again and can continuously restart viewport work. Besides
   * React's maximum-update-depth warning, that presents as a fluttering model
   * and repeatedly interrupts camera motion.
   */
  const consumeGeneratedToast = useCallback(() => {
    const owed = awaitingGeneratedToastRef.current;
    awaitingGeneratedToastRef.current = false;
    return owed;
  }, []);

  return {
    isGenerating, hasModel, setHasModel,
    isModelLoading, setIsModelLoading,
    progressStep, setProgressStep,
    retryAttempt,
    generationFailed, setGenerationFailed,
    glbUrl, setGlbUrl, glbArtifact, setGlbArtifact,
    sourceWorkflowId, setSourceWorkflowId,
    threedmArtifact, setThreedmArtifact,
    failureMessage, notAllSolid,
    statusNotice,
    dismissStatusNotice: () => {
      setStatusNotice(null);
      setGenerationFailed(false);
      setProgressStep('');
    },
    /**
     * What the Improve button is named after, e.g. "V2". Built from the
     * version's position: the backend's own `label` is the improve verdict
     * ("Looks better"), which is a different thing and belongs on the version
     * list, not on the button.
     */
    latestVersionLabel: activeVersion ? versionLabel(activeVersion) : undefined,
    /** False grays the Improve button out: only improvable === true may be pressed. */
    canImproveLatestVersion: canImproveVersion(activeVersion),
    /** Every saved version of this ring, oldest first, for the side panel. */
    versions,
    selectedVersionId: activeVersion?.asset_id ?? null,
    selectVersion,
    improveFromLatestVersion,
    improveMessage,
    restoredReferenceUrls,
    restoredPrompt,
    /** True once, for the model that a run started here has just produced. */
    consumeGeneratedToast,
    simulateGeneration,
    restoreCompletedWorkflow,
    handleKeepCreating,
    resetWorkflow,
  };
}
