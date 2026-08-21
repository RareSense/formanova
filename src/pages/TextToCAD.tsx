import { useState, useCallback, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelRightClose, PanelLeft, PanelRight, X } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { pollWorkflow } from "@/lib/poll-workflow";
import { InsufficientCreditsInline } from "@/components/InsufficientCreditsInline";

import InitialPromptScreen from "@/components/text-to-cad/InitialPromptScreen";
import LeftPanel from "@/components/text-to-cad/LeftPanel";
import { useAuth } from "@/contexts/AuthContext";
import { isCadUploadEnabled } from "@/lib/feature-flags";
import { useImageToCADWorkflow } from "@/hooks/useImageToCADWorkflow";
import { useCADMeshEditor } from "@/hooks/useCADMeshEditor";
import { useNotificationEmail } from "@/hooks/useNotificationEmail";
import { useCadArtifactDownloads } from "@/hooks/useCadArtifactDownloads";
import { CadDownloadMenu } from "@/components/downloads/CadDownloadMenu";
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
import { RING_CAD_DEFAULT_TIER, RING_CAD_TIERS } from "@/lib/ring-cad-nurbs-api";
import { recordStudioVisit } from '@/lib/studio-preference';

const NO_REFERENCE_IMAGES: File[] = [];

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
  const activeTier = requestedTier ?? RING_CAD_DEFAULT_TIER;

  const [model] = useState("gemini");
  const [prompt, setPrompt] = useState("");
  const [transformMode, setTransformMode] = useState("orbit");
  const wasManualUploadRef = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
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
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const editor = useCADMeshEditor({ canvasRef, transformMode, setTransformMode });

  const [isRestoringFromUrl] = useState(
    () => Boolean(searchParams.get('workflow_id')?.trim() || searchParams.get('glb')),
  );

  const workflow = useImageToCADWorkflow({
    model,
    prompt,
    referenceImages: NO_REFERENCE_IMAGES,
    tier: activeTier,
    cadRoute: '/text-to-cad',
    // Read once, at first render, so arriving from the result email
    // paints the loading state instead of an empty workspace.
    restoringFromUrl: isRestoringFromUrl,
    onWorkspaceActivate: activateWorkspace,
  });

  // Track browser fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Expand right panel when model is loaded, collapse when no model
  useEffect(() => {
    if (workflow.hasModel) rightPanelRef.current?.expand(22);
    else rightPanelRef.current?.collapse();
  }, [workflow.hasModel]);

  // Boot directly into the workspace from a stable workflow result link. The
  // optional GLB param renders eagerly; the workflow id restores the full
  // result, including the machinable 3DM, after refresh/new session.
  useEffect(() => {
    const glbParam = searchParams.get('glb');
    const workflowIdParam = searchParams.get('workflow_id');
    const workflowId = workflowIdParam?.trim() || null;
    if (!glbParam && !workflowId) return;
    void workflow.restoreCompletedWorkflow(workflowId, glbParam).then((restored) => {
      if (!restored) toast.error('Could not load this CAD result');
    });
    // Clean the param from the URL without triggering a re-render loop
    navigate('/text-to-cad', { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; workflow/navigate/searchParams excluded so re-navigation doesn't re-seed state
  }, []);

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
    glbUrl: workflow.glbUrl,
    exportEditedBlob: () => canvasRef.current?.exportSceneBlob() ?? Promise.resolve(undefined),
    source: 'text-to-cad',
  });

  /** An edit exists only once something has been pushed onto the undo stack,
   *  so an unedited model never offers an export identical to the plain GLB. */
  const hasEdits = editor.undoStack.length > 0;



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
    enabled: workspaceActive,
  });

  const creditBlockUI = workflow.creditBlock ? (
    <InsufficientCreditsInline
      currentBalance={workflow.creditBlock.currentBalance}
      requiredCredits={workflow.creditBlock.estimatedCredits}
      onDismiss={() => workflow.setCreditBlock(null)}
    />
  ) : undefined;

  // ── Phase 1: Initial prompt screen ──
  if (!workspaceActive) {
    return (
      <div className="h-[calc(100vh-5rem)] flex bg-background" tabIndex={0}>
        <InitialPromptScreen
          model={model}
          tier={activeTier}
          setModel={() => {}}
          prompt={prompt}
          setPrompt={setPrompt}
          isGenerating={workflow.isGenerating}
          onGenerate={workflow.simulateGeneration}
          onGlbUpload={showCadUpload ? handleGlbUpload : undefined}
          creditBlock={creditBlockUI}
        />
      </div>
    );
  }

  // ── Phase 2: Full workspace with resizable panels ──
  return (
    <>
      <Helmet>
        <title>Text to CAD | FormaNova</title>
        <meta name="description" content="Describe any jewelry piece in text and get a manufacturable 3D CAD model in minutes. Rings, necklaces, bracelets & more." />
        <link rel="canonical" href="/text-to-cad" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
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
              creditBlock={creditBlockUI}
            />
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Viewport */}
        <ResizablePanel id="viewport-panel" order={2} defaultSize={workflow.hasModel ? 56 : 78} minSize={30}>
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
                {workflow.hasModel && (
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

            <CADRuntimeErrorBoundary resetKeys={[workflow.glbUrl, workflow.hasModel]}>
              <CADCanvas
                ref={canvasRef}
                hasModel={workflow.hasModel}
                glbUrl={workflow.glbUrl}
                additionalGlbUrls={additionalParts}
                selectedMeshNames={editor.selectedMeshNames}
                hiddenMeshNames={editor.hiddenMeshNames}
                onMeshClick={editor.handleSelectMesh}
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
              />
            </CADRuntimeErrorBoundary>

            {/* Generation failed state */}
            <AnimatePresence>
              {workflow.generationFailed && !workflow.isGenerating && !workflow.hasModel && (
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
                      onClick={() => workflow.setGenerationFailed(false)}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                // Same visibility rule the download action had in ViewportSideTools
                // before the move — hidden mid-regeneration, not just mid-initial-generation.
                downloadSlot={!workflow.isGenerating && !workflow.isModelLoading ? (
                  <CadDownloadMenu
                    isBusy={downloads.isBusy}
                    onDownloadThreedm={workflow.threedmArtifact ? downloads.downloadThreedm : undefined}
                    onDownloadGlb={workflow.glbUrl ? downloads.downloadGlb : undefined}
                    onExportEdited={hasEdits ? downloads.exportEdited : undefined}
                  />
                ) : undefined}
              />
            )}

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
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
              onResetView={() => canvasRef.current?.resetCamera()}
              onUndo={editor.handleUndo}
              onRedo={editor.handleRedo}
              undoCount={editor.undoStack.length}
              redoCount={editor.redoStack.length}
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

        {/* No handle until there is a model: a divider against an empty
            panel reads as a region that failed to load. */}
        {workflow.hasModel && <ResizableHandle withHandle />}

        {/* Right panel — always mounted, use imperative collapse/expand */}
        <ResizablePanel
          ref={rightPanelRef}
          id="right-panel"
          order={3}
          // Starts collapsed. With defaultSize 22 the panel rendered empty on
          // mount until the effect collapsed it, which flashed a blank region
          // during generation.
          defaultSize={0}
          minSize={15}
          maxSize={35}
          collapsible
          collapsedSize={0}
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
        >
          {workflow.hasModel && !rightCollapsed && (
            <MeshPanel
              meshes={editor.meshes}
              onSelectMesh={editor.handleSelectMesh}
              onAction={editor.handleMeshAction}
              onApplyMaterial={editor.handleApplyMaterial}
              onSceneAction={editor.handleSceneAction}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

    </div>
    </>
  );
}
