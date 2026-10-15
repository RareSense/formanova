import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Diamond, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { useDesignImageRun, type DesignImageOutcome } from "@/hooks/useDesignImageRun";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { DESIGN_IMAGE_CREDITS, MAX_DESIGN_VIEW_CHARS } from "@/lib/design-image-api";
import { ANGLE_SUGGESTIONS, MAX_ANGLES, type EditorPicture } from "./angle-suggestions";
import AngleGlyph from "./AngleGlyph";
import CreditTag from "./CreditTag";

type SlotStatus = "idle" | "making" | "ready" | "mismatch" | "failed";

interface Slot {
  view: string;
  shows: string;
  /** "make": we draw it from the design (paid). "upload": the customer's own picture (free). */
  source: "make" | "upload";
  /** The customer's own words for this angle (optional), sent with it. */
  extra: string;
  status: SlotStatus;
  /** The customer said this view looks right (uploads are accepted as they are). */
  accepted: boolean;
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
  /** Every angle is ready and matches: on to Create CAD. */
  onContinue: (angles: EditorPicture[]) => void;
}

const goldBtn = "flex h-12 items-center justify-center gap-3 whitespace-nowrap bg-[hsl(var(--formanova-hero-accent))] px-5 font-display text-[15px] uppercase tracking-[0.06em] text-background transition-opacity hover:opacity-90 disabled:opacity-50";
const linkBtn = "text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-50";

function Spinner() {
  return (
    <div className="relative h-10 w-10" aria-hidden="true">
      <div className="h-full w-full animate-spin rounded-full border-[3px] border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
      <Diamond className="absolute inset-0 m-auto h-1/3 w-1/3 text-foreground" strokeWidth={1} />
    </div>
  );
}

/**
 * Add views: the same five-slot row as the upload step. Slot one is the
 * approved design; each empty slot opens a chooser (a suggested view for the
 * piece, the customer's own described view, or their own picture such as a
 * technical drawing). Described and suggested views are drawn from the design
 * and checked against it; uploaded pictures are used as they are, for free.
 */
