import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Diamond, RotateCcw, X } from "lucide-react";
import { useDesignImageRun, type DesignImageOutcome } from "@/hooks/useDesignImageRun";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { DESIGN_IMAGE_CREDITS, MAX_DESIGN_VIEW_CHARS } from "@/lib/design-image-api";
import { ANGLE_SUGGESTIONS, type EditorPicture } from "./angle-suggestions";
import AngleGlyph from "./AngleGlyph";
import CreditTag from "./CreditTag";

type Status = "idle" | "making" | "review" | "ok" | "failed";

interface Card {
  view: string;
  shows: string;
  ticked: boolean;
  /** The customer's own words for this angle (optional). */
  extra: string;
  status: Status;
  picture?: EditorPicture;
  note?: string;
}

interface AnglesCardsProps {
  approved: EditorPicture;
  resolveBase: () => Promise<ImageInput>;
  jewelryType: CadJewelryType | null;
  toObjectUrl: (url: string) => Promise<string>;
  /** How many angle cards fit (five pictures in all). */
  room: number;
  /** Accepted angles, whenever that changes. */
  onChange: (angles: EditorPicture[]) => void;
  onBusy?: (busy: boolean) => void;
  /** How many angles are ticked but not made, or made but not checked (not part of the CAD yet). */
  onPending?: (count: number) => void;
  /** Each change unticks those angles (Create CAD was pressed). */
  clearToken?: number;
}

const smallBtn = "flex h-8 items-center justify-center gap-1 border border-border px-2 text-xs text-foreground transition-colors hover:border-foreground/40 disabled:opacity-40";

/**
 * Optional angles: one row of equal cards, the approved design first. Each
 * angle has a tick box and its own optional words; Generate makes the ticked
 * ones, and each result is checked on its card (Looks right or ↻).
 */
