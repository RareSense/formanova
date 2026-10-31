/**
 * The 3D view of Catalog from CAD: hosts CatalogEngine's canvas, the drop area
 * before any file is open, an "Opening…" overlay, and the view tools
 * (zoom, undo / redo, fit: the vertical strip the other CAD pages use). The engine lives as long as this component.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Diamond, Loader2 } from 'lucide-react';
import { ViewportSideTools } from '@/components/text-to-cad/ViewportOverlays';
import { CatalogEngine } from './engine/engine';
import { useEngineState } from './useEngineState';
import { entriesFromDrop, entriesFromInput, type FileEntry } from './engine/package';

interface Props {
  onEngine: (engine: CatalogEngine | null) => void;
  onFiles: (entries: FileEntry[]) => void;
  /** Text shown over the view while a file opens. */
  busy: string | null;
  /** Shooting: the view is locked so the camera stays where each angle puts it. */
  locked: boolean;
  /** Phones: the strip hugs the top-right corner, as on the other CAD pages. */
  compact?: boolean;
  children?: ReactNode;
}

export default function CatalogViewer({ onEngine, onFiles, busy, locked, compact = false, children }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [engine, setEngine] = useState<CatalogEngine | null>(null);
  const [hot, setHot] = useState(false);
  const state = useEngineState(engine);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;

  useEffect(() => {
    const e = new CatalogEngine(host.current!);
    setEngine(e);
    onEngineRef.current(e);
    return () => {
      onEngineRef.current(null);
      e.dispose();
    };
  }, []);

  useEffect(() => {
    if (engine) engine.controls.enabled = !locked;
  }, [engine, locked]);

  const hasModel = state.parts.length > 0;
  return (
    <div
      className="relative h-full w-full min-h-0 bg-muted/20"
      onDragOver={(e) => { e.preventDefault(); setHot(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHot(false); }}
      onDrop={async (e) => { e.preventDefault(); setHot(false); onFiles(await entriesFromDrop(e.dataTransfer)); }}
    >
      <div ref={host} className="absolute inset-0" aria-label="3D view of the piece" />

      {!hasModel && !busy && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <label className={`pointer-events-auto cursor-pointer flex flex-col items-center gap-3 px-10 py-10 border border-dashed bg-card/80 text-center transition-colors ${hot ? 'border-formanova-hero-accent bg-card' : 'border-border'}`}>
            <Diamond className="h-9 w-9 text-primary" />
            <span className="font-display text-xl uppercase tracking-wide">Drop your CAD files here</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">3DM · GLB · STEP · OBJ · STL · PLY — one or many, or a folder</span>
            <span className="mt-1 px-6 py-2.5 bg-formanova-hero-accent text-primary-foreground font-mono text-[11px] uppercase tracking-[0.2em]">Choose files</span>
            <input ref={input} type="file" multiple hidden onChange={(e) => { onFiles(entriesFromInput(e.target.files || [])); e.target.value = ''; }} />
          </label>
        </div>
      )}

      {/* Hidden while shooting: the camera is the shoot's then. */}
      <ViewportSideTools
        visible={hasModel && !locked}
        compact={compact}
        onZoomIn={() => engine?.zoom(0.25)}
        onZoomOut={() => engine?.zoom(-0.25)}
        onResetView={() => engine?.fit()}
        onUndo={() => engine?.undo()}
        onRedo={() => engine?.redo()}
        undoCount={state.canUndo ? 1 : 0}
        redoCount={state.canRedo ? 1 : 0}
      />

      {hasModel && (
        <div className="absolute top-12 left-2 z-10 max-w-[45%] truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground bg-card/80 px-2 py-1 border border-border" title={state.fileName}>
          {state.fileName}
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60" role="status" aria-live="polite">
          <div className="flex items-center gap-3 px-5 py-3 bg-card border border-border font-mono text-[11px] uppercase tracking-[0.15em]">
            <Loader2 className="w-4 h-4 animate-spin text-formanova-hero-accent" />
            {busy}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
