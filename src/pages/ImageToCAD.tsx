import { useState, useCallback, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelRightClose, PanelLeft, PanelRight } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useAuth } from "@/contexts/AuthContext";
import { isCadUploadEnabled } from "@/lib/feature-flags";
import { runMicroBenchmark } from "@/lib/gpu-detect";
import { useImageToCADWorkflow } from "@/hooks/useImageToCADWorkflow";
import { useCADMeshEditor } from "@/hooks/useCADMeshEditor";
import { useReferenceImages } from "@/hooks/useReferenceImages";
import { useNotificationEmail } from "@/hooks/useNotificationEmail";
import { useCadArtifactDownloads } from "@/hooks/useCadArtifactDownloads";
import { useCadAutoRotate } from "@/hooks/useCadAutoRotate";
import { CadDownloadMenu } from "@/components/downloads/CadDownloadMenu";
import { CadSolidityNotice } from "@/components/downloads/CadSolidityNotice";
import { trackCadStudioOpen, trackCadReferenceUploaded } from "@/lib/posthog-events";
import { useCADKeyboardShortcuts } from "@/hooks/use-cad-keyboard-shortcuts";

import ImagePromptScreen from "@/components/text-to-cad/ImagePromptScreen";
import LeftPanel from "@/components/text-to-cad/LeftPanel";
import MeshPanel from "@/components/text-to-cad/MeshPanel";
import CADCanvas from "@/components/text-to-cad/CADCanvas";
import type { CADCanvasHandle } from "@/components/text-to-cad/CADCanvas";
import CADRuntimeErrorBoundary from "@/components/cad/CADRuntimeErrorBoundary";
import ViewportDisplayMenu from "@/components/text-to-cad/ViewportDisplayMenu";
import KeyboardShortcutsPanel from "@/components/text-to-cad/KeyboardShortcutsPanel";
import GenerationProgress from "@/components/text-to-cad/GenerationProgress";
import { ViewportToolbar, ViewportSideTools } from "@/components/text-to-cad/ViewportOverlays";
import GemToggle from "@/components/text-to-cad/QualityToggle";
import type { GemMode } from "@/components/text-to-cad/CADCanvas";
import { RING_CAD_DEFAULT_TIER } from "@/lib/ring-cad-nurbs-api";
import { recordStudioVisit } from '@/lib/studio-preference';
import { useCadRestoreFromUrl } from "@/hooks/useCadRestoreFromUrl";

