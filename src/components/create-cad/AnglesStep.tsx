import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Diamond, Plus, RotateCcw, X } from "lucide-react";
import { useDesignImageRun, type DesignImageOutcome } from "@/hooks/useDesignImageRun";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { DESIGN_IMAGE_CREDITS, MAX_DESIGN_VIEW_CHARS } from "@/lib/design-image-api";
import { ANGLE_SUGGESTIONS, MAX_ANGLES, type EditorPicture } from "./angle-suggestions";
import CreditTag from "./CreditTag";

type SlotStatus = "idle" | "making" | "ready" | "mismatch" | "failed";

interface Slot {
  view: string;
  shows: string;
  ticked: boolean;
  /** The customer's own words for this angle (optional), sent with it. */
  extra: string;
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
  /** The angles that are ready, whenever that changes. */
  onReady: (angles: EditorPicture[]) => void;
  /** Every ticked angle is made and matches: on to Create CAD. */
  onContinue: (angles: EditorPicture[]) => void;
}

const goldBtn = "flex h-12 items-center justify-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-50";
const lineBtn = "flex h-11 items-center justify-center gap-2 border border-border px-5 text-sm text-foreground hover:border-foreground/40 disabled:opacity-50";
const smallBtn = "flex h-7 items-center gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50";

function Spinner() {
  return (
    <div className="relative h-10 w-10" aria-hidden="true">
      <div className="h-full w-full animate-spin rounded-full border-[3px] border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
      <Diamond className="absolute inset-0 m-auto h-1/3 w-1/3 text-foreground" strokeWidth={1.5} />
    </div>
  );
}

/**
 * Add reference angles: the approved design from other sides, so the CAD gets
 * hidden parts right. Four suggested views for the piece (none ticked), each
 * with optional words of its own, plus the customer's own angle. Five
 * pictures in total at most: the design and four angles. Each angle is made
 * from the approved picture and checked against it.
 */
