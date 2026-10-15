import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Box, Check, ChevronLeft, ChevronRight, Diamond, RotateCcw, Ruler, X } from "lucide-react";
import { flattenMarkup, MARK_COLOUR, MIN_BRUSH, MAX_BRUSH } from "@/lib/design-markup";
import { blobToDataUrl } from "@/lib/design-image-run";
import { DESIGN_IMAGE_CREDITS, type DesignImageStartParams } from "@/lib/design-image-api";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { useDesignImageRun } from "@/hooks/useDesignImageRun";
import MarkupCanvas, { type MarkupTool } from "./MarkupCanvas";
import MarkupToolPanel from "./MarkupToolPanel";
import { MARKUP_TOOLS } from "./markup-tools";
import { useMarkupHistory } from "./useMarkupHistory";
import ViewsRow from "./ViewsRow";
import ReadyForCad from "./ReadyForCad";
import CreditTag from "./CreditTag";
import type { EditorPicture } from "./angle-suggestions";
import { toObjectUrl } from "./picture-urls";

interface Picture {
  /** Renderable, same-origin URL (blob:), so the picture can also be flattened on a canvas. */
  display: string;
  /** What is sent as the base for the next change: a data: URL or the run's artifact; null for the upload until needed. */
  input: ImageInput | null;
}

type Stage = "edit" | "ready";

const TITLES: Record<Stage, string> = { edit: "Edit design", ready: "Ready for CAD" };

interface DesignEditorProps {
  open: boolean;
  /** The uploaded picture to start from. */
  source: File | null;
  /** The customer's other uploads of the same piece. */
  extras?: File[];
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
  /** Admin-only model choice, shown beside Create CAD. */
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
  ["Ctrl Enter", "Looks right"], ["Esc", "Deselect, then close"],
];

const goldBtn = "flex h-12 items-center justify-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-50";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the picture"));
    img.src = src;
  });
}

/**
 * Edit before CAD, one decision at a time:
 *  edit   - the design, an optional markup toolbar and one composer. Each
 *           change replaces the picture (no version history). "Looks right"
 *           approves it.
 *  ready  - the approved design, optional extra views (other uploads
 *           come in marked as the old design), optional dimensions, Create CAD.
 */