export default function ImageToCAD() {
  // Counts towards which studio this user lands in after sign-in. The
  // workspaces are counted rather than the hub pages so both sides are
  // measured the same way: where the work happens, not where you browse.
  useEffect(() => { recordStudioVisit('cad'); }, []);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const notificationEmail = useNotificationEmail(user?.email);
  const showCadUpload = isCadUploadEnabled(user?.email);

  const [model] = useState("gemini");
  const activeTier = RING_CAD_DEFAULT_TIER;
  const {
    referenceImages,
    referenceImagePreviewUrls,
    addReferenceImages: addReferenceImagesRaw,
    removeReferenceImage,
    replaceReferenceImages,
    clearReferenceImages,
  } = useReferenceImages();
  /** Wraps the shared uploader so the analytics live at this page's boundary
   *  rather than inside useReferenceImages, which knows nothing about CAD. */
  const addReferenceImages = useCallback((files: File[]) => {
    if (files.length) {
      trackCadReferenceUploaded({
        source: 'image-to-cad',
        image_count: files.length,
        total_after_add: referenceImages.length + files.length,
      });
    }
    addReferenceImagesRaw(files);
  }, [addReferenceImagesRaw, referenceImages.length]);

  const [transformMode, setTransformMode] = useState("orbit");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [magicTexturing, setMagicTexturing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gemMode, setGemMode] = useState<GemMode>("simple");
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const [prompt, setPrompt] = useState("");

  const canvasRef = useRef<CADCanvasHandle>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const editor = useCADMeshEditor({ canvasRef, transformMode, setTransformMode });

  /** Presentation-only camera orbit; see useCadAutoRotate. */
  const autoRotate = useCadAutoRotate();

  const activateWorkspace = useCallback(() => setWorkspaceActive(true), []);

  const [isRestoringFromUrl] = useState(
    () => Boolean(searchParams.get('workflow_id')?.trim() || searchParams.get('glb')),
  );

  const workflow = useImageToCADWorkflow({
    model,
    prompt,
    referenceImages,
    tier: activeTier,
    cadRoute: '/image-to-cad',
    // Read once, at first render, so arriving from the result email
    // paints the loading state instead of an empty workspace.
    restoringFromUrl: isRestoringFromUrl,
    onWorkspaceActivate: activateWorkspace,
  });

  useEffect(() => { runMicroBenchmark(); }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (workflow.hasModel) rightPanelRef.current?.expand(22);
    else rightPanelRef.current?.collapse();
  }, [workflow.hasModel]);

  // Boot directly into the workspace from a stable workflow result link. The
  // optional GLB param renders eagerly; the workflow id restores the full
  // result, including the machinable 3DM, after refresh/new session.
  useCadRestoreFromUrl({
    cadRoute: '/image-to-cad',
    restoreCompletedWorkflow: workflow.restoreCompletedWorkflow,
    onFailure: () => toast.error('Could not load this CAD result'),
  });

  // Top of the CAD funnel. Fires once per page entry so drop-off between
  // landing here and pressing Generate is measurable, matching studio_open in
  // the photoshoot flow.
  useEffect(() => {
    trackCadStudioOpen({ source: 'image-to-cad' });
  }, []);

  // Depend only on the stable setter this uses, not the whole `workflow`
  // object (a fresh literal every render) — see TextToCAD.tsx's handleModelReady
  // for why a `[workflow]` dependency here causes CADCanvas to re-fire this
  // callback (and reprocess the mesh, causing flicker) on unrelated re-renders.
  const handleModelReady = useCallback(() => {
    workflow.setIsModelLoading(false);
    toast.success("Ring generated successfully");
  }, [workflow.setIsModelLoading]);

  const handleReset = useCallback(() => {
    workflow.resetWorkflow();
    editor.resetMeshEditor();
  }, [workflow, editor]);

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
    source: 'image-to-cad',
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

  // ── Phase 1: Initial prompt screen ──
  if (!workspaceActive) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex bg-background" tabIndex={0}>
        <ImagePromptScreen
          model={model}
          tier={activeTier}
          prompt={prompt}
          setPrompt={setPrompt}
          isGenerating={workflow.isGenerating}
          onGenerate={workflow.simulateGeneration}
          referenceImagePreviewUrls={referenceImagePreviewUrls}
          onAddReferenceImages={addReferenceImages}
          onRemoveReferenceImage={removeReferenceImage}
          onReplaceReferenceImages={replaceReferenceImages}
          onGlbUpload={showCadUpload ? (file) => {
            setWorkspaceActive(true);
            workflow.setHasModel(true);
            workflow.setIsModelLoading(true);
            workflow.setProgressStep("_loading");
            const url = URL.createObjectURL(file);
            workflow.setGlbUrl(url);
          } : undefined}
        />
      </div>
    );
  }

  // ── Phase 2: Full workspace with resizable panels ──
  return (
    <>
      <Helmet>
        <title>Image to CAD | FormaNova</title>
        <meta name="description" content="Upload a ring sketch or reference image and convert it into a 3D CAD model with AI-powered accuracy. Rings only." />
        <link rel="canonical" href="/image-to-cad" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden bg-background" tabIndex={-1}>
      <ResizablePanelGroup direction="horizontal" className="h-full">
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
                if (on) canvasRef.current?.applyMagicTextures();
                else canvasRef.current?.removeAllTextures();
              }}
              onReset={workflow.hasModel ? handleReset : undefined}
              pageTitle="Image to CAD"
              referenceImagePreviewUrls={referenceImagePreviewUrls}
            />
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel id="viewport-panel" order={2} defaultSize={workflow.hasModel ? 56 : 78} minSize={30}>
          <div data-cad-viewport className="relative h-full border-x-2 border-primary/20 shadow-[inset_0_0_30px_-10px_hsl(var(--primary)/0.15)]" style={{ background: "#000000" }}>
            {!isFullscreen && (
              <>
                <button
                  onClick={() => { const p = leftPanelRef.current; if (p) { leftCollapsed ? p.expand(22) : p.collapse(); } }}
                  className="absolute top-2 left-2 z-[60] w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                  title={leftCollapsed ? "Show left panel" : "Hide left panel"}
                >
                  {leftCollapsed ? <PanelLeft className="w-4 h-4 text-foreground/70" /> : <PanelLeftClose className="w-4 h-4 text-foreground/70" />}
                </button>
                {workflow.hasModel && (
                  <button
                    onClick={() => { const p = rightPanelRef.current; if (p) { rightCollapsed ? p.expand(22) : p.collapse(); } }}
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
                additionalGlbUrls={[]}
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
                  <div className="flex flex-col items-end gap-1.5">
                    <CadDownloadMenu
                      isBusy={downloads.isBusy}
                      onDownloadThreedm={workflow.threedmArtifact ? downloads.downloadThreedm : undefined}
                      onDownloadGlb={workflow.glbUrl ? downloads.downloadGlb : undefined}
                      onExportEdited={hasEdits ? downloads.exportEdited : undefined}
                    />
                    {/* Directly under the download, because the moment that
                        matters is the one where the file is about to leave the
                        app and go to someone who will try to make it. */}
                    <CadSolidityNotice notAllSolid={workflow.notAllSolid} />
                  </div>
                ) : undefined}
              />
            )}

            {workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && (
              <div className="absolute bottom-4 left-4 z-50">
                <GemToggle visible mode={gemMode} onModeChange={setGemMode} />
              </div>
            )}
            {workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 font-mono text-[9px] h-[30px]">
                <div className="w-[6px] h-[6px] rounded-full flex-shrink-0 bg-green-400" />
                <span className="text-muted-foreground/60 uppercase tracking-[0.1em]">Ready</span>
              </div>
            )}

            <ViewportDisplayMenu
              visible={workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading}
              open={displayMenuOpen}
              onOpenChange={setDisplayMenuOpen}
              onSceneAction={editor.handleSceneAction}
              anchor="side-toolbar"
            />
            <KeyboardShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

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
                    <div className="font-display text-sm uppercase tracking-[0.15em] text-foreground mb-1.5">No Selection</div>
                    <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">{editor.selectionWarning}</p>
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
                clearReferenceImages();
                setWorkspaceActive(false);
              }}
            />
            <ViewportSideTools
              visible={workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading}
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
              onUndo={editor.handleUndo}
              onRedo={editor.handleRedo}
              undoCount={editor.undoStack.length}
              redoCount={editor.redoStack.length}
              onFullscreen={() => {
                const el = document.querySelector('[data-cad-viewport]') as HTMLElement;
                if (el) { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen(); }
              }}
              onDisplayMenu={() => setDisplayMenuOpen(p => !p)}
              onKeyboardShortcuts={() => setShortcutsOpen(true)}
            />
          </div>
        </ResizablePanel>

        {/* No handle until there is a model: a divider against an empty
            panel reads as a region that failed to load. */}
        {workflow.hasModel && <ResizableHandle withHandle />}

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