export default function AnglesStep({ approved, resolveBase, jewelryType, toObjectUrl, onReady, onContinue }: AnglesStepProps) {
  const { generate } = useDesignImageRun();
  const suggestions = ANGLE_SUGGESTIONS[jewelryType ?? "ring"];
  const [slots, setSlots] = useState<Slot[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [custom, setCustom] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrls = useRef<string[]>([]);
  useEffect(() => () => { uploadUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const update = (index: number, patch: Partial<Slot>) => setSlots((s) => s.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const roomLeft = slots.length < MAX_ANGLES;
  const unused = suggestions.filter((a) => !slots.some((s) => s.source === "make" && s.view === a.view));

  const add = (slot: Slot) => {
    setSlots((s) => (s.length < MAX_ANGLES ? [...s, slot] : s));
    setChoosing(false);
  };
  const addSuggested = (view: string, shows: string) => add({ view, shows, source: "make", extra: "", status: "idle", accepted: false });
  const addCustom = () => {
    const view = custom.trim();
    if (!view) return;
    add({ view, shows: "Your view", source: "make", extra: "", status: "idle", accepted: false });
    setCustom("");
  };
  const addUploads = (files: FileList | null) => {
    const room = MAX_ANGLES - slots.length;
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, room);
    const added = picked.map((f) => {
      const display = URL.createObjectURL(f);
      uploadUrls.current.push(display);
      return { view: "Your picture", shows: f.name, source: "upload" as const, extra: "", status: "ready" as const, accepted: true, picture: { display, input: null, label: "Your picture" } };
    });
    if (added.length) setSlots((s) => [...s, ...added].slice(0, MAX_ANGLES));
    setChoosing(false);
  };
  const fillSuggested = () => setSlots((s) => {
    const free = suggestions.filter((a) => !s.some((x) => x.source === "make" && x.view === a.view));
    return [...s, ...free.map((a) => ({ ...a, source: "make" as const, extra: "", status: "idle" as const, accepted: false }))].slice(0, MAX_ANGLES);
  });

  const land = useCallback(async (index: number, outcome: DesignImageOutcome) => {
    if (!("result" in outcome)) {
      update(index, { status: "failed", note: "message" in outcome ? outcome.message : "Couldn't make this view." });
      return;
    }
    try {
      const display = await toObjectUrl(outcome.result.image.url);
      const picture: EditorPicture = { display, input: outcome.result.image, label: "" };
      const mismatch = outcome.result.consistent === false;
      update(index, {
        accepted: false,
        status: mismatch ? "mismatch" : "ready",
        picture,
        note: mismatch ? outcome.result.drift[0] ?? "It doesn't match the approved design." : undefined,
      });
    } catch {
      update(index, { status: "failed", note: "Couldn't load this view." });
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

  const toMake = slots.map((s, i) => (s.source === "make" && (s.status === "idle" || s.status === "failed") ? i : -1)).filter((i) => i >= 0);
  const toReview = slots.filter((s) => (s.status === "ready" || s.status === "mismatch") && !s.accepted).length;
  const making = slots.some((s) => s.status === "making");
  const ready = slots.filter((s) => s.status === "ready" && s.picture).map((s) => ({ ...s.picture!, label: s.view }));

  // Tell the editor what is ready, and move on by itself once every view has
  // been made and matches.
  const readyKey = ready.map((r) => r.display).join("|");
  useEffect(() => { onReady(ready); }, [readyKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the pictures, not the array identity

  const note = making
    ? "Making your views…"
    : toReview ? `Check ${toReview === 1 ? "the new view" : `the ${toReview} new views`}: Looks right or Regenerate`
    : `${slots.length + 1} of ${MAX_ANGLES + 1} pictures`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="font-display text-lg uppercase tracking-[0.06em] text-foreground">Add views</h2>
            <p className="mt-1 text-sm text-muted-foreground">More views help the CAD get the hidden parts right. Optional.</p>
          </div>
          <button type="button" onClick={fillSuggested} disabled={!roomLeft || unused.length === 0 || making} className={linkBtn}>
            Fill with suggested views
          </button>
        </div>

        <ol className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          <li className="flex flex-col border border-foreground/30">
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted/20">
              <img src={approved.display} alt="Your design" className="h-full w-full object-contain" />
            </div>
            <span className="border-t border-border/60 px-3 py-3 text-sm font-medium text-foreground">Your design</span>
          </li>

          {slots.map((slot, i) => {
            const editable = slot.source === "make" && (slot.status === "idle" || slot.status === "failed" || (slot.status !== "making" && !slot.accepted));
            return (
              <li key={i} className={`flex flex-col border ${slot.status === "mismatch" ? "border-amber-600/60" : "border-[hsl(var(--formanova-hero-accent))]"}`}>
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/20">
                  {slot.picture ? (
                    <img src={slot.picture.display} alt={`${slot.view} view`} className={`h-full w-full object-contain ${slot.status === "mismatch" ? "opacity-60" : ""}`} />
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-3 text-center">
                      <AngleGlyph view={slot.view} className="h-12 w-12 text-foreground/70" />
                      <span className="text-[11px] leading-tight text-muted-foreground">{slot.shows}</span>
                    </div>
                  )}
                  {slot.status === "making" && (
                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 text-center backdrop-blur-sm">
                      <Spinner />
                      <p className="text-xs text-muted-foreground">Making {slot.view}</p>
                    </div>
                  )}
                  {slot.status === "ready" && slot.source === "make" && <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-emerald-700 text-white" title="Matches your design"><Check className="h-3 w-3" strokeWidth={2} /></span>}
                  {!making && (
                    <button type="button" onClick={() => setSlots((s) => s.filter((_, k) => k !== i))} aria-label={`Remove ${slot.view}`} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center border border-border/60 bg-background/90 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" strokeWidth={1} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-3">
                  <span className="text-sm font-medium leading-snug text-foreground">{slot.view}</span>
                  {editable && (
                    <input
                      value={slot.extra}
                      onChange={(e) => update(i, { extra: e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS) })}
                      aria-label={`Anything specific for the ${slot.view} view (optional)`}
                      placeholder="Anything specific? (optional)"
                      className="h-9 w-full border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60"
                    />
                  )}
                  {slot.note && <p className={`text-xs leading-snug ${slot.status === "failed" ? "text-destructive" : "text-amber-700"}`}>{slot.note}</p>}
                  {slot.source === "make" && (slot.status === "mismatch" || slot.status === "ready") && (
                    slot.accepted ? (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-700"><Check className="h-3 w-3" strokeWidth={1.5} /> Looks right</span>
                    ) : (
                      <div className="flex flex-col gap-2 pt-1">
                        <button type="button" onClick={() => void make([i])} disabled={making} className="flex h-9 w-full items-center justify-center gap-1.5 border border-border text-sm text-foreground hover:border-foreground/40 disabled:opacity-50" title={`Make it again · ${DESIGN_IMAGE_CREDITS} credits`}>
                          <RotateCcw className="h-3 w-3" strokeWidth={1} /> Regenerate
                        </button>
                        <button type="button" onClick={() => update(i, { accepted: true })} disabled={making} className="flex h-9 w-full items-center justify-center gap-1.5 bg-foreground text-sm text-background hover:opacity-90 disabled:opacity-50">
                          <Check className="h-3 w-3" strokeWidth={1.5} /> Looks right
                        </button>
                      </div>
                    )
                  )}
                </div>
              </li>
            );
          })}

          {Array.from({ length: MAX_ANGLES - slots.length }, (_, k) => (
            <li key={`empty-${k}`}>
              <button
                type="button"
                onClick={() => setChoosing(true)}
                disabled={making}
                aria-expanded={k === 0 ? choosing : undefined}
                className={`flex aspect-square w-full flex-col items-center justify-center gap-2 border border-dashed text-sm transition-colors disabled:opacity-50 ${k === 0 && choosing ? "border-[hsl(var(--formanova-hero-accent))] text-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
              >
                <Plus className="h-5 w-5" strokeWidth={1} /> Add view
              </button>
            </li>
          ))}
        </ol>

        {choosing && roomLeft && (
          <section aria-label="Choose a view" className="mt-4 border border-border/70 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Choose a view</h3>
              <button type="button" onClick={() => setChoosing(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" strokeWidth={1} /></button>
            </div>
            {unused.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {unused.map((a) => (
                  <button key={a.view} type="button" onClick={() => addSuggested(a.view, a.shows)} className="flex items-center gap-3 border border-border/70 px-3 py-2.5 text-left hover:border-foreground/40">
                    <AngleGlyph view={a.view} className="h-8 w-8 flex-shrink-0 text-foreground/70" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{a.view}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{a.shows}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="flex items-stretch border border-border/70 focus-within:border-foreground/40">
                <label htmlFor="custom-angle" className="sr-only">Describe your own view</label>
                <input
                  id="custom-angle"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                  placeholder="Describe your own view, e.g. the underside"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <button type="button" onClick={addCustom} disabled={!custom.trim()} className="border-l border-border/70 px-4 text-sm text-foreground disabled:opacity-40">Add</button>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-3 border border-border/70 px-3 py-2.5 text-left hover:border-foreground/40">
                <ImagePlus className="h-5 w-5 flex-shrink-0 text-foreground/70" strokeWidth={1} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">Upload your own picture <span className="font-normal text-muted-foreground">· free</span></span>
                  <span className="block text-xs leading-snug text-muted-foreground">A technical drawing with sizes, a sketch or another photo</span>
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addUploads(e.target.files); e.target.value = ""; }} />
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:px-6">
        <span className="text-sm text-muted-foreground" aria-live="polite">{note}</span>
        {toMake.length > 0 ? (
          <button type="button" onClick={() => void make(toMake)} disabled={making} className={goldBtn}>
            Make {toMake.length === 1 ? "1 view" : `${toMake.length} views`} <ArrowRight className="h-4 w-4" strokeWidth={1} />
            <CreditTag value={toMake.length * DESIGN_IMAGE_CREDITS} />
          </button>
        ) : (
          <button type="button" onClick={() => onContinue(ready)} disabled={making || toReview > 0 || ready.length === 0} className={goldBtn}>
            Continue <ArrowRight className="h-4 w-4" strokeWidth={1} />
          </button>
        )}
      </div>
    </div>
  );
}
