import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useCredits } from "@/contexts/CreditsContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelRightClose, PanelLeft, PanelRight, X } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { performCreditPreflight, type PreflightResult } from "@/lib/credit-preflight";
import { TOOL_COSTS } from "@/lib/credits-api";
import { AuthExpiredError } from "@/lib/authenticated-fetch";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { pollWorkflow, type PollWorkflowResult } from "@/lib/poll-workflow";
import {
  resolveCadTerminalNode,
  resolveCadProgressNode,
  parseCadResult,
  type CadGenerationResult,
} from "@/lib/cad-poll-resolvers";
import {
  CAD_EDIT_WORKFLOW,
  CAD_GENERATION_WORKFLOW,
  buildCadEditStartBody,
  buildCadGenerationStartBody,
} from "@/lib/cad-workflows";
import { resolveCadGenerationTier } from "@/lib/cad-tier";
import { trackPaywallHit, trackCadGenerationCompleted } from '@/lib/posthog-events';
import { InsufficientCreditsInline } from "@/components/InsufficientCreditsInline";

import InitialPromptScreen from "@/components/text-to-cad/InitialPromptScreen";
import LeftPanel from "@/components/text-to-cad/LeftPanel";
import { useAuth } from "@/contexts/AuthContext";
import { isWeightStlEnabled, isCadUploadEnabled } from "@/lib/feature-flags";

import MeshPanel from "@/components/text-to-cad/MeshPanel";
import CADCanvas from "@/components/text-to-cad/CADCanvas";
import type { CADCanvasHandle, CanvasSnapshot, MeshTransformData } from "@/components/text-to-cad/CADCanvas";
import CADRuntimeErrorBoundary from "@/components/cad/CADRuntimeErrorBoundary";
import ViewportDisplayMenu from "@/components/text-to-cad/ViewportDisplayMenu";
import KeyboardShortcutsPanel from "@/components/text-to-cad/KeyboardShortcutsPanel";
import GenerationProgress from "@/components/text-to-cad/GenerationProgress";
import { useCADKeyboardShortcuts } from "@/hooks/use-cad-keyboard-shortcuts";
import {
  ViewportToolbar,
  StatsBar,
  ViewportSideTools,
} from "@/components/text-to-cad/ViewportOverlays";
import GemToggle from "@/components/text-to-cad/QualityToggle";
import { runMicroBenchmark } from "@/lib/gpu-detect";
import type { GemMode } from "@/components/text-to-cad/CADCanvas";

import type { MeshItemData, StatsData } from "@/components/text-to-cad/types";

// Full undo entry captures both UI mesh list AND 3D canvas state
interface UndoEntry {
  label: string;
  meshes: MeshItemData[];
  canvasSnapshot: CanvasSnapshot | null;
}

