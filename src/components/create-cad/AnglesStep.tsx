import { useCallback, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Diamond, Info, Plus, RotateCcw, X } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useDesignImageRun, type DesignImageOutcome } from "@/hooks/useDesignImageRun";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { MAX_DESIGN_VIEW_CHARS } from "@/lib/design-image-api";
import { ANGLE_SUGGESTIONS, DEFAULT_TICKED, MAX_ANGLES, type EditorPicture } from "./angle-suggestions";

type SlotStatus = "idle" | "making" | "ready" | "mismatch" | "failed";

interface Slot {
  view: string;
  shows: string;
  ticked: boolean;
  status: SlotStatus;
  picture?: EditorPicture;
  /** Why it doesn't match, or why it failed. */
  note?: string;
}

interface AnglesStepProps {
  approved: EditorPicture;
  /** The approved picture as something the toolkit accepts as a base. */
  resolveBase: () => Promise<ImageInput>;
  jewelryType: CadJewelryType | null;
  toObjectUrl: (url: string) => Promise<string>;
  onBack: () => void;
  onContinue: (angles: EditorPicture[]) => void;
}

const goldBtn = "flex h-12 items-center justify-center gap-2 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-6 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:opacity-50";
const lineBtn = "flex h-12 items-center justify-center gap-2 border border-border px-5 text-sm text-foreground hover:border-foreground/40 disabled:opacity-50";
const smallBtn = "flex h-7 items-center gap-1 border border-border bg-background px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground hover:border-foreground/40 disabled:opacity-50";

function Spinner({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <div className="h-full w-full animate-spin rounded-full border-4 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
      <Diamond className="absolute inset-0 m-auto h-1/3 w-1/3 text-foreground" strokeWidth={1.8} />
    </div>
  );
}

/**
 * Add more angles: the approved design from other sides, so the CAD gets
 * hidden parts right. Four suggestions for the piece (three ticked); any can
 * be swapped for the customer's own angle. Each angle is made from the
 * approved picture and checked against it.
 */