export default function AnglesStep({ approved, resolveBase, jewelryType, toObjectUrl, onReady, onContinue }: AnglesStepProps) {
  const { generate } = useDesignImageRun();
  const [slots, setSlots] = useState<Slot[]>(() =>
    ANGLE_SUGGESTIONS[jewelryType ?? "ring"].map((a) => ({ ...a, ticked: false, extra: "", status: "idle" as const })),
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
    const requests = indexes.map((i) => ({ prompt: slots[i].extra.trim(), images: [{ role: "base" as const, image: base }], view: slots[i].view, jewelryType }));
    const outcomes = await generate(requests, { onOutcome: (k, outcome) => void land(indexes[k], outcome) });
    // Not started (credits page opened): put the slots back as they were.
    if (outcomes === null) setSlots((s) => s.map((x, i) => (indexes.includes(i) && x.status === "making" ? { ...x, status: "idle" } : x)));
  }, [resolveBase, slots, jewelryType, generate, land]);

  const tickedCount = slots.filter((s) => s.ticked).length;
  const roomLeft = tickedCount < MAX_ANGLES;

  const addCustom = () => {
    const view = custom.trim();
    if (!view || !roomLeft) return;
    setSlots((s) => [...s, { view, shows: "Your angle", ticked: true, extra: "", status: "idle" }]);
    setCustom("");
  };

  const selectAll = () => setSlots((s) => {
    let room = MAX_ANGLES - s.filter((x) => x.ticked).length;
    return s.map((x) => (!x.ticked && x.status === "idle" && room > 0 ? (room--, { ...x, ticked: true }) : x));
  });

  const toMake = slots.map((s, i) => (s.ticked && (s.status === "idle" || s.status === "failed") ? i : -1)).filter((i) => i >= 0);
  const making = slots.some((s) => s.status === "making");
  const mismatched = slots.some((s) => s.ticked && s.status === "mismatch");
  const ready = slots.filter((s) => s.ticked && s.status === "ready" && s.picture).map((s) => ({ ...s.picture!, label: s.view }));
  const allSelected = !slots.some((s) => !s.ticked && s.status === "idle") || !roomLeft;

  // Tell the editor what is ready, and move on by itself once every ticked
  // angle has been made and matches.
  const readyKey = ready.map((r) => r.display).join("|");
  useEffect(() => { onReady(ready); }, [readyKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the pictures, not the array identity
  const wasMaking = useRef(false);
  useEffect(() => {
    if (wasMaking.current && !making && toMake.length === 0 && !mismatched && ready.length > 0) onContinue(ready);
    wasMaking.current = making;
  }, [making]); // eslint-disable-line react-hooks/exhaustive-deps -- only on a batch finishing

  const note = making
    ? "Making your angles…"
    : mismatched ? "Redo or remove the angle that doesn't match"
    : toMake.length ? `${toMake.length} selected · ${tickedCount + 1} of ${MAX_ANGLES + 1} pictures with your design`
    : ready.length ? `${ready.length} angle${ready.length > 1 ? "s" : ""} ready`
    : "Pick one, several or all";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:gap-8">
        <section className="min-w-0 flex-1">
          <h2 className="font-display text-lg uppercase tracking-[0.06em] text-foreground">Choose angles to make</h2>
          <p className="mt-1 text-sm text-muted-foreground">More views help the CAD get the hidden parts right.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {slots.map((slot, i) => {
              const editable = slot.status === "idle" || slot.status === "failed";
              const canTick = slot.ticked || roomLeft;
              return (
                <div key={i} className={`flex flex-col border transition-colors ${slot.status === "mismatch" ? "border-amber-600/60" : slot.ticked ? "border-[hsl(var(--formanova-hero-accent))]" : "border-border"}`}>
                  <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/20">
                    {slot.picture ? (
                      <img src={slot.picture.display} alt={`${slot.view} view`} className={`h-full w-full object-contain ${slot.status === "mismatch" ? "opacity-60" : ""}`} />
                    ) : (
                      <img src={approved.display} alt="" aria-hidden="true" className="h-full w-full object-contain opacity-15 grayscale" />
                    )}
                    {!slot.picture && slot.status !== "making" && <span className="absolute inset-x-2 bottom-2 text-center text-[11px] leading-tight text-muted-foreground">{slot.shows}</span>}
                    {slot.status === "making" && (
                      <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 text-center backdrop-blur-sm">
                        <Spinner />
                        <p className="text-xs text-muted-foreground">Making {slot.view}</p>
                      </div>
                    )}
                    {slot.status === "ready" && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-emerald-700 text-white" title="Matches your design"><Check className="h-3 w-3" strokeWidth={2} /></span>}
                  </div>
                  <div className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2">
                    {editable ? (
                      <label className={`flex items-center gap-2 text-sm font-medium text-foreground ${canTick ? "" : "opacity-50"}`}>
                        <input type="checkbox" checked={slot.ticked} disabled={!canTick || making} onChange={(e) => update(i, { ticked: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--formanova-hero-accent))]" />
                        <span className="truncate">{slot.view}</span>
                      </label>
                    ) : (
                      <span className="truncate text-sm font-medium text-foreground">{slot.view}</span>
                    )}
                    {editable && slot.ticked && (
                      <input
                        value={slot.extra}
                        onChange={(e) => update(i, { extra: e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS) })}
                        aria-label={`Anything specific for the ${slot.view} view (optional)`}
                        placeholder="Anything specific?"
                        className="h-8 w-full border border-border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60"
                      />
                    )}
                    {slot.note && <p className={`text-xs leading-snug ${slot.status === "failed" ? "text-destructive" : "text-amber-700"}`}>{slot.note}</p>}
                    {(slot.status === "mismatch" || slot.status === "ready") && (
                      <div className="-ml-1.5 flex gap-1">
                        <button type="button" onClick={() => void make([i])} disabled={making} className={smallBtn} title={`Make it again · ${DESIGN_IMAGE_CREDITS} credits`}><RotateCcw className="h-3 w-3" strokeWidth={1.5} /> Redo</button>
                        <button type="button" onClick={() => update(i, { status: "idle", picture: undefined, note: undefined, ticked: false })} disabled={making} className={smallBtn}><X className="h-3 w-3" strokeWidth={1.5} /> Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-shrink-0 flex-col gap-3 lg:w-[280px] lg:border-l lg:border-border lg:pl-8">
          <div>
            <h3 className="text-sm font-medium text-foreground">Custom angle <span className="font-normal text-muted-foreground">(optional)</span></h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Describe any other view you need.</p>
          </div>
          <label htmlFor="custom-angle" className="sr-only">Custom angle</label>
          <textarea
            id="custom-angle"
            value={custom}
            onChange={(e) => setCustom(e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCustom(); } }}
            disabled={!roomLeft || making}
            rows={3}
            placeholder={roomLeft ? "e.g. the back, the underside, a close-up of the setting" : `Up to ${MAX_ANGLES} angles (${MAX_ANGLES + 1} pictures with your design). Untick one to add your own.`}
            className="w-full resize-none border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60 disabled:opacity-60"
          />
          <button type="button" onClick={addCustom} disabled={!roomLeft || !custom.trim() || making} className={lineBtn}><Plus className="h-4 w-4" strokeWidth={1.5} /> Add angle</button>
          <button type="button" onClick={selectAll} disabled={allSelected || making} className={lineBtn}>Select all angles</button>
        </aside>
      </div>

      <footer className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:px-5">
        <span className="flex-1 text-center text-xs text-muted-foreground sm:text-left" aria-live="polite">{note}</span>
        {toMake.length > 0 ? (
          <button type="button" onClick={() => void make(toMake)} disabled={making} className={goldBtn}>
            Generate {toMake.length === 1 ? "1 angle" : `${toMake.length} angles`} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            <CreditTag value={toMake.length * DESIGN_IMAGE_CREDITS} />
          </button>
        ) : ready.length > 0 && (
          <button type="button" onClick={() => onContinue(ready)} disabled={making || mismatched} className={goldBtn}>
            Continue <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </footer>
    </>
  );
}