export default function TextToCAD() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshCredits } = useCredits();
  const { user } = useAuth();
  const showWeightStl = isWeightStlEnabled(user?.email);
  const showCadUpload = isCadUploadEnabled(user?.email);
  
  const [model, setModel] = useState("gemini");
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [transformMode, setTransformMode] = useState("orbit");
  const [meshes, setMeshes] = useState<MeshItemData[]>([]);
  const [stats, setStats] = useState<StatsData>({ meshes: 0, sizeKB: 0, timeSec: 0 });
  const [glbUrl, setGlbUrl] = useState<string | undefined>(undefined);
  const [glbArtifact, setGlbArtifact] = useState<{ uri: string; type: string; bytes: number; sha256: string } | null>(null);
  const [sourceWorkflowId, setSourceWorkflowId] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const wasManualUploadRef = useRef(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [creditBlock, setCreditBlock] = useState<PreflightResult | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [selectedTransform, setSelectedTransform] = useState<MeshTransformData | null>(null);
  const [magicTexturing, setMagicTexturing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gemMode, setGemMode] = useState<GemMode>("simple");
  const [weightResult, setWeightResult] = useState<{
    weight_14k_gold_g: number;
    weight_platinum_g: number;
    scale_warning: boolean;
  } | null>(null);
  const [weightLoading, setWeightLoading] = useState(false);
  const [stlExporting, setStlExporting] = useState(false);
  const [stlPresetOpen, setStlPresetOpen] = useState(false);
  const [stlQuality, setStlQuality] = useState<'draft' | 'standard' | 'high'>('standard');

  // Run invisible micro-benchmark on mount (offscreen, ~200ms)
  useEffect(() => { runMicroBenchmark(); }, []);

  // Track whether user has ever started a generation or uploaded — drives the phase transition
  const [workspaceActive, setWorkspaceActive] = useState(false);

  const canvasRef = useRef<CADCanvasHandle>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const meshesRef = useRef<MeshItemData[]>(meshes);
  const wireframeRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  // Track browser fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Expand right panel when model is loaded, collapse when no model
  useEffect(() => {
    if (hasModel) {
      rightPanelRef.current?.expand(22);
    } else {
      rightPanelRef.current?.collapse();
    }
  }, [hasModel]);

  // Boot directly into the workspace when ?glb= param is present (e.g. from Generations page)
  useEffect(() => {
    const glbParam = searchParams.get('glb');
    if (!glbParam) return;
    const workflowIdParam = searchParams.get('workflow_id');
    setWorkspaceActive(true);
    setHasModel(true);
    setIsModelLoading(true);
    setProgressStep("_loading");
    setGlbUrl(glbParam);
    setSourceWorkflowId(workflowIdParam?.trim() || null);
    // Synthesise an artifact so weight/STL tools work on history-loaded models.
    // Only the uri field is used by the backend to fetch the file; type/bytes/sha256
    // are metadata that we don't have here but won't block the API calls.
    setGlbArtifact({ uri: glbParam, type: 'model/gltf-binary', bytes: 0, sha256: '' });
    // Clean the param from the URL without triggering a re-render loop
    navigate('/text-to-cad', { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  meshesRef.current = meshes;

  const selectedMeshNames = useMemo(
    () => new Set(meshes.filter((m) => m.selected).map((m) => m.name)),
    [meshes]
  );

  const hiddenMeshNames = useMemo(
    () => new Set(meshes.filter((m) => !m.visible).map((m) => m.name)),
    [meshes]
  );

  const selectedNames = useMemo(
    () => meshes.filter((m) => m.selected).map((m) => m.name),
    [meshes]
  );

  // Push a pre-captured state onto undo stack (state BEFORE the action)
  const pushUndoEntry = useCallback((label: string, entry: UndoEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]); // Clear redo on new action
  }, []);

  // Convenience: capture current state and push it (for actions where we call BEFORE the mutation)
  const pushUndo = useCallback((label: string) => {
    const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
    const snap = canvasRef.current?.getSnapshot() ?? null;
    pushUndoEntry(label, { label, meshes: currentMeshes, canvasSnapshot: snap });
  }, [pushUndoEntry]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      setRedoStack((r) => [...r, { label: last.label, meshes: currentMeshes, canvasSnapshot: snap }]);
      setMeshes(last.meshes);
      if (last.canvasSnapshot) {
        canvasRef.current?.restoreSnapshot(last.canvasSnapshot);
      }
      // silent undo
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      setUndoStack((u) => [...u, { label: last.label, meshes: currentMeshes, canvasSnapshot: snap }]);
      setMeshes(last.meshes);
      if (last.canvasSnapshot) {
        canvasRef.current?.restoreSnapshot(last.canvasSnapshot);
      }
      // silent redo
      return prev.slice(0, -1);
    });
  }, []);

  // ── Gizmo transform: capture BEFORE drag starts, push on drag end ──
  const preTransformSnapshotRef = useRef<UndoEntry | null>(null);

  const handleTransformStart = useCallback(() => {
    // Capture the state BEFORE the gizmo drag modifies anything
    const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
    const snap = canvasRef.current?.getSnapshot() ?? null;
    preTransformSnapshotRef.current = { label: `Transform (${transformMode})`, meshes: currentMeshes, canvasSnapshot: snap };
  }, [transformMode]);

  const handleTransformEnd = useCallback(() => {
    // Push the PRE-transform snapshot so undo restores to before the drag
    if (preTransformSnapshotRef.current) {
      pushUndoEntry(preTransformSnapshotRef.current.label, preTransformSnapshotRef.current);
      preTransformSnapshotRef.current = null;
    }
    // Sync numeric fields after gizmo drag
    setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
  }, [pushUndoEntry]);

  // Refresh transform data whenever selection changes
  useEffect(() => {
    setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
  }, [selectedMeshNames]);

  // ── Numeric transform: capture on first change, debounce commit ──
  const numericUndoRef = useRef<{ snapshot: UndoEntry; timer: ReturnType<typeof setTimeout> } | null>(null);

  const handleNumericTransformChange = useCallback((axis: 'x' | 'y' | 'z', property: 'position' | 'rotation' | 'scale', value: number) => {
    // Capture snapshot on first numeric change in a sequence
    if (!numericUndoRef.current) {
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      const label = `Numeric ${property}`;
      numericUndoRef.current = {
        snapshot: { label, meshes: currentMeshes, canvasSnapshot: snap },
        timer: setTimeout(() => {
          // Commit after 800ms idle
          if (numericUndoRef.current) {
            pushUndoEntry(numericUndoRef.current.snapshot.label, numericUndoRef.current.snapshot);
            numericUndoRef.current = null;
          }
        }, 800),
      };
    } else {
      // Reset the debounce timer on continued input
      clearTimeout(numericUndoRef.current.timer);
      numericUndoRef.current.timer = setTimeout(() => {
        if (numericUndoRef.current) {
          pushUndoEntry(numericUndoRef.current.snapshot.label, numericUndoRef.current.snapshot);
          numericUndoRef.current = null;
        }
      }, 800);
    }

    canvasRef.current?.setMeshTransform(axis, property, value);
    // Read back the updated transform for UI sync
    requestAnimationFrame(() => {
      setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
    });
  }, [pushUndoEntry]);

  // Called when CADCanvas has fully parsed, textured, and rendered the model
  const handleModelReady = useCallback(() => {
    setIsModelLoading(false);
    if (wasManualUploadRef.current) {
      toast.success("File uploaded");
      wasManualUploadRef.current = false;
    } else {
      toast.success("Ring generated successfully");
    }
  }, []);

  const simulateGeneration = useCallback(async () => {
    if (isGenerating) return;
    if (!prompt.trim()) { toast.error("Please describe your ring first"); return; }

    const trimmed = prompt.trim().toLowerCase();
    const isDemo = trimmed === 'demo' || trimmed === 'test';

    // ── Demo mode: load local placeholder model, no backend calls ──
    if (isDemo) {
      setWorkspaceActive(true);
      setIsGenerating(true);
      setHasModel(false);
      setProgressStep("generate_initial");

      // Simulate realistic progress (~35s total to match real generation feel)
      const steps = [
        { label: "generate_initial", ms: 6000 },
        { label: "build_initial",    ms: 8000 },
        { label: "validate_output",  ms: 5000 },
        { label: "generate_fix",     ms: 4000 },
        { label: "build_retry",      ms: 6000 },
        { label: "build_corrected",  ms: 4000 },
      ];
      for (const step of steps) {
        await new Promise((r) => setTimeout(r, step.ms));
        setProgressStep(step.label);
      }

      setGlbUrl("/models/ring.glb");
      setSourceWorkflowId(null);
      setIsModelLoading(true);
      setIsGenerating(false);
      setHasModel(true);
      toast.success("Demo model loaded — no credits used");
      return;
    }

    // ── Real generation ──
    const modelKey = `${CAD_GENERATION_WORKFLOW}:${model}`;
    const requiredCredits = TOOL_COSTS[modelKey] ?? TOOL_COSTS.cad_generation ?? 5;
    try {
      const tier = resolveCadGenerationTier(model);
      const result = await performCreditPreflight(CAD_GENERATION_WORKFLOW, 1, {
        model,
        pricingContext: { tier },
      });
      const balance = result.currentBalance;
      const cost = result.estimatedCredits > 0 ? result.estimatedCredits : requiredCredits;
      if (balance < cost) {
        setCreditBlock({ approved: false, estimatedCredits: cost, currentBalance: balance });
        trackPaywallHit({ category: 'ring', steps_completed: 1 });
        return;
      }
      setCreditBlock(null);
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error('[CAD Preflight] failed, skipping block:', err);
      setCreditBlock(null);
    }

    const cadGenStartTime = Date.now(); // for cad_generation_completed duration_ms
    setWorkspaceActive(true);
    setIsGenerating(true);
    setGenerationFailed(false);
    setRetryAttempt(0);
    setHasModel(false);
    setSourceWorkflowId(null);
    setProgressStep("generate_initial");

    try {
      // Step 1: Start generation
      const startRes = await authenticatedFetch(`/api/run/${CAD_GENERATION_WORKFLOW}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCadGenerationStartBody(prompt, model)),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `Failed to start generation (${startRes.status})`);
      }

      const { workflow_id } = await startRes.json();
      if (!workflow_id) throw new Error("No workflow_id returned");

      console.log("[TextToCAD] Workflow started:", workflow_id);

      // Step 2 + 3: Poll status then fetch result
      pollAbortRef.current?.abort();
      const pollAbort = new AbortController();
      pollAbortRef.current = pollAbort;

      let genPollResult: PollWorkflowResult<CadGenerationResult>;
      try {
        genPollResult = await pollWorkflow<CadGenerationResult>({
          mode: 'status-then-result',
          fetchStatus: () => authenticatedFetch(
            `/api/status/${encodeURIComponent(workflow_id)}`,
            { signal: pollAbort.signal }
          ),
          fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
          resolveState: (statusData) => {
            const s = statusData as { runtime?: { state?: string }; progress?: { state?: string }; state?: string };
            const state = (s.runtime?.state || s.progress?.state || s.state || 'unknown').toLowerCase();
            return (state === 'failed' || state === 'budget_exhausted' || state === 'terminated' || state === 'cancelled' || state === 'timed_out' || state === 'timeout') ? 'completed' : state;
          },
          resolveProgressNode: resolveCadProgressNode,
          parseResult: (d) => parseCadResult(d, 'generation'),
          onProgress: ({ node, retryCount }) => {
            setProgressStep(node);
            if (retryCount > 0) setRetryAttempt(retryCount);
          },
          onStatusData: (statusData) => {
            const s = statusData as { runtime?: { state?: string } };
            const state = (s.runtime?.state || "").toLowerCase();
            if (state === "failed" || state === "budget_exhausted") {
              setProgressStep("failed_final");
            }
          },
          intervalMs: 2000,
          timeoutMs: 60 * 60 * 1000,
          max404s: 13,         // preserves effective tolerance (~3 trigger + 10 inner-catch absorptions)
          maxPollErrors: 10,
          maxResultRetries: 1,
          signal: pollAbort.signal,
        });
      } catch (err) {
        if (err instanceof AuthExpiredError) return; // redirect already in progress
        throw err;
      }

      if (genPollResult.status === 'cancelled') return;

      setProgressStep("_loading");
      const { glb_url, artifact: genArtifact } = genPollResult.result;
      setGlbArtifact(genArtifact);
      console.log('[TextToCAD] Generation result artifact:', genArtifact);

      setGlbUrl(glb_url);
      trackCadGenerationCompleted({
        category: 'ring', // hardcoded — CAD only supports rings currently; update when more categories added
        prompt_length: prompt.trim().length,
        duration_ms: Date.now() - cadGenStartTime,
      });
      setProgressStep("_loading");
      setIsModelLoading(true);
      setIsGenerating(false);
      refreshCredits().catch(() => {});
      setHasModel(true);
      setSourceWorkflowId(workflow_id);

    } catch (err) {
      console.error("Generation failed:", err);
      setIsGenerating(false);
      setProgressStep("");
      setGenerationFailed(true);
    }
  }, [prompt, model, isGenerating]);

  const runEditWithPrompt = useCallback(async (promptText: string, label: string) => {
    if (!promptText.trim()) { toast.error("Please describe the edit"); return; }
    if (isGenerating || isEditing) return;
    if (!sourceWorkflowId) {
      toast.error("Generate a ring before editing");
      return;
    }

    // Credit preflight
    const modelKey = `${CAD_EDIT_WORKFLOW}:${model}`;
    const requiredCredits = TOOL_COSTS[modelKey] ?? TOOL_COSTS[CAD_EDIT_WORKFLOW] ?? 5;
    try {
      const result = await performCreditPreflight(CAD_EDIT_WORKFLOW, 1, { model });
      const balance = result.currentBalance;
      const cost = result.estimatedCredits > 0 ? result.estimatedCredits : requiredCredits;
      if (balance < cost) {
        setCreditBlock({ approved: false, estimatedCredits: cost, currentBalance: balance });
        return;
      }
      setCreditBlock(null);
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error('[CAD Edit Preflight] failed, skipping block:', err);
      setCreditBlock(null);
    }

    pushUndo(label);
    setIsEditing(true);
    setIsGenerating(true);
    setRetryAttempt(0);
    setProgressStep("generate_initial");

    try {
      // Step 1: Start edit workflow
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
      console.log(`[TextToCAD] Edit "${label}" workflow started:`, workflow_id);

      // Step 2 + 3: Poll status then fetch result
      pollAbortRef.current?.abort();
      const pollAbort = new AbortController();
      pollAbortRef.current = pollAbort;

      let editPollResult: PollWorkflowResult<CadGenerationResult>;
      try {
        editPollResult = await pollWorkflow<CadGenerationResult>({
          mode: 'status-then-result',
          fetchStatus: () => authenticatedFetch(
            `/api/status/${encodeURIComponent(workflow_id)}`,
            { signal: pollAbort.signal }
          ),
          fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
          resolveState: (statusData) => {
            const s = statusData as { runtime?: { state?: string }; progress?: { state?: string }; state?: string };
            const state = (s.runtime?.state || s.progress?.state || s.state || 'unknown').toLowerCase();
            return (state === 'failed' || state === 'budget_exhausted' || state === 'terminated' || state === 'cancelled' || state === 'timed_out' || state === 'timeout') ? 'completed' : state;
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
            if (state === "failed" || state === "budget_exhausted") {
              setProgressStep("failed_final");
            }
          },
          intervalMs: 2000,
          timeoutMs: 60 * 60 * 1000,
          max404s: 13,         // preserves effective tolerance (~3 trigger + 10 inner-catch absorptions)
          maxPollErrors: 10,
          maxResultRetries: 1,
          signal: pollAbort.signal,
        });
      } catch (err) {
        if (err instanceof AuthExpiredError) return; // redirect already in progress
        throw err;
      }

      if (editPollResult.status === 'cancelled') return;

      setProgressStep("_loading");
      const { glb_url, artifact: editArtifact } = editPollResult.result;
      setGlbArtifact(editArtifact);
      console.log('[TextToCAD] Edit result artifact:', editArtifact);

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
  }, [model, isGenerating, isEditing, sourceWorkflowId, pushUndo]);

  const simulateEdit = useCallback(async () => {
    await runEditWithPrompt(editPrompt, "AI edit");
    setEditPrompt("");
  }, [editPrompt, runEditWithPrompt]);

  const handleRebuildPart = useCallback((partId: string, description: string) => {
    runEditWithPrompt(`Rebuild ${partId}: ${description}`, `Rebuild ${partId}`);
  }, [runEditWithPrompt]);

  const handleAddPart = useCallback((description: string) => {
    runEditWithPrompt(`Add new part: ${description}`, "Add part");
  }, [runEditWithPrompt]);

  const [additionalParts, setAdditionalParts] = useState<string[]>([]);

  const handleGlbUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    wasManualUploadRef.current = true;

    if (!workspaceActive) setWorkspaceActive(true);

    // Check if scene actually has meshes — after Ctrl+A + Delete, hasModel may be true
    // but the scene is empty, so we should treat it as a fresh upload.
    const sceneHasMeshes = meshesRef.current.length > 0;

    if (hasModel && glbUrl && sceneHasMeshes) {
      // Model already exists with visible meshes — add as an additional part (merge into scene)
      setAdditionalParts((prev) => [...prev, url]);
      setStats((prev) => ({ ...prev, sizeKB: prev.sizeKB + Math.round(file.size / 1024) }));
    } else {
      // No model yet OR scene was cleared — set as the primary model
      if (glbUrl?.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
      additionalParts.forEach((u) => URL.revokeObjectURL(u));
      setAdditionalParts([]);
      setIsModelLoading(true);
      setProgressStep("_loading");
      setGlbUrl(url);
      setSourceWorkflowId(null);
      setHasModel(true);
      setMeshes([]);
      setStats({ meshes: 0, sizeKB: Math.round(file.size / 1024), timeSec: 0 });
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [glbUrl, additionalParts, workspaceActive, hasModel]);

  // Track names of recently duplicated meshes so they get auto-selected
  const pendingSelectRef = useRef<Set<string> | null>(null);

  const handleMeshesDetected = useCallback((detected: { name: string; verts: number; faces: number }[]) => {
    setMeshes((prev) => {
      // Preserve existing visibility/selection state for known meshes
      const prevMap = new Map(prev.map(m => [m.name, m]));
      const pendingSelect = pendingSelectRef.current;
      return detected.map((d) => {
        const existing = prevMap.get(d.name);
        return {
          ...d,
          visible: existing?.visible ?? true,
          selected: existing?.selected ?? (pendingSelect?.has(d.name) ?? false),
        };
      });
    });
    pendingSelectRef.current = null;
    setStats((prev) => ({ ...prev, meshes: detected.length }));
  }, []);

  const handleReset = () => {
    // Keep prompt populated for quick iteration; clear everything else
    setEditPrompt("");
    setHasModel(false);
    setRetryAttempt(0);
    setProgressStep("");
    setMeshes([]);
    setSourceWorkflowId(null);
    setUndoStack([]);
    setRedoStack([]);
    // Stay in workspace — do NOT reset workspaceActive
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    additionalParts.forEach((u) => URL.revokeObjectURL(u));
    setAdditionalParts([]);
    setGlbUrl(undefined);
  };

  const handleDownloadGlb = useCallback(async () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const defaultName = `model-${timestamp}.glb`;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: defaultName, file_type: 'glb', context: 'text-to-cad' }));

    // Helper: trigger download via anchor element (universal fallback)
    const anchorDownload = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a short delay so the download can start
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    try {
      // Download is always user-initiated, so React state is guaranteed to be
      // committed by the time the click handler fires — no need to defer.
      let blob: Blob;
      if (canvasRef.current) {
        blob = await canvasRef.current.exportSceneBlob();
      } else if (glbUrl) {
        // Fallback: download original if canvas not available
        const response = await fetch(glbUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      } else {
        toast.error("No model to download");
        return;
      }

      if (!blob || blob.size === 0) {
        toast.error("Export produced an empty file");
        return;
      }

      // Try native Save-As dialog, fall back to anchor download on any failure
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: 'GLB 3D Model',
              accept: { 'model/gltf-binary': ['.glb'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (e: any) {
          // User cancelled — not an error
          if (e?.name === 'AbortError') return;
          // Any other File System Access error → fall back to anchor download
          console.warn('[Download] showSaveFilePicker failed, using fallback:', e);
          anchorDownload(blob);
        }
      } else {
        anchorDownload(blob);
      }
    } catch (err) {
      console.error('[Download] Failed to export/download model:', err);
      toast.error("Failed to download model");
    }
  }, [glbUrl]);

  const handleEstimateWeight = useCallback(async () => {
    console.log('[Weight] glbArtifact state:', glbArtifact);
    if (!glbArtifact) {
      toast.error("No model artifact available — generate a model first");
      return;
    }
    setWeightLoading(true);
    try {
      const weightPayload = {
        payload: { glb_artifact: glbArtifact, timeout_seconds: 60 },
      };
      console.log('[Weight] Request payload:', weightPayload);
      // estimate_weight is intentionally free after a generated/imported GLB exists; no credit preflight.
      const startRes = await authenticatedFetch('/api/run/state/estimate_weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weightPayload),
      });
      const weightStartBody = await startRes.json().catch(() => ({}));
      console.log('[Weight] Start response:', weightStartBody);
      if (!startRes.ok) {
        toast.error(weightStartBody?.error || "Failed to start weight estimation");
        return;
      }
      const { workflow_id } = weightStartBody;

      // Poll until done (2s interval, ~2 min timeout)
      const pollResult = await pollWorkflow({
        mode: 'result-direct',
        fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
        parseResult: (d) => d as { success: boolean; error?: string; scale_warning?: boolean; weight_14k_gold_g?: number; weight_platinum_g?: number },
        intervalMs: 2000,
        timeoutMs: 120_000,
      });

      if (pollResult.status === 'cancelled') return; // unreachable: no signal passed

      const result = pollResult.result;
      console.log('[Weight] Poll result:', result);
      if (!result.success) {
        toast.error(result.error || "Weight estimation failed");
        return;
      }
      if (result.scale_warning) {
        toast.warning("Weight estimate may be inaccurate — geometry scale looks unusual");
      }
      setWeightResult({
        weight_14k_gold_g: result.weight_14k_gold_g,
        weight_platinum_g: result.weight_platinum_g,
        scale_warning: result.scale_warning,
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('timed out');
      toast.error(isTimeout ? "Weight estimation timed out — try again" : "Weight estimation failed");
      console.error('[Weight]', err);
    } finally {
      setWeightLoading(false);
    }
  }, [glbArtifact]);

  const handleDownloadStl = useCallback(() => {
    setStlPresetOpen(true);
  }, []);

  const executeStlDownload = useCallback(async () => {
    setStlPresetOpen(false);
    if (!glbArtifact) {
      toast.error("No model artifact available — generate a model first");
      return;
    }
    const voxelSizeMm = stlQuality === 'draft' ? 0.1 : stlQuality === 'high' ? 0.03 : 0.05;
    setStlExporting(true);
    try {
      const stlPayload = {
        payload: {
          glb_artifact: glbArtifact,
          voxel_size_mm: voxelSizeMm,
          island_min_fraction: 0.005,
          decimate_ratio: 0.3,
          timeout_seconds: 300,
        },
      };
      console.log('[STL] Request payload:', stlPayload);
      // prepare_stl is intentionally free after a generated/imported GLB exists; no credit preflight.
      const startRes = await authenticatedFetch('/api/run/state/prepare_stl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stlPayload),
      });
      const stlStartBody = await startRes.json().catch(() => ({}));
      console.log('[STL] Start response:', stlStartBody);
      if (!startRes.ok) {
        toast.error(stlStartBody?.error || "Failed to start STL export");
        return;
      }
      const { workflow_id } = stlStartBody;

      // Poll until done (2s interval, ~5 min timeout for high quality)
      const pollResult = await pollWorkflow({
        mode: 'result-direct',
        fetchResult: () => authenticatedFetch(`/api/result/${encodeURIComponent(workflow_id)}`),
        parseResult: (d) => d as { success: boolean; error_text?: string; stl_artifact?: { uri: string } },
        intervalMs: 2000,
        timeoutMs: 300_000,
      });

      if (pollResult.status === 'cancelled') return; // unreachable: no signal passed

      const result = pollResult.result;
      console.log('[STL] Poll result:', result);
      if (!result.success || !result.stl_artifact) {
        toast.error(result.error_text || "STL export failed");
        return;
      }

      // stl_artifact.uri is a signed Azure Blob URL ready to use directly
      const downloadUrl = result.stl_artifact.uri;
      const timestamp = Date.now();

      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: `model-${timestamp}.stl`,
          types: [{ description: 'STL 3D Print File', accept: { 'model/stl': ['.stl'] } }],
        });
        const writable = await fileHandle.createWritable();
        const stlResponse = await fetch(downloadUrl);
        await writable.write(await stlResponse.blob());
        await writable.close();
      } catch (pickerErr: any) {
        if (pickerErr?.name !== 'AbortError') {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `model-${timestamp}.stl`;
          a.click();
        }
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('timed out');
      toast.error(isTimeout ? "STL preparation timed out — try Standard quality or a simpler model" : "STL export failed");
      console.error('[STL Export]', err);
    } finally {
      setStlExporting(false);
    }
  }, [stlQuality, glbArtifact]);

  const handleSelectMesh = (name: string, multi: boolean) => {
    if (!name) {
      setMeshes((prev) => prev.map((m) => ({ ...m, selected: false })));
      return;
    }
    setMeshes((prev) =>
      prev.map((m) =>
        m.name === name
          ? { ...m, selected: multi ? !m.selected : true }
          : multi ? m : { ...m, selected: false }
      )
    );
  };

  const handleMeshAction = (action: string) => {
    // Track visibility changes for undo (skip selection-only changes)
    const isVisibilityAction = ["hide", "show", "show-all", "isolate"].includes(action);
    if (isVisibilityAction) pushUndo(`Visibility: ${action}`);

    setMeshes((prev) => {
      switch (action) {
        case "hide": return prev.map((m) => m.selected ? { ...m, visible: false } : m);
        case "show": return prev.map((m) => m.selected ? { ...m, visible: true } : m);
        case "show-all": return prev.map((m) => ({ ...m, visible: true }));
        case "isolate": return prev.map((m) => ({ ...m, visible: m.selected }));
        case "select-all": return prev.map((m) => ({ ...m, selected: true }));
        case "select-none": return prev.map((m) => ({ ...m, selected: false }));
        case "select-invert": return prev.map((m) => ({ ...m, selected: !m.selected }));
        default: return prev;
      }
    });
  };

  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const selectionWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSelectionWarning = useCallback((msg: string) => {
    setSelectionWarning(msg);
    if (selectionWarningTimer.current) clearTimeout(selectionWarningTimer.current);
    selectionWarningTimer.current = setTimeout(() => setSelectionWarning(null), 3000);
  }, []);

  const handleApplyMaterial = useCallback((matId: string) => {
    if (selectedNames.length === 0) {
      showSelectionWarning("Select meshes first, then apply a material");
      return;
    }
    pushUndo("Apply material");
    canvasRef.current?.applyMaterial(matId, selectedNames);
  }, [selectedNames, pushUndo, showSelectionWarning]);

  const handleSceneAction = useCallback((action: string) => {
    const names = selectedNames;
    switch (action) {
      case "set-mode-translate": setTransformMode("translate"); break;
      case "set-mode-rotate": setTransformMode("rotate"); break;
      case "set-mode-scale": setTransformMode("scale"); break;
      case "reset-transform":
        pushUndo("Reset transform");
        canvasRef.current?.resetTransform(names.length ? names : meshes.map((m) => m.name));
        break;
      case "apply-transform":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Apply transform");
        canvasRef.current?.applyTransform(names);
        break;
      case "delete":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Delete meshes");
        canvasRef.current?.deleteMeshes(names);
        setMeshes((prev) => prev.filter((m) => !names.includes(m.name)));
        break;
      case "duplicate":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Duplicate meshes");
        // Pre-compute expected duplicate names so they auto-select after onMeshesDetected fires
        const existingNames = new Set(meshesRef.current.map(m => m.name));
        const dupNames = new Set<string>();
        names.forEach(n => {
          let finalName = `${n}_copy`;
          let suffix = 2;
          while (existingNames.has(finalName) || dupNames.has(finalName)) {
            finalName = `${n}_copy_${suffix++}`;
          }
          dupNames.add(finalName);
        });
        pendingSelectRef.current = dupNames;
        canvasRef.current?.duplicateMeshes(names);
        break;
      case "flip-normals":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Flip normals");
        canvasRef.current?.flipNormals(names);
        break;
      case "center-origin":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Center origin");
        canvasRef.current?.centerOrigin(names);
        break;
      case "recalc-normals":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Recalculate normals");
        break;
      case "wireframe-on":
        canvasRef.current?.setWireframe(true);
        break;
      case "wireframe-off":
        canvasRef.current?.setWireframe(false);
        break;
      case "mirror-x":
      case "mirror-y":
      case "mirror-z":
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo(`Mirror ${action.split("-")[1].toUpperCase()}`);
        break;
      default:
        break;
    }
  }, [selectedNames, meshes, pushUndo, showSelectionWarning]);

  // Centralized keyboard shortcuts (window-level listener)
  const toggleWireframe = useCallback(() => {
    wireframeRef.current = !wireframeRef.current;
    canvasRef.current?.setWireframe(wireframeRef.current);
  }, []);

  // Clipboard for copy/paste/cut
  const clipboardRef = useRef<string[]>([]);

  const handleCopy = useCallback(() => {
    const names = meshesRef.current.filter(m => m.selected).map(m => m.name);
    if (names.length === 0) return;
    clipboardRef.current = names;
  }, []);

  const handlePaste = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    pushUndo("Paste meshes");
    canvasRef.current?.duplicateMeshes(clipboardRef.current);
  }, [pushUndo]);

  const handleCut = useCallback(() => {
    const names = meshesRef.current.filter(m => m.selected).map(m => m.name);
    if (names.length === 0) return;
    clipboardRef.current = names;
    pushUndo("Cut meshes");
    canvasRef.current?.deleteMeshes(names);
    setMeshes((prev) => prev.filter((m) => !names.includes(m.name)));
  }, [pushUndo]);

  useCADKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDelete: () => handleSceneAction("delete"),
    onDuplicate: () => handleSceneAction("duplicate"),
    onSelectAll: () => setMeshes((prev) => prev.map((m) => ({ ...m, selected: true }))),
    onDeselectAll: () => setMeshes((prev) => prev.map((m) => ({ ...m, selected: false }))),
    onSetTransformMode: setTransformMode,
    onToggleWireframe: toggleWireframe,
    onToggleShortcutsPanel: () => setShortcutsOpen((p) => !p),
    onCopy: handleCopy,
    onPaste: handlePaste,
    onCut: handleCut,
    onResetTransform: () => handleSceneAction("reset-transform"),
    enabled: workspaceActive,
  });

  // ── Phase 1: Initial prompt screen ──
  if (!workspaceActive) {
    return (
      <div className="h-[calc(100vh-5rem)] flex bg-background" tabIndex={0}>
        <InitialPromptScreen
          model={model}
          setModel={setModel}
          prompt={prompt}
          setPrompt={setPrompt}
          isGenerating={isGenerating}
          onGenerate={simulateGeneration}
          onGlbUpload={showCadUpload ? handleGlbUpload : undefined}
          creditBlock={creditBlock ? (
            <InsufficientCreditsInline
              currentBalance={creditBlock.currentBalance}
              requiredCredits={creditBlock.estimatedCredits}
              onDismiss={() => setCreditBlock(null)}
            />
          ) : undefined}
        />
      </div>
    );
  }

  // ── Phase 2: Full workspace with resizable panels ──
  return (
    <div
      className="flex h-[calc(100vh-5rem)] overflow-hidden bg-background"
      tabIndex={-1}
    >
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left panel — always mounted, use imperative collapse/expand */}
        <ResizablePanel
          ref={leftPanelRef}
          id="left-panel"
          order={1}
          defaultSize={22}
          minSize={15}
          maxSize={35}
          collapsible
          collapsedSize={0}
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className="relative"
        >
          {!leftCollapsed && (
            <LeftPanel
              model={model} setModel={setModel}
              prompt={prompt} setPrompt={setPrompt}
              editPrompt={editPrompt} setEditPrompt={setEditPrompt}
              isGenerating={isGenerating} isEditing={isEditing}
              hasModel={hasModel}
              onGenerate={simulateGeneration}
              onEdit={simulateEdit}
              onRebuildPart={handleRebuildPart}
              onAddPart={handleAddPart}
              magicTexturing={magicTexturing}
              onMagicTexturingChange={(on) => {
                setMagicTexturing(on);
                if (on) {
                  canvasRef.current?.applyMagicTextures();
                } else {
                  canvasRef.current?.removeAllTextures();
                }
              }}
              onGlbUpload={handleGlbUpload}
              onReset={hasModel ? handleReset : undefined}
              creditBlock={creditBlock ? (
                <InsufficientCreditsInline
                  currentBalance={creditBlock.currentBalance}
                  requiredCredits={creditBlock.estimatedCredits}
                  onDismiss={() => setCreditBlock(null)}
                />
              ) : undefined}
            />
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Viewport */}
        <ResizablePanel id="viewport-panel" order={2} defaultSize={hasModel ? 56 : 78} minSize={30}>
          <div data-cad-viewport className="relative h-full border-x-2 border-primary/20 shadow-[inset_0_0_30px_-10px_hsl(var(--primary)/0.15)]" style={{ background: "#000000" }}>
            {/* Panel collapse toggles — hidden in fullscreen */}
            {!isFullscreen && (
              <>
                <button
                  onClick={() => {
                    const panel = leftPanelRef.current;
                    if (panel) { leftCollapsed ? panel.expand(22) : panel.collapse(); }
                  }}
                  className="absolute top-2 left-2 z-[60] w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                  title={leftCollapsed ? "Show left panel" : "Hide left panel"}
                >
                  {leftCollapsed ? <PanelLeft className="w-4 h-4 text-foreground/70" /> : <PanelLeftClose className="w-4 h-4 text-foreground/70" />}
                </button>
                {hasModel && (
                  <button
                    onClick={() => {
                      const panel = rightPanelRef.current;
                      if (panel) { rightCollapsed ? panel.expand(22) : panel.collapse(); }
                    }}
                    className="absolute top-2 right-2 z-[60] w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                    title={rightCollapsed ? "Show right panel" : "Hide right panel"}
                  >
                    {rightCollapsed ? <PanelRight className="w-4 h-4 text-foreground/70" /> : <PanelRightClose className="w-4 h-4 text-foreground/70" />}
                  </button>
                )}
              </>
            )}

            <CADRuntimeErrorBoundary resetKeys={[glbUrl, hasModel]}>
              <CADCanvas
                ref={canvasRef}
                hasModel={hasModel}
                glbUrl={glbUrl}
                additionalGlbUrls={additionalParts}
                selectedMeshNames={selectedMeshNames}
                hiddenMeshNames={hiddenMeshNames}
                onMeshClick={handleSelectMesh}
                transformMode={transformMode}
                onMeshesDetected={handleMeshesDetected}
                onTransformStart={handleTransformStart}
                onTransformEnd={handleTransformEnd}
                lightIntensity={1}
                onModelReady={handleModelReady}
                magicTexturing={magicTexturing}
                qualityMode="balanced"
                gemMode={gemMode}
                onGemModeForced={(mode) => setGemMode(mode)}
              />
            </CADRuntimeErrorBoundary>

            {/* Generation failed state */}
            <AnimatePresence>
              {generationFailed && !isGenerating && !hasModel && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 z-[20] flex items-center justify-center"
                >
                  <div className="bg-card border border-border shadow-2xl px-10 py-8 max-w-sm text-center">
                    <div className="font-display text-lg uppercase tracking-[0.15em] text-foreground mb-3">
                      Generation Unavailable
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground leading-[1.8] tracking-wide mb-6">
                      We're really sorry. Something went wrong while generating your design. Our AI generation service may be temporarily unavailable. Please try again in a few minutes.
                    </p>
                    <button
                      onClick={() => setGenerationFailed(false)}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {!hasModel && !isGenerating && !isModelLoading && !generationFailed && (
              <div className="absolute inset-0 z-[10] flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="font-display text-2xl text-muted-foreground/40 uppercase tracking-[0.2em] mb-2">
                    Workspace Ready
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground/30 tracking-wide">
                    Your ring will appear here
                  </div>
                </div>
              </div>
            )}

            {hasModel && (
              <ViewportToolbar
                mode={transformMode}
                setMode={setTransformMode}
                transformData={selectedTransform}
                onTransformChange={handleNumericTransformChange}
                onResetTransform={() => handleSceneAction("reset-transform")}
              />
            )}
            
            {/* Bottom-left: gem toggle */}
            {hasModel && !isGenerating && !isModelLoading && (
              <div className="absolute bottom-4 left-4 z-50">
                <GemToggle
                  visible
                  mode={gemMode}
                  onModeChange={setGemMode}
                />
              </div>
            )}
            {/* Bottom-center: Ready status — same height as gem toggle so vertical centers + south borders align */}
            {hasModel && !isGenerating && !isModelLoading && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 font-mono text-[9px] h-[30px]">
                <div className="w-[6px] h-[6px] rounded-full flex-shrink-0 bg-green-400" />
                <span className="text-muted-foreground/60 uppercase tracking-[0.1em]">Ready</span>
              </div>
            )}

            {/* Display menu (anchored to side toolbar) */}
            <ViewportDisplayMenu
              visible={hasModel && !isGenerating && !isModelLoading}
              open={displayMenuOpen}
              onOpenChange={setDisplayMenuOpen}
              onSceneAction={handleSceneAction}
              anchor="side-toolbar"
            />
            {/* Keyboard shortcuts panel */}
            <KeyboardShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

            {/* Selection warning — centered overlay instead of toast */}
            <AnimatePresence>
              {selectionWarning && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none"
                >
                  <div className="pointer-events-auto bg-card border border-border shadow-2xl px-8 py-5 max-w-xs text-center">
                    <div className="font-display text-sm uppercase tracking-[0.15em] text-foreground mb-1.5">
                      No Selection
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                      {selectionWarning}
                    </p>
                    <button
                      onClick={() => setSelectionWarning(null)}
                      className="mt-4 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.15em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      OK
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <GenerationProgress visible={isGenerating || isModelLoading} currentStep={progressStep} retryAttempt={retryAttempt} onRetry={() => simulateGeneration()} />
            <ViewportSideTools
              visible={hasModel && !isGenerating && !isModelLoading}
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
              onResetView={() => canvasRef.current?.resetCamera()}
              onUndo={handleUndo}
              onRedo={handleRedo}
              undoCount={undoStack.length}
              redoCount={redoStack.length}
              onDownload={handleDownloadGlb}
              onEstimateWeight={showWeightStl ? handleEstimateWeight : undefined}
              weightLoading={weightLoading}
              onDownloadStl={showWeightStl ? handleDownloadStl : undefined}
              stlExporting={stlExporting}
              onFullscreen={() => {
                const el = document.querySelector('[data-cad-viewport]') as HTMLElement;
                if (el) {
                  if (document.fullscreenElement) document.exitFullscreen();
                  else el.requestFullscreen();
                }
              }}
              onDisplayMenu={() => setDisplayMenuOpen(p => !p)}
              onKeyboardShortcuts={() => setShortcutsOpen(true)}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel — always mounted, use imperative collapse/expand */}
        <ResizablePanel
          ref={rightPanelRef}
          id="right-panel"
          order={3}
          defaultSize={22}
          minSize={15}
          maxSize={35}
          collapsible
          collapsedSize={0}
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
        >
          {hasModel && !rightCollapsed && (
            <MeshPanel
              meshes={meshes}
              onSelectMesh={handleSelectMesh}
              onAction={handleMeshAction}
              onApplyMaterial={handleApplyMaterial}
              onSceneAction={handleSceneAction}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Weight result display */}
      {weightResult && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-card/95 backdrop-blur-sm border border-border rounded-sm font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground">Est. weight:</span>
          <span>{weightResult.weight_14k_gold_g.toFixed(1)}g (14K gold)</span>
          <span>·</span>
          <span>{weightResult.weight_platinum_g.toFixed(1)}g (platinum)</span>
          {weightResult.scale_warning && (
            <span title="Geometry scale may be incorrect">⚠</span>
          )}
        </div>
      )}

      {/* STL Quality Preset Modal */}
      <AnimatePresence>
        {stlPresetOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto bg-card border border-border shadow-2xl w-[340px] px-8 py-7 text-center relative">
              <button
                onClick={() => setStlPresetOpen(false)}
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="font-display text-sm uppercase tracking-[0.15em] text-foreground mb-1.5 pr-6">
                Download for 3D Printing
              </div>
              <p className="font-mono text-[11px] text-muted-foreground leading-relaxed mb-5 text-left">
                Choose a quality level. Higher quality takes longer to process (30–120 seconds).
              </p>

              {/* Quality presets */}
              <div className="flex flex-col gap-2 mb-6">
                {([
                  { label: "Draft", sublabel: "Fast · FDM prototyping", value: "draft" as const },
                  { label: "Standard", sublabel: "Recommended · Resin/wax", value: "standard" as const },
                  { label: "High Detail", sublabel: "Slow · Milgrain/filigree", value: "high" as const },
                ] as const).map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setStlQuality(preset.value)}
                    className={`py-3 px-4 text-left border transition-all duration-150 ${
                      stlQuality === preset.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em]">{preset.label}</div>
                    <div className={`text-[9px] tracking-wide mt-0.5 ${stlQuality === preset.value ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>{preset.sublabel}</div>
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStlPresetOpen(false)}
                  className="py-2.5 w-full text-center text-[10px] font-bold uppercase tracking-[0.15em] bg-background text-muted-foreground border border-border hover:border-foreground/30 transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={executeStlDownload}
                  className="py-2.5 w-full text-center text-[10px] font-bold uppercase tracking-[0.15em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Download STL
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