export default function AnglesStep({ approved, resolveBase, jewelryType, toObjectUrl, onBack, onContinue }: AnglesStepProps) {
  const { generate } = useDesignImageRun();
  const [slots, setSlots] = useState<Slot[]>(() =>
    ANGLE_SUGGESTIONS[jewelryType ?? "ring"].map((a, i) => ({ ...a, ticked: i < DEFAULT_TICKED, status: "idle" as const })),
  );
  const [custom, setCustom] = useState("");

  const update = (index: number, patch: Partial<Slot>) => setSlots((s) => s.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  const land = useCallback(async (index: number, outcome: DesignImageOutcome) => {
    if (!("result" in outcome)) {
      update(index, { status: "failed", note: "message" in outcome ? outcome.message : "Couldn't make this angle." });
      return;
    }
    try {
      const display = await toObjectUrl(outcome.result.image.url);
      const picture: EditorPicture = { display, input: outcome.result.image, label: "" };
      const mismatch = outcome.result.consistent === false;
      update(index, {
        status: mismatch ? "mismatch" : "ready",
        picture,
        note: mismatch ? outcome.result.drift[0] ?? "It doesn't match the approved design." : undefined,
      });
    } catch {
      update(index, { status: "failed", note: "Couldn't load this angle." });
    }
  }, [toObjectUrl]);

  const make = useCallback(async (indexes: number[]) => {
    if (indexes.length === 0) return;
    let base: ImageInput;
    try { base = await resolveBase(); } catch { return; }
    setSlots((s) => s.map((x, i) => (indexes.includes(i) ? { ...x, status: "making", note: undefined } : x)));
    const requests = indexes.map((i) => ({ prompt: "", images: [{ role: "base" as const, image: base }], view: slots[i].view, jewelryType }));
    const outcomes = await generate(requests, { onOutcome: (k, outcome) => void land(indexes[k], outcome) });
    // Not started (credits page opened): put the slots back as they were.
    if (outcomes === null) setSlots((s) => s.map((x, i) => (indexes.includes(i) && x.status === "making" ? { ...x, status: "idle" } : x)));
  }, [resolveBase, slots, jewelryType, generate, land]);

  const addCustom = () => {
    const view = custom.trim();
    if (!view) return;
    const free = slots.findIndex((s) => !s.ticked && s.status === "idle");
    if (free < 0) return;
    update(free, { view, shows: "Your angle", ticked: true });
    setCustom("");
  };

  const toMake = slots.map((s, i) => (s.ticked && (s.status === "idle" || s.status === "failed") ? i : -1)).filter((i) => i >= 0);
  const making = slots.some((s) => s.status === "making");
  const mismatched = slots.some((s) => s.ticked && s.status === "mismatch");
  const ready = slots.filter((s) => s.ticked && s.status === "ready" && s.picture).map((s) => ({ ...s.picture!, label: s.view }));
  const roomForCustom = slots.some((s) => !s.ticked && s.status === "idle");
  const note = making ? "Making your angles…" : mismatched ? "Redo or remove the angle that doesn't match" : toMake.length ? `${toMake.length} angle${toMake.length > 1 ? "s" : ""} to make · 5 credits each` : ready.length ? `${ready.length} angle${ready.length > 1 ? "s" : ""} ready` : "Tick the angles you want";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:flex-row">
        <aside className="flex-shrink-0 lg:w-[280px] lg:border lg:border-border lg:p-4">
          <h2 className="text-[15px] font-semibold text-foreground">Your approved design</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Every angle is made from this exact design.</p>
          <div className="relative mt-3 border-2 border-[hsl(var(--formanova-hero-accent))]">
            <img src={approved.display} alt="Approved design" className="aspect-square w-full object-cover" />
            <span className="absolute left-2 top-2 flex items-center gap-1 bg-background px-2 py-0.5 text-xs"><Check className="h-3 w-3 text-emerald-700" /> Approved</span>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="flex items-start gap-2 bg-[hsl(var(--formanova-hero-accent)/0.08)] px-3 py-2.5 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--formanova-hero-accent))]" />
            <span><span className="font-medium">Optional:</span> more angles help the CAD get hidden parts right. We suggest these {MAX_ANGLES}. Untick any you don't need, or swap one for your own angle.</span>
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {slots.map((slot, i) => (
              <div key={i} className={`flex flex-col border ${slot.ticked ? "border-[hsl(var(--formanova-hero-accent))]" : "border-border"} ${slot.status === "mismatch" ? "border-amber-600/60" : ""}`}>
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/30">
                  {slot.picture ? (
                    <img src={slot.picture.display} alt={`${slot.view} view`} className={`h-full w-full object-cover ${slot.status === "mismatch" ? "opacity-60" : ""}`} />
                  ) : (
                    <img src={approved.display} alt="" aria-hidden="true" className="h-full w-full object-cover opacity-15 grayscale" />
                  )}
                  {!slot.picture && slot.status !== "making" && <span className="absolute inset-x-2 bottom-2 text-center text-xs text-muted-foreground">{slot.shows}</span>}
                  {slot.status === "making" && (
                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 text-center backdrop-blur-sm">
                      <Spinner />
                      <p className="text-xs text-muted-foreground">Making {slot.view}<br />a few seconds</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    {(slot.status === "idle" || slot.status === "failed") ? (
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground">
                        <input type="checkbox" checked={slot.ticked} onChange={(e) => update(i, { ticked: e.target.checked })} className="h-4 w-4 accent-foreground" />
                        <span className="truncate">{slot.view}</span>
                      </label>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{slot.view}</span>
                    )}
                    {slot.status === "ready" && <span className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> Matches</span>}
                    {slot.status === "making" && <span className="text-xs text-muted-foreground">Making…</span>}
                    {(slot.status === "idle" || slot.status === "failed") && <button type="button" onClick={() => void make([i])} disabled={making} className={smallBtn}>Make 1</button>}
                  </div>
                  {slot.note && <p className={`text-xs leading-snug ${slot.status === "failed" ? "text-destructive" : "text-amber-700"}`}>{slot.note}</p>}
                  {(slot.status === "mismatch" || slot.status === "ready") && (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => void make([i])} disabled={making} className={smallBtn}><RotateCcw className="h-3 w-3" /> Redo</button>
                      <button type="button" onClick={() => update(i, { status: "idle", picture: undefined, note: undefined, ticked: false })} disabled={making} className={smallBtn}><X className="h-3 w-3" /> Remove</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <label htmlFor="custom-angle" className="sr-only">Other angle</label>
            <input
              id="custom-angle"
              value={custom}
              onChange={(e) => setCustom(e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              disabled={!roomForCustom}
              placeholder={roomForCustom ? 'Other angle? e.g. "looking at the crest side"' : `Up to ${MAX_ANGLES} angles. Untick one to add your own.`}
              className="h-11 min-w-0 flex-1 border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60 disabled:opacity-60"
            />
            <button type="button" onClick={addCustom} disabled={!roomForCustom || !custom.trim()} className={`${lineBtn} h-11`}><Plus className="h-4 w-4" /> Add</button>
          </div>
        </main>
      </div>

      <footer className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-3 py-3 sm:flex-row sm:items-center sm:px-5">
        <button type="button" onClick={onBack} disabled={making} className={lineBtn}><ArrowLeft className="h-4 w-4" /> Back to editing</button>
        <span className="flex-1 text-center text-xs text-muted-foreground" aria-live="polite">{note}</span>
        {toMake.length > 0 && (
          <button type="button" onClick={() => void make(toMake)} disabled={making} className={toMake.length && !ready.length ? goldBtn : lineBtn}>
            Make {toMake.length} angle{toMake.length > 1 ? "s" : ""}
            <span className="inline-flex items-center gap-1"><img src={creditCoinIcon} alt="" className="h-4 w-4" /><span className="font-mono text-sm">{toMake.length * 5}</span></span>
          </button>
        )}
        {(ready.length > 0 || toMake.length === 0) && (
          <button type="button" onClick={() => onContinue(ready)} disabled={making || mismatched} className={goldBtn}>
            {ready.length ? "Continue" : "Skip angles"} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </footer>
    </>
  );
}
