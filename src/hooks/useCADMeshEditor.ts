import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { CADCanvasHandle, CanvasSnapshot, MeshTransformData } from "@/components/text-to-cad/CADCanvas";
import type { MeshItemData } from "@/components/text-to-cad/types";

export interface UndoEntry {
  label: string;
  meshes: MeshItemData[];
  canvasSnapshot: CanvasSnapshot | null;
}

interface MeshEditorParams {
  canvasRef: React.RefObject<CADCanvasHandle>;
  transformMode: string;
  setTransformMode: (mode: string) => void;
}

export function useCADMeshEditor({ canvasRef, transformMode, setTransformMode }: MeshEditorParams) {
  const [meshes, setMeshes] = useState<MeshItemData[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [selectedTransform, setSelectedTransform] = useState<MeshTransformData | null>(null);

  const meshesRef = useRef<MeshItemData[]>(meshes);
  meshesRef.current = meshes;
  const wireframeRef = useRef(false);
  const clipboardRef = useRef<string[]>([]);
  const pendingSelectRef = useRef<Set<string> | null>(null);
  const preTransformSnapshotRef = useRef<UndoEntry | null>(null);
  const numericUndoRef = useRef<{ snapshot: UndoEntry; timer: ReturnType<typeof setTimeout> } | null>(null);
  const selectionWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const pushUndoEntry = useCallback((label: string, entry: UndoEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }, []);

  const pushUndo = useCallback((label: string) => {
    const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
    const snap = canvasRef.current?.getSnapshot() ?? null;
    pushUndoEntry(label, { label, meshes: currentMeshes, canvasSnapshot: snap });
  }, [canvasRef, pushUndoEntry]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      setRedoStack((r) => [...r, { label: last.label, meshes: currentMeshes, canvasSnapshot: snap }]);
      setMeshes(last.meshes);
      if (last.canvasSnapshot) canvasRef.current?.restoreSnapshot(last.canvasSnapshot);
      return prev.slice(0, -1);
    });
  }, [canvasRef]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      setUndoStack((u) => [...u, { label: last.label, meshes: currentMeshes, canvasSnapshot: snap }]);
      setMeshes(last.meshes);
      if (last.canvasSnapshot) canvasRef.current?.restoreSnapshot(last.canvasSnapshot);
      return prev.slice(0, -1);
    });
  }, [canvasRef]);

  const handleTransformStart = useCallback(() => {
    const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
    const snap = canvasRef.current?.getSnapshot() ?? null;
    preTransformSnapshotRef.current = { label: `Transform (${transformMode})`, meshes: currentMeshes, canvasSnapshot: snap };
  }, [canvasRef, transformMode]);

  const handleTransformEnd = useCallback(() => {
    if (preTransformSnapshotRef.current) {
      pushUndoEntry(preTransformSnapshotRef.current.label, preTransformSnapshotRef.current);
      preTransformSnapshotRef.current = null;
    }
    setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
  }, [canvasRef, pushUndoEntry]);

  const handleNumericTransformChange = useCallback((axis: 'x' | 'y' | 'z', property: 'position' | 'rotation' | 'scale', value: number) => {
    if (!numericUndoRef.current) {
      const currentMeshes = meshesRef.current.map((m) => ({ ...m }));
      const snap = canvasRef.current?.getSnapshot() ?? null;
      const label = `Numeric ${property}`;
      numericUndoRef.current = {
        snapshot: { label, meshes: currentMeshes, canvasSnapshot: snap },
        timer: setTimeout(() => {
          if (numericUndoRef.current) {
            pushUndoEntry(numericUndoRef.current.snapshot.label, numericUndoRef.current.snapshot);
            numericUndoRef.current = null;
          }
        }, 800),
      };
    } else {
      clearTimeout(numericUndoRef.current.timer);
      numericUndoRef.current.timer = setTimeout(() => {
        if (numericUndoRef.current) {
          pushUndoEntry(numericUndoRef.current.snapshot.label, numericUndoRef.current.snapshot);
          numericUndoRef.current = null;
        }
      }, 800);
    }
    canvasRef.current?.setMeshTransform(axis, property, value);
    requestAnimationFrame(() => {
      setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
    });
  }, [canvasRef, pushUndoEntry]);

  const showSelectionWarning = useCallback((msg: string) => {
    setSelectionWarning(msg);
    if (selectionWarningTimer.current) clearTimeout(selectionWarningTimer.current);
    selectionWarningTimer.current = setTimeout(() => setSelectionWarning(null), 3000);
  }, []);

  useEffect(() => {
    setSelectedTransform(canvasRef.current?.getSelectedTransform() ?? null);
  }, [canvasRef, selectedMeshNames]);

  const handleApplyMaterial = useCallback((matId: string) => {
    if (selectedNames.length === 0) { showSelectionWarning("Select meshes first, then apply a material"); return; }
    pushUndo("Apply material");
    canvasRef.current?.applyMaterial(matId, selectedNames);
  }, [canvasRef, selectedNames, pushUndo, showSelectionWarning]);

  const handleApplyMetalToAll = useCallback((matId: string) => {
    pushUndo("Apply metal to all");
    const count = canvasRef.current?.applyMetalToAll(matId) ?? 0;
    if (count === 0) showSelectionWarning("No metal parts to update");
  }, [canvasRef, pushUndo, showSelectionWarning]);

  const handleSelectMesh = useCallback((name: string, multi: boolean) => {
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
  }, []);

  const handleMeshesDetected = useCallback((detected: { name: string; verts: number; faces: number }[]) => {
    setMeshes((prev) => {
      const prevMap = new Map(prev.map(m => [m.name, m]));
      return detected.map((d) => {
        const existing = prevMap.get(d.name);
        return { ...d, visible: existing?.visible ?? true, selected: existing?.selected ?? false };
      });
    });
  }, []);

  const handleMeshAction = useCallback((action: string) => {
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
  }, [pushUndo]);

  const handleSceneAction = useCallback((action: string) => {
    const names = selectedNames;
    switch (action) {
      case "set-mode-translate": setTransformMode("translate"); break;
      case "set-mode-rotate": setTransformMode("rotate"); break;
      case "set-mode-scale": setTransformMode("scale"); break;
      case "reset-transform":
        pushUndo("Reset transform");
        canvasRef.current?.resetTransform(names.length ? names : meshesRef.current.map((m) => m.name));
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
      case "duplicate": {
        if (!names.length) { showSelectionWarning("Select meshes first"); return; }
        pushUndo("Duplicate meshes");
        const existingNames = new Set(meshesRef.current.map(m => m.name));
        const dupNames = new Set<string>();
        names.forEach(n => {
          let finalName = `${n}_copy`;
          let suffix = 2;
          while (existingNames.has(finalName) || dupNames.has(finalName)) finalName = `${n}_copy_${suffix++}`;
          dupNames.add(finalName);
        });
        pendingSelectRef.current = dupNames;
        canvasRef.current?.duplicateMeshes(names);
        break;
      }
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
      case "wireframe-on": canvasRef.current?.setWireframe(true); break;
      case "wireframe-off": canvasRef.current?.setWireframe(false); break;
      default: break;
    }
  }, [canvasRef, selectedNames, pushUndo, showSelectionWarning, setTransformMode]);

  const toggleWireframe = useCallback(() => {
    wireframeRef.current = !wireframeRef.current;
    canvasRef.current?.setWireframe(wireframeRef.current);
  }, [canvasRef]);

  const handleCopy = useCallback(() => {
    const names = meshesRef.current.filter(m => m.selected).map(m => m.name);
    if (names.length) clipboardRef.current = names;
  }, []);

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current.length) return;
    pushUndo("Paste meshes");
    canvasRef.current?.duplicateMeshes(clipboardRef.current);
  }, [canvasRef, pushUndo]);

  const handleCut = useCallback(() => {
    const names = meshesRef.current.filter(m => m.selected).map(m => m.name);
    if (!names.length) return;
    clipboardRef.current = names;
    pushUndo("Cut meshes");
    canvasRef.current?.deleteMeshes(names);
    setMeshes((prev) => prev.filter((m) => !names.includes(m.name)));
  }, [canvasRef, pushUndo]);

  const resetMeshEditor = useCallback(() => {
    setMeshes([]);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    meshes, setMeshes,
    undoStack, redoStack,
    selectedMeshNames, hiddenMeshNames, selectedNames,
    meshesRef, wireframeRef,
    selectedTransform, setSelectedTransform,
    selectionWarning, setSelectionWarning,
    pushUndo,
    handleUndo, handleRedo,
    handleTransformStart, handleTransformEnd,
    handleNumericTransformChange,
    handleSelectMesh, handleMeshesDetected,
    handleMeshAction, handleSceneAction,
    handleApplyMaterial,
    handleApplyMetalToAll,
    handleCopy, handlePaste, handleCut,
    toggleWireframe,
    resetMeshEditor,
  };
}
