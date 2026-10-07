import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Check, Diamond, MousePointerClick, RotateCcw, Send, X } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { flattenMarkup, MIN_BRUSH, MAX_BRUSH, type Mark } from "@/lib/design-markup";
import { blobToDataUrl } from "@/lib/design-image-run";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { useDesignImageRun } from "@/hooks/useDesignImageRun";
import MarkupCanvas, { type MarkupTool } from "./MarkupCanvas";
import MarkupToolPanel from "./MarkupToolPanel";
import { MARKUP_TOOLS } from "./markup-tools";
import { useMarkupHistory } from "./useMarkupHistory";
import AnglesStep from "./AnglesStep";
import ReadyForCad from "./ReadyForCad";
import type { EditorPicture } from "./angle-suggestions";
import { toObjectUrl } from "./picture-urls";

interface Version {
  /** Renderable, same-origin URL (blob:), so the picture can also be flattened on a canvas. */
  display: string;
  /** What is sent as the base for the next change: a data: URL or the run's artifact. */
  input: ImageInput | null;
  note: string;
  /** How it was made (absent for the original): rerun as-is to redo it. */
  request?: { prompt: string; images: { role: "base" | "markup"; image: ImageInput }[] };
}

type Stage = "edit" | "angles" | "ready";

interface DesignEditorProps {
  open: boolean;
  /** The uploaded picture to start from. */
  source: File | null;
  jewelryType: CadJewelryType | null;
  /** Closed before approving: the page keeps its upload as it was. */
  onCancel: () => void;
  /** Closed after approving: the page keeps the approved pictures (main first). */
  onKeep: (files: File[]) => void;
  /** Generate CAD from the approved pictures (main first) and the dimensions. */
  onCreateCad: (files: File[]) => void;
  dimensions: string;
  onDimensions: (text: string) => void;
  cadCost: number | null;
  cadCostLoading: boolean;
  /** Admin-only model choice, shown beside Generate CAD. */
  modelPicker?: ReactNode;
  creatingCad: boolean;
}

async function picturesToFiles(pictures: EditorPicture[]): Promise<File[]> {
  return Promise.all(pictures.map(async (p, i) => {
    const blob = await (await fetch(p.display)).blob();
    const slug = p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const name = i === 0 ? "edited-design.png" : `edited-design-${slug || i}.png`;
    return new File([blob], name, { type: blob.type || "image/png" });
  }));
}

const SHORTCUTS: [string, string][] = [
  ...MARKUP_TOOLS.map(({ key, name }) => [key, name] as [string, string]),
  ["[  ]", "Smaller / bigger brush"], ["Ctrl Z", "Undo"], ["Ctrl Shift Z", "Redo"], ["Delete", "Delete the selected mark"],
  ["/", "Type a change"], ["Enter", "Send the change"], ["Shift Enter", "New line"],
  ["← →", "Previous / next version"], ["Ctrl Enter", "Make it CAD"], ["Esc", "Deselect, then close"],
];


function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the picture"));
    img.src = src;
  });
}

/**
 * Edit before CAD, in one window:
 *  edit   - change the uploaded design by describing it, optionally marking
 *           where; each change makes a new version. Once there is a new
 *           version: "Add more angles" or "Make it CAD".
 *  angles - optional extra angles of the approved version.
 *  ready  - the approved pictures, optional dimensions, Generate CAD.
 */
