import { useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, ChevronLeft, ChevronRight, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import StudioViewport from "@/components/cad-studio/StudioViewport";
import MaterialLibrary from "@/components/cad-studio/MaterialLibrary";
import MeshInspector from "@/components/cad-studio/MeshInspector";
import type { MaterialDef } from "@/components/cad-studio/materials";
import * as THREE from "three";

const PHOTOSHOOT_STEPS = [
  "Preparing scene…",
  "Setting up lighting…",
  "Rendering angle 1/4…",
  "Rendering angle 2/4…",
  "Rendering angle 3/4…",
  "Rendering angle 4/4…",
  "Post-processing…",
  "Finalizing renders…",
];

interface MeshInfo {
  name: string;
  original: THREE.Material | THREE.Material[];
}

export default function CADToCatalog() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [selectedMeshes, setSelectedMeshes] = useState<Set<string>>(new Set());
  const [meshMaterials, setMeshMaterials] = useState<Record<string, MaterialDef>>({});
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [autoRotate, setAutoRotate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      toast.error("Please upload a .glb file");
      return;
    }
    const url = URL.createObjectURL(file);
    setModelUrl(url);
    setFileName(file.name);
    setMeshes([]);
    setSelectedMeshes(new Set());
    setMeshMaterials({});
    toast.success(`Loaded: ${file.name}`);
  }, []);

  const handleMeshesDetected = useCallback((detected: MeshInfo[]) => {
    setMeshes(detected);
    if (detected.length > 0) {
      setSelectedMeshes(new Set([detected[0].name]));
    }
  }, []);

  const handleMeshClick = useCallback((name: string, multiSelect?: boolean) => {
    setSelectedMeshes((prev) => {
      if (multiSelect) {
        const next = new Set(prev);
        if (next.has(name)) {
          next.delete(name);
        } else {
          next.add(name);
        }
        return next;
      }
      return new Set([name]);
    });
  }, []);

  const handleApplyMaterial = useCallback(
    (material: MaterialDef) => {
      if (selectedMeshes.size === 0) return;
      setMeshMaterials((prev) => {
        const next = { ...prev };
        selectedMeshes.forEach((name) => { next[name] = material; });
        return next;
      });
      const names = Array.from(selectedMeshes);
      toast.success(`Applied ${material.name} to ${names.length > 1 ? `${names.length} meshes` : names[0]}`);
    },
    [selectedMeshes]
  );

  const handleRemoveModel = useCallback(() => {
    if (modelUrl) URL.revokeObjectURL(modelUrl);
    setModelUrl(null);
    setFileName(null);
    setMeshes([]);
    setSelectedMeshes(new Set());
    setMeshMaterials({});
  }, [modelUrl]);

  const handleGeneratePhotoshoot = useCallback(async () => {
    if (!modelUrl) {
      toast.error("Upload a model first");
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    for (let i = 0; i < PHOTOSHOOT_STEPS.length; i++) {
      setProgressStep(PHOTOSHOOT_STEPS[i]);
      const target = Math.round(((i + 1) / PHOTOSHOOT_STEPS.length) * 100);
      for (let p = Math.round((i / PHOTOSHOOT_STEPS.length) * 100); p <= target; p += 2) {
        setProgress(p);
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    setProgress(100);
    setIsProcessing(false);
    toast.success("Photoshoot renders generated!");
  }, [modelUrl]);

  return (
    <>
      <Helmet>
        <title>CAD to Catalog | FormaNova</title>
        <meta name="description" content="Transform your 3D jewelry CAD models into professional product catalog images for e-commerce and marketing." />
        <link rel="canonical" href="/cad-to-catalog" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden bg-muted/30">
      {/* ── LEFT PANEL: Material Library ── */}
      <AnimatePresence>
        {leftPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-shrink-0 flex flex-col border-r border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden"
          >
            <MaterialLibrary
              selectedMesh={selectedMeshes.size > 0 ? Array.from(selectedMeshes)[0] : null}
              onApplyMaterial={handleApplyMaterial}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CENTER: Viewport ── */}
      <div className="flex-1 relative flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-card/60 backdrop-blur-sm z-10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xs font-light tracking-[4px] uppercase whitespace-nowrap">
              <span className="font-semibold text-primary">CAD</span> → Catalog
            </h1>
            {fileName && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/50 border border-border/30 min-w-0">
                <span className="text-[10px] text-foreground/70 truncate max-w-[160px]">{fileName}</span>
                <button
                  onClick={handleRemoveModel}
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              accept=".glb"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`text-xs gap-1.5 tracking-wider uppercase ${autoRotate ? 'bg-primary/10 border-primary/30' : ''}`}
            >
              <RotateCw className={`w-3.5 h-3.5 flex-shrink-0 ${autoRotate ? 'animate-spin' : ''}`} />
              Rotate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs gap-1.5 tracking-wider uppercase"
            >
              <Upload className="w-3.5 h-3.5 flex-shrink-0" />
              Upload GLB
            </Button>
            <Button
              size="sm"
              onClick={handleGeneratePhotoshoot}
              disabled={!modelUrl || isProcessing}
              className="text-xs gap-1.5 tracking-wider uppercase"
            >
              <Camera className="w-3.5 h-3.5 flex-shrink-0" />
              Generate Photoshoot
            </Button>
          </div>
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 relative">
          <StudioViewport
            modelUrl={modelUrl}
            meshMaterials={meshMaterials}
            onMeshesDetected={handleMeshesDetected}
            selectedMeshes={selectedMeshes}
            onMeshClick={handleMeshClick}
            isProcessing={isProcessing}
            progress={progress}
            progressStep={progressStep}
            autoRotate={autoRotate}
          />

          {/* Selection hint */}
          {modelUrl && selectedMeshes.size > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-card/70 backdrop-blur-sm border border-border/20">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                {selectedMeshes.size} mesh{selectedMeshes.size > 1 ? 'es' : ''} selected · Hold Shift to multi-select
              </span>
            </div>
          )}

          {/* Toggle buttons */}
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            className="absolute bottom-4 left-4 z-10 w-7 h-7 rounded-lg bg-card/60 backdrop-blur-sm border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {leftPanelOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="absolute bottom-4 right-4 z-10 w-7 h-7 rounded-lg bg-card/60 backdrop-blur-sm border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {rightPanelOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL: Mesh Inspector ── */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-shrink-0 border-l border-border/30 bg-card/80 backdrop-blur-sm overflow-y-auto scrollbar-thin"
          >
            <MeshInspector
              meshes={meshes}
              selectedMeshes={selectedMeshes}
              onSelectMesh={handleMeshClick}
              meshMaterials={meshMaterials}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
