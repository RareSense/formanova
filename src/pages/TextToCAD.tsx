import { useState, useCallback, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { pollWorkflow } from "@/lib/poll-workflow";
import CadWorkspaceLayout from "@/components/text-to-cad/CadWorkspaceLayout";
import { useCadBreakpoint, useCadCanHover } from "@/hooks/use-cad-breakpoint";

import DesignToCadFlow from "@/components/create-cad/DesignToCadFlow";
import { useReferenceImages } from "@/hooks/useReferenceImages";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import LeftPanel from "@/components/text-to-cad/LeftPanel";
import { useAuth } from "@/contexts/AuthContext";
import { isCadUploadEnabled } from "@/lib/feature-flags";
import { useImageToCADWorkflow } from "@/hooks/useImageToCADWorkflow";
import { useCADMeshEditor } from "@/hooks/useCADMeshEditor";
import { useNotificationEmail } from "@/hooks/useNotificationEmail";
import { useCadArtifactDownloads } from "@/hooks/useCadArtifactDownloads";
import { useCadAutoRotate } from "@/hooks/useCadAutoRotate";
import CadResultActions from "@/components/text-to-cad/CadResultActions";
import CadStatusDialog from '@/components/text-to-cad/CadStatusDialog';
import { trackCadStudioOpen } from "@/lib/posthog-events";

import MeshPanel from "@/components/text-to-cad/MeshPanel";
import CADCanvas from "@/components/text-to-cad/CADCanvas";
import type { CADCanvasHandle } from "@/components/text-to-cad/CADCanvas";
import CADRuntimeErrorBoundary from "@/components/cad/CADRuntimeErrorBoundary";
import ViewportDisplayMenu from "@/components/text-to-cad/ViewportDisplayMenu";
import KeyboardShortcutsPanel from "@/components/text-to-cad/KeyboardShortcutsPanel";
import GenerationProgress from "@/components/text-to-cad/GenerationProgress";
import { useCADKeyboardShortcuts } from "@/hooks/use-cad-keyboard-shortcuts";
import {
  ViewportToolbar,
  ViewportSideTools,
} from "@/components/text-to-cad/ViewportOverlays";
import GemToggle from "@/components/text-to-cad/QualityToggle";
import { runMicroBenchmark } from "@/lib/gpu-detect";
import type { GemMode } from "@/components/text-to-cad/CADCanvas";
import { RING_CAD_DEFAULT_TIER, RING_CAD_NURBS_WORKFLOW, RING_CAD_TIERS, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadModelPicker from "@/components/create-cad/CadModelPicker";
import { useCadModelChoice } from "@/hooks/useCadModelChoice";
import { recordStudioVisit } from '@/lib/studio-preference';
import { useCadRestoreFromUrl } from "@/hooks/useCadRestoreFromUrl";

/** Touch gizmos are too fiddly on a phone: the view only orbits there. */
const PHONE_TRANSFORM_MODES = ["orbit"] as const;

export default function TextToCAD() {
  // Counts towards which studio this user lands in after sign-in. The
  // workspaces are counted rather than the hub pages so both sides are
  // measured the same way: where the work happens, not where you browse.
  useEffect(() => { recordStudioVisit('cad'); }, []);

  // Top of the CAD funnel. Fires once per page entry so drop-off between
  // landing here and pressing Generate is measurable, matching studio_open in
  // the photoshoot flow.
  useEffect(() => { trackCadStudioOpen({ source: 'text-to-cad' }); }, []);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const notificationEmail = useNotificationEmail(user?.email);
  const showCadUpload = isCadUploadEnabled(user?.email);
  const requestedTier = searchParams.get('tier') === RING_CAD_TIERS.GPT_5_6_SOL
    ? RING_CAD_TIERS.GPT_5_6_SOL
    : undefined;
  // Every run uses the customer default (GPT-6 Astra, OpenAI direct) unless
  // the URL explicitly asks for the GPT-5.6 Sol tier.
  // Admins pick the model instead (CadModelPicker).
  const modelChoice = useCadModelChoice(requestedTier ?? RING_CAD_DEFAULT_TIER);
  const activeTier = modelChoice.tier;

  const [model] = useState("gemini");
  const [prompt, setPrompt] = useState("");
  const [jewelryType, setJewelryType] = useState<CadJewelryType | null>(null);
  const [transformMode, setTransformMode] = useState("orbit");
  const wasManualUploadRef = useRef(false);
  const layoutMode = useCadBreakpoint();
  const canHover = useCadCanHover();
  /** A sheet or drawer is open: keyboard shortcuts pause so keys never act on parts behind it. */
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [magicTexturing, setMagicTexturing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gemMode, setGemMode] = useState<GemMode>("simple");
  const [weightResult, setWeightResult] = useState<{
    weight_14k_gold_g: number;
    weight_platinum_g: number;
    scale_warning: boolean;
  } | null>(null);
  const [additionalParts, setAdditionalParts] = useState<string[]>([]);

  // Run invisible micro-benchmark on mount (offscreen, ~200ms)
  useEffect(() => { runMicroBenchmark(); }, []);

  // Track whether user has ever started a generation or uploaded — drives the phase transition
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const activateWorkspace = useCallback(() => setWorkspaceActive(true), []);

  const canvasRef = useRef<CADCanvasHandle>(null);

  const editor = useCADMeshEditor({ canvasRef, transformMode, setTransformMode });

  /** Presentation-only camera orbit; see useCadAutoRotate. */
  const autoRotate = useCadAutoRotate();

  /** Radial explode view; display only, see src/lib/cad-explode.ts. */
  const [exploded, setExploded] = useState(false);

  const [isRestoringFromUrl] = useState(
    () => Boolean(searchParams.get('workflow_id')?.trim() || searchParams.get('glb')),
  );

  // Text to CAD is design first: the CAD is made from the approved design
  // pictures (main first) plus the dimensions typed in Ready for CAD.
  const { referenceImages, replaceReferenceImages } = useReferenceImages();
  const [pendingCad, setPendingCad] = useState(false);
  const { cost: cadCost, loading: cadCostLoading } = useEstimatedCost({
    workflowName: RING_CAD_NURBS_WORKFLOW,
    model,
    pricingContext: { llm_tier: activeTier },
  });

  const workflow = useImageToCADWorkflow({
    model,
    prompt,
    referenceImages,
    tier: activeTier,
    jewelryType: jewelryType ?? undefined,
    cadRoute: '/text-to-cad',
    // Read once, at first render, so arriving from the result email
    // paints the loading state instead of an empty workspace.
    restoringFromUrl: isRestoringFromUrl,
    onWorkspaceActivate: activateWorkspace,
  });

  // Start the CAD on the render after the approved pictures are in place.
  useEffect(() => {
    if (!pendingCad) return;
    setPendingCad(false);
    workflow.simulateGeneration();
  }, [pendingCad, referenceImages]); // eslint-disable-line react-hooks/exhaustive-deps -- fires once per Generate CAD; workflow changes identity every render and must not re-trigger a paid run

  // A new model starts assembled.
  useEffect(() => { setExploded(false); }, [workflow.glbUrl]);

  // Track browser fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Phones offer Orbit only; never leave a Move/Rotate/Scale gizmo behind on one.
  useEffect(() => { if (layoutMode === "phone") setTransformMode("orbit"); }, [layoutMode]);

  // Boot directly into the workspace from a stable workflow result link. The
  // optional GLB param renders eagerly; the workflow id restores the full
  // result, including the machinable 3DM, after refresh/new session.
  useCadRestoreFromUrl({
    cadRoute: '/text-to-cad',
    restoreCompletedWorkflow: workflow.restoreCompletedWorkflow,
    onFailure: () => toast.error('Could not load this CAD result'),
  });

  // Called when CADCanvas has fully parsed, textured, and rendered the model.
  // Depend only on the stable setter this uses (React guarantees setState
  // identity is stable) rather than the whole `workflow` object, which is a
  // fresh literal every render — a `[workflow]` dependency here defeats
  // memoization, giving CADCanvas a new onModelReady on every unrelated
  // TextToCAD re-render. Since onModelReady is itself a dependency of an
  // internal CADCanvas effect that reprocesses the mesh and re-fires this
  // callback, that churn caused visible flicker plus a spurious second call
  // landing after wasManualUploadRef had already been reset to false.
  const handleModelReady = useCallback(() => {
    workflow.setIsModelLoading(false);
    if (wasManualUploadRef.current) {
      toast.success("File uploaded");
      wasManualUploadRef.current = false;
    } else {
      toast.success("Ring generated successfully");
    }
  }, [workflow.setIsModelLoading]);

  const handleGlbUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    wasManualUploadRef.current = true;

    if (!workspaceActive) setWorkspaceActive(true);

    // Detach from any leftover tracked generation so a background completion
    // can't force-overwrite what the user just uploaded (useImageToCADWorkflow's
    // trackedRun mirror effect fires on sourceWorkflowId regardless of on-screen
    // state, unless the user explicitly left via Keep Creating).
    workflow.setSourceWorkflowId(null);

    // Check if scene actually has meshes — after Ctrl+A + Delete, hasModel may be true
    // but the scene is empty, so we should treat it as a fresh upload.
    const sceneHasMeshes = editor.meshesRef.current.length > 0;

    if (workflow.hasModel && workflow.glbUrl && sceneHasMeshes) {
      // Model already exists with visible meshes — add as an additional part (merge into scene)
      setAdditionalParts((prev) => [...prev, url]);
    } else {
      // No model yet OR scene was cleared — set as the primary model
      if (workflow.glbUrl?.startsWith("blob:")) URL.revokeObjectURL(workflow.glbUrl);
      additionalParts.forEach((u) => URL.revokeObjectURL(u));
      setAdditionalParts([]);
      workflow.setIsModelLoading(true);
      workflow.setProgressStep("_loading");
      workflow.setGlbUrl(url);
      workflow.setHasModel(true);
      editor.setMeshes([]);
    }
  }, [workflow, additionalParts, workspaceActive, editor]);

  const handleReset = useCallback(() => {
    // Stay in workspace — do NOT reset workspaceActive
    workflow.resetWorkflow();
    editor.resetMeshEditor();
    additionalParts.forEach((u) => URL.revokeObjectURL(u));
    setAdditionalParts([]);
  }, [workflow, editor, additionalParts]);

  /**
   * Downloads hand back exactly what the backend produced. The GLB used to be
   * a GLTFExporter re-encode of the live scene, which rewrites materials and
   * renders differently from both the viewport and the backend's own file;
   * scene export now happens only through exportEdited, which the menu offers
   * only once the user has actually edited something.
   */
  const downloads = useCadArtifactDownloads({
    threedmUrl: workflow.threedmArtifact?.url,
    viewerThreedmUrl: workflow.viewerThreedmUrl,
    glbUrl: workflow.glbUrl,
    stlUrls: workflow.stlArtifacts.map(artifact => artifact.url),
    stepUrls: workflow.stepArtifacts.map(artifact => artifact.url),
    exportEditedBlob: () => canvasRef.current?.exportSceneBlob() ?? Promise.resolve(undefined),
    source: 'text-to-cad',
  });

  /** An edit exists only once something has been pushed onto the undo stack,
   *  so an unedited model never offers an export identical to the plain GLB. */
  const hasEdits = editor.undoStack.length > 0;

  // Same visibility rule the download carried in the toolbar before the move:
  // hidden mid-regeneration, not just mid-initial-generation.
  const resultActions = workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && (
    <CadResultActions
      layout={layoutMode === "phone" ? "row" : "overlay"}
      isBusy={downloads.isBusy}
      onDownloadThreedm={workflow.threedmArtifact ? downloads.downloadThreedm : undefined}
      onDownloadGlb={workflow.glbUrl ? downloads.downloadGlb : undefined}
      onDownloadViewerThreedm={workflow.viewerThreedmUrl ? downloads.downloadViewerThreedm : undefined}
      onDownloadStl={workflow.stlArtifacts.length ? downloads.downloadStl : undefined}
      onDownloadStep={workflow.stepArtifacts.length ? downloads.downloadStep : undefined}
      estimatedMetalMassG={workflow.estimatedMetalMassG}
      onExportEdited={hasEdits ? downloads.exportEdited : undefined}
      latestVersionLabel={workflow.latestVersionLabel}
      onImproveFromVersion={workflow.improveFromLatestVersion}
      improveDisabled={!workflow.canImproveLatestVersion}
      improveExhausted={workflow.improveExhausted}
      improveRetired={workflow.improveRetired}
    />
  );



  useCADKeyboardShortcuts({
    onUndo: editor.handleUndo,
    onRedo: editor.handleRedo,
    onDelete: () => editor.handleSceneAction("delete"),
    onDuplicate: () => editor.handleSceneAction("duplicate"),
    onSelectAll: () => editor.setMeshes((prev) => prev.map((m) => ({ ...m, selected: true }))),
    onDeselectAll: () => editor.setMeshes((prev) => prev.map((m) => ({ ...m, selected: false }))),
    onSetTransformMode: setTransformMode,
    onToggleWireframe: editor.toggleWireframe,
    onToggleShortcutsPanel: () => setShortcutsOpen((p) => !p),
    onCopy: editor.handleCopy,
    onPaste: editor.handlePaste,
    onCut: editor.handleCut,
    onResetTransform: () => editor.handleSceneAction("reset-transform"),
    enabled: workspaceActive && !panelsOpen,
  });

  // ── Phase 1: Initial prompt screen ──
  if (!workspaceActive) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex bg-background" tabIndex={0}>
        <DesignToCadFlow
          jewelryType={jewelryType}
          setJewelryType={setJewelryType}
          onGlbUpload={showCadUpload ? handleGlbUpload : undefined}
          dimensions={prompt}
          onDimensions={setPrompt}
          cadCost={cadCost}
          cadCostLoading={cadCostLoading}
          creatingCad={pendingCad || workflow.isGenerating}
          onCreateCad={(files) => { void Promise.resolve(replaceReferenceImages(files)).then(() => setPendingCad(true)); }}
          modelPicker={modelChoice.isAdmin ? <CadModelPicker value={modelChoice.tier} onChange={modelChoice.setTier} disabled={pendingCad || workflow.isGenerating} /> : null}
        />
      </div>
    );
  }

  // ── Phase 2: Full workspace with resizable panels ──
  return (
    <>
      <Helmet>
        <title>Text to CAD | FormaNova</title>
        <meta name="description" content="Describe a piece in text and get a manufacturable 3D CAD model in minutes. Works for rings, necklaces, bracelets, earrings and more." />
        <link rel="canonical" href="/text-to-cad" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <CadWorkspaceLayout
      mode={layoutMode}
      hasModel={workflow.hasModel}
      isFullscreen={isFullscreen}
      onPanelsOpenChange={setPanelsOpen}
      before={<CadStatusDialog notice={workflow.statusNotice} onClose={workflow.dismissStatusNotice} />}
      leftLabel="Prompt"
      left={
            <LeftPanel
              model={model} setModel={() => {}}
              prompt={prompt} setPrompt={setPrompt}
              isGenerating={workflow.isGenerating}
              hasModel={workflow.hasModel}
              onGenerate={workflow.simulateGeneration}
              magicTexturing={magicTexturing}
              onMagicTexturingChange={(on) => {
                setMagicTexturing(on);
                if (on) {
                  canvasRef.current?.applyMagicTextures();
                } else {
                  canvasRef.current?.removeAllTextures();
                }
              }}
              onReset={workflow.hasModel ? handleReset : undefined}
            />
      }
      right={(section) => (
            <MeshPanel
              section={section}
              meshes={editor.meshes}
              onSelectMesh={editor.handleSelectMesh}
              onSelectFamily={editor.handleSelectFamily}
              onHoverPart={canHover ? editor.setHoveredPart : undefined}
              hoveredNames={editor.hoveredFamilyNames}
              onApplyGemToAll={editor.handleApplyGemToAll}
              onAction={editor.handleMeshAction}
              onApplyMaterial={editor.handleApplyMaterial}
              onApplyMetalToAll={editor.handleApplyMetalToAll}
              onSceneAction={editor.handleSceneAction}
            />
      )}
      phoneActions={layoutMode === "phone" ? resultActions : undefined}
      viewport={
          <>
            <CADRuntimeErrorBoundary resetKeys={[workflow.glbUrl, workflow.hasModel]}>
              <CADCanvas
                ref={canvasRef}
                hasModel={workflow.hasModel}
                glbUrl={workflow.glbUrl}
                additionalGlbUrls={additionalParts}
                selectedMeshNames={editor.selectedMeshNames}
                hiddenMeshNames={editor.hiddenMeshNames}
                onMeshClick={editor.handleSelectFamily}
                onMeshDoubleClick={editor.handleSelectMesh}
                onMeshHover={canHover ? editor.setHoveredPart : undefined}
                highlightedMeshNames={editor.hoveredFamilyNames}
                transformMode={transformMode}
                onMeshesDetected={editor.handleMeshesDetected}
                onTransformStart={editor.handleTransformStart}
                onTransformEnd={editor.handleTransformEnd}
                lightIntensity={1}
                onModelReady={handleModelReady}
                magicTexturing={magicTexturing}
                qualityMode="balanced"
                gemMode={gemMode}
                onGemModeForced={(mode) => setGemMode(mode)}
                exploded={showCadUpload && exploded}
              />
            </CADRuntimeErrorBoundary>

            {/* Empty state */}
            {!workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && !workflow.generationFailed && (
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

            {workflow.hasModel && (
              <ViewportToolbar
                mode={transformMode}
                setMode={setTransformMode}
                transformData={editor.selectedTransform}
                onTransformChange={editor.handleNumericTransformChange}
                onResetTransform={() => editor.handleSceneAction("reset-transform")}
                compact={layoutMode === "phone"}
                modes={layoutMode === "phone" ? PHONE_TRANSFORM_MODES : undefined}
              />
            )}

            {/* Result actions, bottom center (on phones, the dock under the sheet). */}
            {layoutMode !== "phone" && resultActions}

            {/* Bottom-left: gem toggle */}
            {workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && (
              <div className="absolute bottom-4 left-4 z-50">
                <GemToggle
                  visible
                  mode={gemMode}
                  onModeChange={setGemMode}
                />
              </div>
            )}
            {/* Bottom-center: Ready status — same height as gem toggle so vertical centers + south borders align */}
            {workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 font-mono text-[9px] h-[30px]">
                <div className="w-[6px] h-[6px] rounded-full flex-shrink-0 bg-green-400" />
                <span className="text-muted-foreground/60 uppercase tracking-[0.1em]">Ready</span>
              </div>
            )}

            {/* Display menu (anchored to side toolbar) */}
            <ViewportDisplayMenu
              visible={workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading}
              open={displayMenuOpen}
              onOpenChange={setDisplayMenuOpen}
              onSceneAction={editor.handleSceneAction}
              anchor="side-toolbar"
            />
            {/* Keyboard shortcuts panel */}
            <KeyboardShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

            {/* Selection warning — centered overlay instead of toast */}
            <AnimatePresence>
              {editor.selectionWarning && (
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
                      {editor.selectionWarning}
                    </p>
                    <button
                      onClick={() => editor.setSelectionWarning(null)}
                      className="mt-4 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.15em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      OK
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <GenerationProgress
              visible={workflow.isGenerating || workflow.isModelLoading}
              currentStep={workflow.progressStep}
              onRetry={() => workflow.simulateGeneration()}
              failureMessage={workflow.failureMessage}
              notificationEmail={notificationEmail.notificationEmail}
              storedNotificationEmail={notificationEmail.storedNotificationEmail}
              emailEnabled={notificationEmail.emailEnabled}
              onToggleEmailEnabled={notificationEmail.setEmailEnabled}
              notificationEmailLoading={notificationEmail.isLoading}
              notificationEmailSaving={notificationEmail.isSaving}
              notificationEmailError={notificationEmail.error}
              onSaveNotificationEmail={notificationEmail.saveNotificationEmail}
              onKeepCreating={() => {
                workflow.handleKeepCreating();
                setPrompt("");
                setWorkspaceActive(false);
              }}
            />
            <ViewportSideTools
              visible={workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading}
              compact={layoutMode === "phone"}
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
              onResetView={() => {
                // Reset View re-frames the camera, so leaving auto-rotate
                // running would immediately drift away from the framing the
                // user just asked for.
                autoRotate.stopAutoRotate();
                canvasRef.current?.resetCamera();
              }}
              onAutoRotate={autoRotate.toggleAutoRotate}
              autoRotateActive={autoRotate.isAutoRotating}
              onExplode={showCadUpload ? () => setExploded(e => !e) : undefined}
              explodeActive={exploded}
              onUndo={editor.handleUndo}
              onRedo={editor.handleRedo}
              undoCount={editor.undoStack.length}
              redoCount={editor.redoStack.length}
              // Phones get none: iPhone Safari cannot fullscreen an element,
              // and fullscreening the view alone would hide the sheet and dock.
              onFullscreen={layoutMode === "phone" ? undefined : () => {
                const el = document.querySelector('[data-cad-viewport]') as HTMLElement;
                if (el) {
                  if (document.fullscreenElement) document.exitFullscreen();
                  else el.requestFullscreen();
                }
              }}
              onDisplayMenu={() => setDisplayMenuOpen(p => !p)}
              onKeyboardShortcuts={layoutMode === "phone" ? undefined : () => setShortcutsOpen(true)}
            />
          </>
      }
    />
    </>
  );
}