export default function DesignEditor({ open, source, jewelryType, onCancel, onKeep, onCreateCad, dimensions, onDimensions, cadCost, cadCostLoading, creatingCad, modelPicker }: DesignEditorProps) {
  const { generate } = useDesignImageRun();
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkupTool>("select");
  const [brush, setBrush] = useState(5);
  const [selected, setSelected] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [stage, setStage] = useState<Stage>("edit");
  /** The version the customer approved; until then the next steps stay hidden. */
  const [approvedIndex, setApprovedIndex] = useState<number | null>(null);
  // The canvas hint shows for a few seconds when the editor opens or the tool changes.
  const [hintShown, setHintShown] = useState(true);
  useEffect(() => {
    if (!open) return;
    setHintShown(true);
    const timer = setTimeout(() => setHintShown(false), 4000);
    return () => clearTimeout(timer);
  }, [open, tool, stage]);
  const [approved, setApproved] = useState<EditorPicture | null>(null);
  const [angles, setAngles] = useState<EditorPicture[]>([]);
  const history = useMarkupHistory();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const objectUrls = useRef<string[]>([]);

  // A fresh session for each picture opened.
  useEffect(() => {
    if (!open || !source) return;
    const url = URL.createObjectURL(source);
    objectUrls.current.push(url);
    setVersions([{ display: url, input: null, note: "" }]);
    setCurrent(0);
    setInstruction("");
    setError(null);
    setTool("select");
    setSelected(null);
    setStage("edit");
    setApprovedIndex(null);
    setApproved(null);
    setAngles([]);
    history.reset();
  }, [open, source]); // eslint-disable-line react-hooks/exhaustive-deps -- history.reset is stable; re-running on it would wipe a session mid-edit

  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const shown = versions[current];
  const hasChange = instruction.trim().length > 0;
  const canApprove = versions.length > 1 && !busy && !hasChange;
  const isApproved = approvedIndex !== null && approvedIndex === current;
  /** The original is not a version: it is "Original", edits are V1, V2... */
  const versionLabel = (i: number) => (i === 0 ? "Original" : `V${i}`);
  const isDirty = versions.length > 1 || history.marks.length > 0 || hasChange;

  /** Make one new version from a request; true when it was added. */
  const runRequest = useCallback(async (request: NonNullable<Version["request"]>, note: string) => {
    setBusy(true);
    setError(null);
    setSelected(null);
    setApprovedIndex(null);
    try {
      const outcomes = await generate([{ prompt: request.prompt, images: request.images, jewelryType }]);
      if (!outcomes) return false; // credits page opened, or the editor closed
      const outcome = outcomes[0];
      if (!("result" in outcome)) { setError("message" in outcome ? outcome.message : "We couldn't make that change. Please try again."); return false; }
      const display = await toObjectUrl(outcome.result.image.url);
      objectUrls.current.push(display);
      setVersions((v) => {
        const next = [...v, { display, input: outcome.result.image, note, request }];
        setCurrent(next.length - 1);
        return next;
      });
      return true;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't make that change. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [jewelryType, generate]);

  const send = useCallback(async () => {
    if (!shown || busy || !hasChange) return;
    let images: NonNullable<Version["request"]>["images"];
    try {
      const base = shown.input ?? (source ? await blobToDataUrl(source) : null);
      if (!base) throw new Error("The picture is not ready yet");
      images = history.marks.length > 0
        ? [{ role: "markup", image: await blobToDataUrl(await flattenMarkup(await loadImage(shown.display), history.marks)) }]
        : [{ role: "base", image: base }];
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't make that change. Please try again.");
      return;
    }
    if (await runRequest({ prompt: instruction, images }, instruction.trim())) {
      setInstruction("");
      history.reset();
      setTool("select");
    }
  }, [shown, busy, hasChange, source, history, instruction, runRequest]);

  /** Redo the version showing: the same request from the same starting picture, as a new version. */
  const redo = useCallback(() => {
    if (!shown?.request || busy) return;
    void runRequest(shown.request, shown.note);
  }, [shown, busy, runRequest]);

  /** Approve the version showing and move on: angles first, or straight to CAD. */
  const approve = useCallback((next: "angles" | "ready") => {
    if (!canApprove || !shown || !isApproved) return;
    setApproved({ display: shown.display, input: shown.input, label: "Main" });
    setAngles([]);
    setSelected(null);
    setStage(next);
  }, [canApprove, shown, isApproved]);

  const resolveApprovedBase = useCallback(async (): Promise<ImageInput> => {
    if (approved?.input) return approved.input;
    if (source) return blobToDataUrl(source);
    throw new Error("The picture is not ready yet");
  }, [approved, source]);

  const approvedPictures = approved ? [approved, ...angles] : [];

  const requestClose = () => {
    // After approving, closing keeps the approved pictures on the page.
    if (stage !== "edit" && approved) { void picturesToFiles(approvedPictures).then(onKeep); return; }
    if (isDirty) setConfirmClose(true); else onCancel();
  };

  // Keyboard shortcuts, read through a ref so the listener never goes stale.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (helpOpen || confirmClose || stage !== "edit") return;
    const typing = !!(e.target as HTMLElement)?.closest?.("input, textarea, select");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      if (isApproved) approve("ready"); else if (canApprove && current > 0) setApprovedIndex(current);
      return;
    }
    if (typing || busy) return;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) history.redo(); else history.undo(); setSelected(null); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); history.redo(); setSelected(null); return; }
    if (mod || e.altKey) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
      e.preventDefault();
      history.commit(history.marks.filter((_, i) => i !== selected));
      setSelected(null);
      return;
    }
    if (e.key === "?") { setHelpOpen(true); return; }
    if (e.key === "/") { e.preventDefault(); promptRef.current?.focus(); return; }
    if (e.key === "ArrowLeft") { setCurrent((c) => Math.max(0, c - 1)); history.reset(); return; }
    if (e.key === "ArrowRight") { setCurrent((c) => Math.min(versions.length - 1, c + 1)); history.reset(); return; }
    if (e.key === "[") { setBrush((b) => Math.max(MIN_BRUSH, b - 1)); return; }
    if (e.key === "]") { setBrush((b) => Math.min(MAX_BRUSH, b + 1)); return; }
    const match = MARKUP_TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
    if (match) { setTool(match.id); if (match.id !== "select") setSelected(null); }
  };
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const busyOverlay = busy ? (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/40 text-center backdrop-blur-sm">
      <div className="relative h-16 w-16" aria-hidden="true">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
        <Diamond className="absolute inset-0 m-auto h-7 w-7 text-foreground" strokeWidth={1.8} />
      </div>
      <p className="mt-4 font-display text-xl uppercase tracking-[0.08em] text-foreground">Making your new version</p>
      <p className="mt-1 text-sm text-muted-foreground">This takes a few seconds.</p>
    </div>
  ) : null;

  const hint = (
    <span
      aria-hidden={!hintShown}
      className={`pointer-events-none absolute bottom-3 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-2 bg-foreground/85 px-3 py-1.5 text-xs text-background transition-opacity duration-500 ${hintShown ? "opacity-100" : "opacity-0"}`}
    >
      <MousePointerClick className="h-3.5 w-3.5 flex-shrink-0" />
      {tool === "select" ? "Optional: use a tool on the left to mark the area you want to change." : `Optional: ${MARKUP_TOOLS.find((t) => t.id === tool)?.hint.toLowerCase()}`}
    </span>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-background/40 backdrop-blur-md" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (confirmClose) { e.preventDefault(); setConfirmClose(false); return; }
            if (helpOpen) { e.preventDefault(); setHelpOpen(false); return; }
            if (selected !== null || tool !== "select") { e.preventDefault(); setSelected(null); setTool("select"); }
          }}
          className="fixed inset-0 z-[121] flex flex-col bg-background outline-none lg:inset-6 lg:mx-auto lg:max-w-[1180px] lg:border lg:border-border lg:shadow-2xl"
        >
          {/* Header: Cancel left, title centre, shortcuts right */}
          <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
            <button type="button" onClick={requestClose} className="flex h-10 items-center gap-2 px-2 text-sm text-foreground hover:text-muted-foreground">
              <X className="h-4 w-4" /> {stage === "edit" ? "Cancel" : "Close"}
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <DialogPrimitive.Title className="font-display text-xl uppercase tracking-[0.06em] text-foreground">{stage === "edit" ? "Edit design" : stage === "angles" ? "More angles" : "Ready for CAD"}</DialogPrimitive.Title>
              {stage === "angles" && <span className="bg-muted px-2 py-0.5 text-xs text-muted-foreground">Optional</span>}
              {stage === "edit" && versions.length > 0 && (
                <span className="bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {current === 0 ? "Original" : `V${current} of ${versions.length - 1}`}
                </span>
              )}
            </div>
            <span className="w-[88px] flex-shrink-0" aria-hidden="true" />
          </header>

          {stage === "angles" && approved && (
            <AnglesStep
              approved={approved}
              resolveBase={resolveApprovedBase}
              jewelryType={jewelryType}
              toObjectUrl={async (url) => { const u = await toObjectUrl(url); objectUrls.current.push(u); return u; }}
              onBack={() => setStage("edit")}
              onContinue={(ready) => { setAngles(ready); setStage("ready"); }}
            />
          )}
          {stage === "ready" && approved && (
            <ReadyForCad
              pictures={approvedPictures}
              jewelryType={jewelryType}
              dimensions={dimensions}
              onDimensions={onDimensions}
              cost={cadCost}
              costLoading={cadCostLoading}
              generating={creatingCad}
              modelPicker={modelPicker}
              onBack={() => setStage(angles.length ? "angles" : "edit")}
              onGenerate={() => void picturesToFiles(approvedPictures).then(onCreateCad)}
            />
          )}
          {stage === "edit" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:flex-row">
            <aside className="flex-shrink-0 lg:w-[280px] lg:border lg:border-border lg:p-4">
              <MarkupToolPanel
                tool={tool}
                onTool={(t) => { setTool(t); if (t !== "select") setSelected(null); }}
                brush={brush}
                onBrush={setBrush}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                canClear={history.marks.length > 0}
                onUndo={() => { history.undo(); setSelected(null); }}
                onRedo={() => { history.redo(); setSelected(null); }}
                onClear={() => { history.commit([]); setSelected(null); }}
                disabled={busy}
              />
            </aside>

            <main className="flex min-w-0 flex-1 flex-col gap-3">

              <div className="h-[46vh] min-h-[260px] border border-border lg:h-auto lg:min-h-0 lg:flex-1">
                <MarkupCanvas
                  src={shown?.display ?? null}
                  alt={shown ? (current === 0 ? "Your original picture" : `Design version ${current}`) : "Design"}
                  marks={history.marks}
                  onCommit={history.commit}
                  tool={tool}
                  brush={brush}
                  selected={selected}
                  onSelect={(i) => { setSelected(i); if (i !== null) setTool("select"); }}
                  disabled={busy}
                  overlay={busyOverlay}
                  hint={hint}
                />
              </div>

              <div>
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1">
                    <label htmlFor="design-editor-change" className="sr-only">Describe what to change</label>
                    <textarea
                      id="design-editor-change"
                      ref={promptRef}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); void send(); } }}
                      rows={1}
                      disabled={busy}
                      placeholder={history.marks.length ? "Describe what to change in the marked area, e.g. make it an oval sapphire" : "Describe what to change, e.g. make the centre stone oval"}
                      className="min-h-[48px] w-full resize-none border border-border bg-background py-3 px-4 text-[15px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60 disabled:opacity-60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || !hasChange}
                    className="flex h-12 flex-shrink-0 items-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-7 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" strokeWidth={1.5} /> Send
                    <span className="ml-1 inline-flex items-center gap-1.5 border-l border-background/30 pl-3"><img src={creditCoinIcon} alt="" className="h-4 w-4" /><span className="font-mono text-sm">5</span></span>
                  </button>
                </div>
                {history.marks.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {history.marks.length} mark{history.marks.length > 1 ? "s" : ""} on the picture
                  </p>
                )}
                {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Versions</h3>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {versions.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setCurrent(i); history.reset(); setSelected(null); }}
                        disabled={busy}
                        aria-current={i === current}
                        className="w-20 flex-shrink-0 text-left disabled:opacity-60"
                      >
                        <img src={v.display} alt="" className={`aspect-square w-full object-cover ${i === current ? "border-2 border-[hsl(var(--formanova-hero-accent))]" : "border border-border"}`} />
                        <span className="mt-1 block text-xs font-medium text-foreground">{versionLabel(i)}</span>
                        {i > 0 && <span title={v.note} className="block truncate text-[11px] leading-tight text-muted-foreground">{v.note}</span>}
                      </button>
                    ))}
                    {busy && (
                      <div className="flex aspect-square w-20 flex-shrink-0 items-center justify-center border border-dashed border-border" aria-hidden="true">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
                      </div>
                    )}
                  </div>
                </div>
                {current > 0 && !isApproved && (
                  <div className="flex flex-shrink-0 gap-2 sm:w-[300px]">
                    <button
                      type="button"
                      onClick={redo}
                      disabled={busy || !shown?.request}
                      title={`Make ${versionLabel(current)} again from the same picture`}
                      className="flex h-12 items-center justify-center gap-2 border border-border px-4 text-sm text-foreground transition-colors hover:border-foreground/40 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" strokeWidth={1.5} /> Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovedIndex(current)}
                      disabled={!canApprove}
                      title={hasChange ? "Send your change first" : "Use this version (Ctrl Enter)"}
                      className="flex h-12 flex-1 items-center justify-center gap-2 bg-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.5} /> Approve {versionLabel(current)}
                    </button>
                  </div>
                )}
                {isApproved && (
                  <div className="flex flex-shrink-0 flex-col gap-2 sm:w-[300px]">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.5} /> {versionLabel(current)} approved ·
                      <button type="button" onClick={() => setApprovedIndex(null)} className="underline underline-offset-2 hover:text-foreground">Change</button>
                    </p>
                    <button
                      type="button"
                      onClick={() => approve("angles")}
                      disabled={!canApprove}
                      className="flex h-12 items-center justify-center border border-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-[hsl(var(--formanova-hero-accent))] transition-colors hover:bg-[hsl(var(--formanova-hero-accent)/0.06)] disabled:opacity-50"
                    >
                      Add more angles
                    </button>
                    <button
                      type="button"
                      onClick={() => approve("ready")}
                      disabled={!canApprove}
                      title="Make it CAD (Ctrl Enter)"
                      className="flex h-12 items-center justify-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Make it CAD <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                      <span className="inline-flex items-center gap-1.5 border-l border-background/30 pl-3"><img src={creditCoinIcon} alt="" className="h-4 w-4" /><span className="font-mono text-sm">{cadCostLoading ? "…" : cadCost ?? "—"}</span></span>
                    </button>
                  </div>
                )}
              </div>
            </main>
          </div>

          )}

          {helpOpen && (
            <div role="dialog" aria-label="Keyboard shortcuts" className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 p-4" onClick={() => setHelpOpen(false)}>
              <div className="w-full max-w-sm border border-border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-xl uppercase tracking-wide">Keyboard shortcuts</h2>
                  <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {SHORTCUTS.flatMap(([k, v]) => [
                    <dt key={k} className="font-mono text-xs"><span className="border border-border px-1.5 py-0.5">{k}</span></dt>,
                    <dd key={`${k}-d`} className="text-muted-foreground">{v}</dd>,
                  ])}
                </dl>
              </div>
            </div>
          )}
          {confirmClose && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 p-4">
              <div className="w-full max-w-sm border border-border bg-background p-5 shadow-lg">
                <h2 id="discard-title" className="font-display text-xl uppercase tracking-wide text-foreground">Discard your edits?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your new versions and marks will be lost. Your uploaded picture stays as it was.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" autoFocus onClick={() => setConfirmClose(false)} className="h-10 border border-border px-4 text-sm text-foreground hover:border-foreground/40">Keep editing</button>
                  <button type="button" onClick={() => { setConfirmClose(false); onCancel(); }} className="h-10 bg-foreground px-4 text-sm text-background hover:opacity-90">Discard</button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

    </DialogPrimitive.Root>
  );
}