export default function DesignEditor({ open, source, extras = [], jewelryType, onCancel, onKeep, onCreateCad, dimensions, onDimensions, cadCost, cadCostLoading, creatingCad, modelPicker }: DesignEditorProps) {
  const { generate } = useDesignImageRun();
  const [picture, setPicture] = useState<Picture | null>(null);
  const [edited, setEdited] = useState(false);
  /** Every result made in this session, so ‹ › can step back to an earlier one. */
  const [results, setResults] = useState<Picture[]>([]);
  const [resultIndex, setResultIndex] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkupTool>("select");
  const [brush, setBrush] = useState(5);
  const [colour, setColour] = useState(MARK_COLOUR);
  const [selected, setSelected] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [stage, setStage] = useState<Stage>("edit");
  const [approved, setApproved] = useState<EditorPicture | null>(null);
  const [angles, setAngles] = useState<EditorPicture[]>([]);
  /** A new approval starts the angles over. */
  const [approvalKey, setApprovalKey] = useState(0);
  const [viewsBusy, setViewsBusy] = useState(false);
  const history = useMarkupHistory();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const objectUrls = useRef<string[]>([]);

  // A fresh session for each picture opened.
  useEffect(() => {
    if (!open || !source) return;
    const url = URL.createObjectURL(source);
    objectUrls.current.push(url);
    setPicture({ display: url, input: null });
    setEdited(false);
    setResults([]);
    setResultIndex(0);
    setInstruction("");
    setLastSent("");
    setError(null);
    setTool("select");
    setSelected(null);
    setStage("edit");
    setApproved(null);
    setAngles([]);
    setViewsBusy(false);
    history.reset();
  }, [open, source]); // eslint-disable-line react-hooks/exhaustive-deps -- history.reset is stable; re-running on it would wipe a session mid-edit

  useEffect(() => () => { objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  // The change box grows with what is typed (up to ~6 lines, then scrolls),
  // so nothing the customer writes is hidden.
  useEffect(() => {
    const box = promptRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [instruction]);

  /** The prompt last sent: it stays in the box so it can be tweaked and sent again. */
  const [lastSent, setLastSent] = useState("");
  const hasChange = instruction.trim().length > 0 && instruction.trim() !== lastSent.trim();
  // "Looks right" only once a change has been made: the editor is for changing.
  const canApprove = !!picture && edited && !busy && !hasChange;
  const isDirty = edited || history.marks.length > 0 || hasChange;

  /** The last change sent, so Regenerate can ask for it again from the same starting picture. */
  const lastRequest = useRef<{ prompt: string; images: DesignImageStartParams["images"] } | null>(null);

  const run = useCallback(async (prompt: string, buildImages: () => Promise<DesignImageStartParams["images"]>) => {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const images = await buildImages();
      lastRequest.current = { prompt, images };
      const outcomes = await generate([{ prompt, images, jewelryType }]);
      if (!outcomes) return; // credits page opened, or the editor closed
      const outcome = outcomes[0];
      if (!("result" in outcome)) { setError("message" in outcome ? outcome.message : "We couldn't make that change. Please try again."); return; }
      const display = await toObjectUrl(outcome.result.image.url);
      objectUrls.current.push(display);
      const next = { display, input: outcome.result.image };
      setPicture(next);
      setResults((r) => { setResultIndex(r.length); return [...r, next]; });
      setEdited(true);
      setInstruction(prompt);
      setLastSent(prompt);
      history.reset();
      setTool("select");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't make that change. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [history, jewelryType, generate]);

  const send = useCallback(async () => {
    if (!picture || busy || !hasChange) return;
    await run(instruction, async () => {
      const base = picture.input ?? (source ? await blobToDataUrl(source) : null);
      if (!base) throw new Error("The picture is not ready yet");
      return history.marks.length > 0
        ? [{ role: "markup" as const, image: await blobToDataUrl(await flattenMarkup(await loadImage(picture.display), history.marks)) }]
        : [{ role: "base" as const, image: base }];
    });
  }, [picture, busy, hasChange, source, history, instruction, run]);

  /** Regenerate: the same change again, from the same starting picture. */
  const regenerate = useCallback(async () => {
    const last = lastRequest.current;
    if (!last || busy) return;
    await run(last.prompt, async () => last.images);
  }, [busy, run]);

  /** "Looks right": the picture showing becomes the approved design. */
  const looksRight = useCallback(() => {
    if (!canApprove || !picture) return;
    setApproved({ display: picture.display, input: picture.input, label: "Main" });
    setAngles([]);
    setApprovalKey((k) => k + 1);
    setSelected(null);
    setStage("ready");
  }, [canApprove, picture]);

  const showResult = (i: number) => {
    const r = results[i];
    if (!r || busy) return;
    setResultIndex(i);
    setPicture(r);
    history.reset();
    setSelected(null);
  };

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

  const goBack = () => { if (stage === "ready") setStage("edit"); };

  // Keyboard shortcuts, read through a ref so the listener never goes stale.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (helpOpen || confirmClose || stage !== "edit") return;
    const typing = !!(e.target as HTMLElement)?.closest?.("input, textarea, select");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") { e.preventDefault(); looksRight(); return; }
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
      <div className="relative h-14 w-14" aria-hidden="true">
        <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
        <Diamond className="absolute inset-0 m-auto h-6 w-6 text-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-4 font-display text-xl uppercase tracking-[0.08em] text-foreground">Making your change</p>
      <p className="mt-1 text-sm text-muted-foreground">This takes a few seconds.</p>
    </div>
  ) : null;

  const marks = history.marks.length;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-background/40 backdrop-blur-md" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Start in the change box, not on Cancel: no heavy focus box on open.
          onOpenAutoFocus={(e) => { e.preventDefault(); promptRef.current?.focus({ preventScroll: true }); }}
          onEscapeKeyDown={(e) => {
            if (confirmClose) { e.preventDefault(); setConfirmClose(false); return; }
            if (helpOpen) { e.preventDefault(); setHelpOpen(false); return; }
            if (selected !== null || tool !== "select") { e.preventDefault(); setSelected(null); setTool("select"); }
          }}
          className="fixed inset-0 z-[121] flex flex-col bg-background outline-none lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[min(700px,calc(100vh-48px))] lg:w-[min(1000px,calc(100vw-48px))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:border lg:border-border/60 lg:shadow-xl"
        >
          {/* Header: Cancel / Back left, title centre, Original or Close right */}
          <header className="grid h-14 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border/60 px-3 sm:px-5">
            <div>
              {stage === "edit" ? (
                <button type="button" onClick={requestClose} className="flex h-10 items-center gap-1.5 px-1 text-sm text-foreground hover:text-muted-foreground">
                  <X className="h-4 w-4" strokeWidth={1.5} /> Cancel
                </button>
              ) : (
                <button type="button" onClick={goBack} disabled={busy} className="flex h-10 items-center gap-1 px-1 text-sm text-foreground hover:text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} /> Back
                </button>
              )}
            </div>
            <DialogPrimitive.Title className="font-display text-xl uppercase tracking-[0.06em] text-foreground">{TITLES[stage]}</DialogPrimitive.Title>
            <div className="flex justify-end">
              {stage === "edit" && !edited && <span className="bg-muted px-2 py-0.5 text-xs text-muted-foreground">Original</span>}
              {stage !== "edit" && (
                <button type="button" onClick={requestClose} className="flex h-10 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground">
                  Close <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </header>

          {stage === "edit" && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* The design is the hero; the tools float over its left edge. */}
              <div className="relative min-h-[300px] flex-1 bg-muted/20 py-4 pl-16 pr-4 sm:pr-16">
                <MarkupCanvas
                  src={picture?.display ?? null}
                  alt={edited ? "Your edited design" : "Your original picture"}
                  marks={history.marks}
                  onCommit={history.commit}
                  tool={tool}
                  brush={brush}
                  colour={colour}
                  selected={selected}
                  onSelect={(i) => { setSelected(i); if (i !== null) setTool("select"); }}
                  disabled={busy}
                  overlay={busyOverlay}
                />
                <div className="absolute left-3 top-4 z-20">
                  <MarkupToolPanel
                    tool={tool}
                    onTool={(t) => { setTool(t); if (t !== "select") setSelected(null); }}
                    brush={brush}
                    onBrush={setBrush}
                    colour={colour}
                    onColour={setColour}
                    canUndo={history.canUndo}
                    canRedo={history.canRedo}
                    canClear={marks > 0}
                    onUndo={() => { history.undo(); setSelected(null); }}
                    onRedo={() => { history.redo(); setSelected(null); }}
                    onClear={() => { history.commit([]); setSelected(null); }}
                    disabled={busy}
                  />
                </div>
              </div>

              {/* Result bar under the picture: step through results on the left,
                  try again or accept on the right (accept is the main action). */}
              {edited && (
                <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-3 px-4 py-2.5 sm:px-6">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    {results.length > 1 && (
                      <>
                        <button type="button" onClick={() => showResult(resultIndex - 1)} disabled={busy || resultIndex === 0} aria-label="Previous result" className="flex h-8 w-8 items-center justify-center hover:text-foreground disabled:opacity-30"><ChevronLeft className="h-4 w-4" strokeWidth={1.5} /></button>
                        <span aria-live="polite" className="min-w-[2.5rem] text-center tabular-nums">{resultIndex + 1} / {results.length}</span>
                        <button type="button" onClick={() => showResult(resultIndex + 1)} disabled={busy || resultIndex === results.length - 1} aria-label="Next result" className="flex h-8 w-8 items-center justify-center hover:text-foreground disabled:opacity-30"><ChevronRight className="h-4 w-4" strokeWidth={1.5} /></button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void regenerate()}
                      disabled={busy}
                      title="Same change, new try"
                      className="flex h-9 items-center gap-2 border border-border px-3 text-sm text-foreground transition-colors hover:border-foreground/40 disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" strokeWidth={1} /> Regenerate <CreditTag value={DESIGN_IMAGE_CREDITS} />
                    </button>
                    <button
                      type="button"
                      onClick={looksRight}
                      disabled={!canApprove}
                      title={hasChange ? "Send your change first" : "Use this design (Ctrl Enter)"}
                      className="flex h-9 items-center gap-2 bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.5} /> Looks right
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-shrink-0 border-t border-border/60 px-3 pb-4 pt-3 sm:px-5">
                <div className="mx-auto max-w-[760px]">
                  {/* One line that grows (and can be dragged taller from its corner);
                      Send keeps its size, pinned bottom right, like a chat box. */}
                  <div className="flex items-end gap-2 border border-border/70 bg-background p-1.5 pl-3 transition-colors focus-within:border-foreground/40">
                    <label htmlFor="design-editor-change" className="sr-only">Describe what to change</label>
                    <textarea
                      id="design-editor-change"
                      ref={promptRef}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); void send(); } }}
                      rows={1}
                      disabled={busy}
                      placeholder={marks ? "Describe the change in the marked area…" : "Describe the change…"}
                      className="min-h-[36px] max-h-[240px] flex-1 resize-y overflow-y-auto bg-transparent py-2 text-[15px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={busy || !hasChange}
                      className="flex h-9 flex-shrink-0 items-center gap-2 bg-[hsl(var(--formanova-hero-accent))] px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
                    >
                      Send <ArrowRight className="h-4 w-4" strokeWidth={1.5} /> <CreditTag value={DESIGN_IMAGE_CREDITS} />
                    </button>
                  </div>
                  {edited && !busy && !hasChange && instruction.trim() && (
                    <p className="mt-2 text-xs text-muted-foreground">Change the text to send it again, or use Regenerate.</p>
                  )}
                  {marks > 0 && <p className="mt-2 text-xs text-muted-foreground">{marks} mark{marks > 1 ? "s" : ""} on the picture</p>}
                  {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
                </div>
              </div>
            </div>
          )}

          {stage === "ready" && approved && (
            <ReadyForCad
              approved={approved}
              views={
                <ViewsRow
                  key={approvalKey}
                  approved={approved}
                  resolveBase={resolveApprovedBase}
                  jewelryType={jewelryType}
                  extras={extras}
                  toObjectUrl={async (url) => { const u = await toObjectUrl(url); objectUrls.current.push(u); return u; }}
                  onChange={setAngles}
                  onBusy={setViewsBusy}
                />
              }
              jewelryType={jewelryType}
              dimensions={dimensions}
              onDimensions={onDimensions}
              cost={cadCost}
              costLoading={cadCostLoading}
              generating={creatingCad}
              waiting={viewsBusy}
              modelPicker={modelPicker}
              onGenerate={() => void picturesToFiles(approvedPictures).then(onCreateCad)}
            />
          )}

          {helpOpen && (
            <div role="dialog" aria-label="Keyboard shortcuts" className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 p-4" onClick={() => setHelpOpen(false)}>
              <div className="w-full max-w-sm border border-border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-xl uppercase tracking-wide">Keyboard shortcuts</h2>
                  <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
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
                <p className="mt-1 text-sm text-muted-foreground">Your changes and marks will be lost. Your uploaded picture stays as it was.</p>
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
