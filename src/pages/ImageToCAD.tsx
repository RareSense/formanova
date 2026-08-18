import { useState, useCallback, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelRightClose, PanelLeft, PanelRight } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { InsufficientCreditsInline } from "@/components/InsufficientCreditsInline";
import { useAuth } from "@/contexts/AuthContext";
import { isCadUploadEnabled } from "@/lib/feature-flags";
import { authenticatedFetch, AuthExpiredError } from "@/lib/authenticated-fetch";
import { runMicroBenchmark } from "@/lib/gpu-detect";
import { useImageToCADWorkflow } from "@/hooks/useImageToCADWorkflow";
import { useCADMeshEditor } from "@/hooks/useCADMeshEditor";
import { useReferenceImages } from "@/hooks/useReferenceImages";
import { useNotificationEmail } from "@/hooks/useNotificationEmail";
import { useAltDeliveryPreference } from "@/hooks/useAltDeliveryPreference";
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

export default function ImageToCAD() {
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
    addReferenceImages,
    removeReferenceImage,
    replaceReferenceImages,
    clearReferenceImages,
  } = useReferenceImages();
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

  const activateWorkspace = useCallback(() => setWorkspaceActive(true), []);

  const workflow = useImageToCADWorkflow({
    model,
    prompt,
    referenceImages,
    tier: activeTier,
    cadRoute: '/image-to-cad',
    pushUndo: editor.pushUndo,
    userId: user?.id,
    onWorkspaceActivate: activateWorkspace,
  });
  const altDelivery = useAltDeliveryPreference(workflow.sourceWorkflowId, user?.email, "Image-to-CAD");

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

  useEffect(() => {
    const glbParam = searchParams.get('glb');
    const workflowIdParam = searchParams.get('workflow_id');
    const workflowId = workflowIdParam?.trim() || null;
    if (!glbParam && !workflowId) return;
    void workflow.restoreCompletedWorkflow(workflowId, glbParam).then((restored) => {
      if (!restored) toast.error('Could not load this CAD result');
    });
    navigate('/image-to-cad', { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; workflow/navigate/searchParams excluded so re-navigation doesn't re-seed state
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
   * Downloads the NURBS .3dm, which is the machinable deliverable. It is built
   * server-side, so it is the pristine generated ring and cannot reflect any
   * viewport mesh edits - the GLB export below covers that case.
   */
  const handleDownloadThreedm = useCallback(async () => {
    // .url, never .uri: the raw reference is azure:// and is not fetchable.
    const uri = workflow.threedmArtifact?.url;
    if (!uri) { toast.error("No CAD file available for this model"); return; }
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = `ring-${timestamp}.3dm`;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: fileName, file_type: '3dm', context: 'image-to-cad' }));
    try {
      const response = await authenticatedFetch(uri);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error("Empty file");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error('[Download 3dm]', err);
      toast.error("Failed to download the CAD file");
    }
  }, [workflow.threedmArtifact]);

  const handleDownloadGlb = useCallback(async () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const defaultName = `model-${timestamp}.glb`;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: defaultName, file_type: 'glb', context: 'image-to-cad' }));
    const anchorDownload = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = defaultName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    try {
      let blob: Blob;
      if (canvasRef.current) {
        blob = await canvasRef.current.exportSceneBlob();
      } else if (workflow.glbUrl) {
        // glbUrl may be a blob: URL (user upload) or a backend-returned asset URL — both are allowed raw fetches
        const response = await fetch(workflow.glbUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      } else { toast.error("No model to download"); return; }
      if (!blob || blob.size === 0) { toast.error("Export produced an empty file"); return; }
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: defaultName,
            types: [{ description: 'GLB 3D Model', accept: { 'model/gltf-binary': ['.glb'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          anchorDownload(blob);
        }
      } else { anchorDownload(blob); }
    } catch (err) {
      console.error('[Download]', err);
      toast.error("Failed to download model");
    }
  }, [workflow.glbUrl]);

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
          creditBlock={creditBlockUI}
        />
      </div>
    );
  }

  // ── Phase 2: Full workspace with resizable panels ──
  return (
    <>
      <Helmet>
        <title>Image to 3D | FormaNova</title>
        <meta name="description" content="Upload a jewelry sketch or reference image and convert it into a 3D CAD model with AI-powered accuracy." />
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
              pageTitle="Image to 3D"
              referenceImagePreviewUrls={referenceImagePreviewUrls}
              onRemoveReferenceImage={removeReferenceImage}
              creditBlock={creditBlockUI}
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
                onDownload={!workflow.isGenerating && !workflow.isModelLoading
                  ? (workflow.threedmArtifact ? handleDownloadThreedm : handleDownloadGlb)
                  : undefined}
                downloadLabel={workflow.threedmArtifact ? "Download 3DM" : "Export GLB"}
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
              notificationEmailLoading={notificationEmail.isLoading}
              notificationEmailSaving={notificationEmail.isSaving}
              notificationEmailError={notificationEmail.error}
              onSaveNotificationEmail={notificationEmail.saveNotificationEmail}
              altDeliveryPreference={altDelivery.preference}
              altDeliveryRequesting={altDelivery.isRequesting}
              altDeliveryError={altDelivery.error}
              altDeliveryRequested={altDelivery.requested}
              onRequestAltDelivery={altDelivery.requestDelivery}
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
              onResetView={() => canvasRef.current?.resetCamera()}
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

        <ResizableHandle withHandle />

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