export default function AnglesCards({ approved, resolveBase, jewelryType, toObjectUrl, room, onChange, onBusy, onPending, clearToken = 0 }: AnglesCardsProps) {
  const { generate } = useDesignImageRun();
  const [cards, setCards] = useState<Card[]>(() =>
    ANGLE_SUGGESTIONS[jewelryType ?? "ring"].slice(0, Math.max(0, room)).map((a) => ({ ...a, ticked: false, extra: "", status: "idle" as const })),
  );
  const patch = (i: number, p: Partial<Card>) => setCards((c) => c.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const land = useCallback(async (i: number, outcome: DesignImageOutcome) => {
    if (!("result" in outcome)) { patch(i, { status: "failed", note: "message" in outcome ? outcome.message : "Couldn't make this angle." }); return; }
    try {
      const display = await toObjectUrl(outcome.result.image.url);
      patch(i, { status: "review", picture: { display, input: outcome.result.image, label: "" }, note: outcome.result.consistent === false ? outcome.result.drift[0] ?? "It may not match your design." : undefined });
    } catch { patch(i, { status: "failed", note: "Couldn't load this angle." }); }
  }, [toObjectUrl]);

  const make = useCallback(async (indexes: number[]) => {
    if (!indexes.length) return;
    let base: ImageInput;
    try { base = await resolveBase(); } catch {
      setCards((c) => c.map((x, k) => (indexes.includes(k) ? { ...x, status: "failed", note: "Your design isn't ready yet. Please try again." } : x)));
      return;
    }
    setCards((c) => c.map((x, k) => (indexes.includes(k) ? { ...x, status: "making", note: undefined } : x)));
    const requests = indexes.map((k) => ({ prompt: cards[k].extra.trim(), images: [{ role: "base" as const, image: base }], view: cards[k].view, jewelryType }));
    let outcomes: DesignImageOutcome[] | null;
    try {
      outcomes = await generate(requests, { onOutcome: (n, o) => void land(indexes[n], o) });
    } catch {
      // The credit check itself failed: without this the cards stayed
      // "making" forever, and Create CAD waited for them forever.
      setCards((c) => c.map((x, k) => (indexes.includes(k) && x.status === "making" ? { ...x, status: "failed", note: "We couldn't check your credits. Please try again." } : x)));
      return;
    }
    if (outcomes === null) setCards((c) => c.map((x, k) => (indexes.includes(k) && x.status === "making" ? { ...x, status: "idle" } : x)));
  }, [resolveBase, cards, jewelryType, generate, land]);

  const toMake = cards.map((c, k) => (c.ticked && (c.status === "idle" || c.status === "failed") ? k : -1)).filter((k) => k >= 0);
  const busy = cards.some((c) => c.status === "making");
  const accepted = cards.filter((c) => c.status === "ok" && c.picture).map((c) => ({ ...c.picture!, label: c.view }));
  const key = accepted.map((a) => a.display).join("|");
  useEffect(() => { onChange(accepted); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the pictures
  useEffect(() => { onBusy?.(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps -- report changes only
  const pending = cards.filter((c) => (c.ticked && (c.status === "idle" || c.status === "failed")) || c.status === "review").length;
  useEffect(() => { onPending?.(pending); }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps -- report changes only
  // Gone mid-make (Back, or a new approval): the editor must not keep waiting for these cards.
  const reporters = useRef({ onBusy, onPending });
  reporters.current = { onBusy, onPending };
  useEffect(() => () => { reporters.current.onBusy?.(false); reporters.current.onPending?.(0); }, []);
  // Create CAD unticks what is not part of the CAD; accepted angles stay.
  useEffect(() => {
    if (!clearToken) return;
    setCards((c) => c.map((x) => (x.status === "review" ? { ...x, status: "idle", picture: undefined, ticked: false, note: undefined } : x.status === "idle" || x.status === "failed" ? { ...x, ticked: false } : x)));
  }, [clearToken]);

  return (
    <section aria-label="Angles" className="w-full">
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <li className="flex flex-col">
          <div className="relative aspect-square overflow-hidden border border-foreground/40 bg-muted/20">
            <img src={approved.display} alt="Your design" className="h-full w-full object-contain" />
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-emerald-700 text-white"><Check className="h-3 w-3" strokeWidth={2} /></span>
          </div>
          <span className="mt-2 text-sm font-medium text-foreground">Your design</span>
        </li>
        {cards.map((c, i) => {
          const editable = c.status === "idle" || c.status === "failed";
          return (
            <li key={c.view} className="flex flex-col">
              <div className={`relative aspect-square overflow-hidden border bg-muted/20 ${c.status === "review" ? "border-[hsl(var(--formanova-hero-accent))]" : c.ticked ? "border-foreground/40" : "border-border/60"}`}>
                {c.picture ? (
                  <img src={c.picture.display} alt={`${c.view} view`} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <AngleGlyph view={c.view} className="h-10 w-10 text-foreground/60" />
                  </div>
                )}
                {c.status === "making" && (
                  <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                    <div className="relative h-8 w-8"><div className="h-full w-full animate-spin rounded-full border-2 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" /><Diamond className="absolute inset-0 m-auto h-3 w-3" strokeWidth={1} /></div>
                  </div>
                )}
                {c.status === "ok" && <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-emerald-700 text-white"><Check className="h-3 w-3" strokeWidth={2} /></span>}
              </div>
              {editable ? (
                <label className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <input type="checkbox" checked={c.ticked} disabled={busy} onChange={(e) => patch(i, { ticked: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--formanova-hero-accent))]" />
                  {c.view}
                </label>
              ) : (
                <span className="mt-2 text-sm font-medium text-foreground">{c.view}</span>
              )}
              {/* Also under a made angle, so ↻ can redo it with the customer's words. */}
              {((editable && c.ticked) || c.status === "review") && (
                <textarea value={c.extra} rows={1}
                  onChange={(e) => { patch(i, { extra: e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS) }); const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 112)}px`; }}
                  aria-label={`Anything specific for the ${c.view} angle (optional)`} placeholder={c.status === "review" ? "What to fix? Then ↻" : "Anything specific?"}
                  className="mt-1.5 max-h-28 min-h-[32px] w-full resize-none overflow-y-auto border border-border bg-background px-2 py-1.5 text-xs leading-snug text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60" />
              )}
              {c.status === "review" && (
                <div className="mt-1.5 flex gap-1.5">
                  <button type="button" onClick={() => void make([i])} disabled={busy} aria-label={`Regenerate ${c.view}`} title={`Regenerate · ${DESIGN_IMAGE_CREDITS}`} className={smallBtn}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1} /></button>
                  <button type="button" onClick={() => patch(i, { status: "ok", note: undefined })} className="flex h-8 flex-1 items-center justify-center gap-1 bg-foreground text-xs text-background hover:opacity-90"><Check className="h-3.5 w-3.5" strokeWidth={1.5} /> Looks right</button>
                </div>
              )}
              {c.status === "ok" && (
                <button type="button" onClick={() => patch(i, { status: "idle", picture: undefined, ticked: false })} className="mt-1.5 flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" strokeWidth={1.5} /> Remove</button>
              )}
              {c.note && <p className={`mt-1 text-[11px] leading-snug ${c.status === "failed" ? "text-destructive" : "text-amber-700"}`}>{c.note}</p>}
            </li>
          );
        })}
      </ol>
      {toMake.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => void make(toMake)} disabled={busy}
            className="flex h-10 items-center gap-2 border border-foreground px-5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-40">
            Generate {toMake.length === 1 ? "1 angle" : `${toMake.length} angles`} <ArrowRight className="h-4 w-4" strokeWidth={1.5} /> <CreditTag value={toMake.length * DESIGN_IMAGE_CREDITS} />
          </button>
        </div>
      )}
    </section>
  );
}
