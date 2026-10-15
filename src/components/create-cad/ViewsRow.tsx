import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Diamond, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { useDesignImageRun, type DesignImageOutcome } from "@/hooks/useDesignImageRun";
import { blobToDataUrl } from "@/lib/design-image-run";
import type { CadJewelryType, ImageInput } from "@/lib/ring-cad-nurbs-api";
import { DESIGN_IMAGE_CREDITS, MAX_DESIGN_VIEW_CHARS } from "@/lib/design-image-api";
import { ANGLE_SUGGESTIONS, MAX_ANGLES, type EditorPicture } from "./angle-suggestions";
import AngleGlyph from "./AngleGlyph";

type Status = "making" | "review" | "ok" | "old" | "failed";

interface View {
  id: number;
  /** The camera view sent to the toolkit, and the tile's name. */
  label: string;
  status: Status;
  picture?: EditorPicture;
  /** The customer's own upload (free), not a view we drew. */
  uploaded: boolean;
  note?: string;
}

interface ViewsRowProps {
  approved: EditorPicture;
  resolveBase: () => Promise<ImageInput>;
  jewelryType: CadJewelryType | null;
  toObjectUrl: (url: string) => Promise<string>;
  /** The customer's other uploads: they show the design before the edit. */
  extras?: File[];
  /** Accepted views (main picture not included), whenever that changes. */
  onChange: (views: EditorPicture[]) => void;
  onBusy?: (busy: boolean) => void;
}

const tileBtn = "flex h-7 w-7 items-center justify-center border border-border/70 bg-background/95 text-foreground transition-colors hover:border-foreground/40 disabled:opacity-40";

/**
 * Extra views beside the approved design: up to four, optional. Other uploads
 * come in first, marked as the old design (update to match, or remove). "+ Add
 * view" offers a suggested view, the customer's own words, or a picture of
 * their own (free). A made view is checked: Looks right or Regenerate.
 */
export default function ViewsRow({ approved, resolveBase, jewelryType, toObjectUrl, extras = [], onChange, onBusy }: ViewsRowProps) {
  const { generate } = useDesignImageRun();
  const nextId = useRef(0);
  const urls = useRef<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [views, setViews] = useState<View[]>(() =>
    extras.slice(0, MAX_ANGLES).map((f, i) => {
      const display = URL.createObjectURL(f);
      urls.current.push(display);
      return { id: nextId.current++, label: `Your photo ${i + 2}`, status: "old" as const, uploaded: true, picture: { display, input: null, label: `Your photo ${i + 2}` } };
    }),
  );
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const patch = (id: number, p: Partial<View>) => setViews((v) => v.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: number) => setViews((v) => v.filter((x) => x.id !== id));

  const land = useCallback(async (id: number, outcome: DesignImageOutcome) => {
    if (!("result" in outcome)) { patch(id, { status: "failed", note: "message" in outcome ? outcome.message : "Couldn't make this view." }); return; }
    try {
      const display = await toObjectUrl(outcome.result.image.url);
      patch(id, { status: "review", uploaded: false, picture: { display, input: outcome.result.image, label: "" }, note: outcome.result.consistent === false ? outcome.result.drift[0] ?? "It may not match your design." : undefined });
    } catch { patch(id, { status: "failed", note: "Couldn't load this view." }); }
  }, [toObjectUrl]);

  /** Draw a view from the approved design; `reference` keeps the camera of an old photo. */
  const make = useCallback(async (view: View, reference?: string) => {
    let base: ImageInput;
    try { base = await resolveBase(); } catch { return; }
    patch(view.id, { status: "making", note: undefined });
    const images: { role: "base" | "reference"; image: ImageInput }[] = [{ role: "base", image: base }];
    if (reference) images.push({ role: "reference", image: await blobToDataUrl(await (await fetch(reference)).blob()) });
    const request = reference
      ? { prompt: "Redraw the approved design from the same camera angle as the reference photo.", images, jewelryType }
      : { prompt: "", images, view: view.label, jewelryType };
    const outcomes = await generate([request], { onOutcome: (_, o) => void land(view.id, o) });
    if (outcomes === null) patch(view.id, { status: reference ? "old" : "failed", note: undefined });
  }, [resolveBase, jewelryType, generate, land]);

  const addMade = (label: string) => {
    setMenuOpen(false);
    if (views.length >= MAX_ANGLES) return;
    const v: View = { id: nextId.current++, label, status: "making", uploaded: false };
    setViews((s) => [...s, v]);
    void make(v);
  };
  const addUploads = (files: FileList | null) => {
    setMenuOpen(false);
    const room = MAX_ANGLES - views.length;
    const added = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, room).map((f) => {
      const display = URL.createObjectURL(f);
      urls.current.push(display);
      return { id: nextId.current++, label: "Your picture", status: "ok" as const, uploaded: true, picture: { display, input: null, label: "Your picture" } };
    });
    if (added.length) setViews((s) => [...s, ...added]);
  };

  const accepted = views.filter((v) => v.status === "ok" && v.picture).map((v) => ({ ...v.picture!, label: v.label }));
  const key = accepted.map((a) => a.display).join("|");
  useEffect(() => { onChange(accepted); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the pictures
  const busy = views.some((v) => v.status === "making");
  useEffect(() => { onBusy?.(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps -- report changes only

  const unused = ANGLE_SUGGESTIONS[jewelryType ?? "ring"].filter((a) => !views.some((v) => !v.uploaded && v.label === a.view));
  const hasOld = views.some((v) => v.status === "old");

  return (
    <section aria-label="More views">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">More views <span className="font-normal text-muted-foreground">(optional)</span></h3>
        <span className="text-xs text-muted-foreground">{views.length + 1} of {MAX_ANGLES + 1} pictures</span>
      </div>
      {hasOld && <p className="mt-1 text-xs text-muted-foreground">Your other photos show the design before your change. Update them to match, or remove them. Old photos aren't used.</p>}

      <ol className="mt-3 grid grid-cols-[repeat(4,minmax(0,104px))] gap-2.5">
        {views.map((v) => (
          <li key={v.id} className="flex flex-col">
            <div className={`relative aspect-square overflow-hidden border bg-muted/20 ${v.status === "review" ? "border-[hsl(var(--formanova-hero-accent))]" : "border-border/70"}`}>
              {v.picture ? (
                <img src={v.picture.display} alt={`${v.label} view`} className={`h-full w-full object-contain ${v.status === "old" ? "opacity-40 grayscale" : ""}`} />
              ) : (
                <div className="flex h-full items-center justify-center"><AngleGlyph view={v.label} className="h-10 w-10 text-foreground/50" /></div>
              )}
              {v.status === "making" && (
                <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                  <div className="relative h-8 w-8"><div className="h-full w-full animate-spin rounded-full border-2 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" /><Diamond className="absolute inset-0 m-auto h-3 w-3" strokeWidth={1} /></div>
                </div>
              )}
              {v.status === "old" && <span className="absolute inset-x-1.5 top-1.5 bg-background/90 px-1 py-0.5 text-center text-[10px] text-foreground">Old design</span>}
              {v.status !== "making" && (
                <button type="button" onClick={() => remove(v.id)} aria-label={`Remove ${v.label}`} className={`${tileBtn} absolute right-1 top-1 h-6 w-6 ${v.status === "old" ? "top-6" : ""}`}><X className="h-3 w-3" strokeWidth={1.5} /></button>
              )}
            </div>
            <span className="mt-1 truncate text-xs text-foreground">{v.label}</span>
            {v.status === "review" && (
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={() => void make(v)} aria-label={`Regenerate ${v.label}`} title={`Regenerate · ${DESIGN_IMAGE_CREDITS} credits`} className={tileBtn}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1} /></button>
                <button type="button" onClick={() => patch(v.id, { status: "ok", note: undefined })} className="flex h-7 flex-1 items-center justify-center gap-1 bg-foreground text-xs text-background hover:opacity-90"><Check className="h-3.5 w-3.5" strokeWidth={1.5} /> Looks right</button>
              </div>
            )}
            {v.status === "old" && (
              <button type="button" onClick={() => void make(v, v.picture?.display)} className="mt-1 flex h-7 items-center justify-center gap-1 border border-border/70 text-xs text-foreground hover:border-foreground/40">Update · {DESIGN_IMAGE_CREDITS}</button>
            )}
            {v.status === "failed" && (
              <button type="button" onClick={() => void make(v)} className="mt-1 text-left text-xs text-destructive underline underline-offset-2">Try again</button>
            )}
            {v.note && v.status === "review" && <p className="mt-1 text-[11px] leading-snug text-amber-700">{v.note}</p>}
          </li>
        ))}

        {views.length < MAX_ANGLES && (
          <li className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={1} /> Add view
            </button>
            {menuOpen && (
              <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-64 border border-border bg-background p-1.5 shadow-lg">
                {unused.map((a) => (
                  <button key={a.view} type="button" role="menuitem" onClick={() => addMade(a.view)} className="flex w-full items-center gap-2.5 px-2 py-2 text-left hover:bg-muted/50">
                    <AngleGlyph view={a.view} className="h-6 w-6 flex-shrink-0 text-foreground/70" />
                    <span className="min-w-0 flex-1"><span className="block text-sm text-foreground">{a.view}</span><span className="block truncate text-xs text-muted-foreground">{a.shows}</span></span>
                    <span className="text-xs text-muted-foreground">{DESIGN_IMAGE_CREDITS}</span>
                  </button>
                ))}
                <div className="mt-1 flex items-center border-t border-border/60 pt-1.5">
                  <label htmlFor="views-custom" className="sr-only">Describe your own view</label>
                  <input id="views-custom" value={custom} onChange={(e) => setCustom(e.target.value.slice(0, MAX_DESIGN_VIEW_CHARS))}
                    onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) { e.preventDefault(); addMade(custom.trim()); setCustom(""); } }}
                    placeholder="Your own view…" className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60" />
                  <button type="button" disabled={!custom.trim()} onClick={() => { addMade(custom.trim()); setCustom(""); }} className="px-2 text-sm text-foreground disabled:opacity-40">Add</button>
                </div>
                <button type="button" role="menuitem" onClick={() => fileRef.current?.click()} className="mt-1 flex w-full items-center gap-2.5 border-t border-border/60 px-2 py-2 text-left hover:bg-muted/50">
                  <ImagePlus className="h-5 w-5 flex-shrink-0 text-foreground/70" strokeWidth={1} />
                  <span className="min-w-0 flex-1"><span className="block text-sm text-foreground">Upload a picture</span><span className="block text-xs text-muted-foreground">A drawing with sizes, a sketch or a photo</span></span>
                  <span className="text-xs text-muted-foreground">Free</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addUploads(e.target.files); e.target.value = ""; }} />
              </div>
            )}
          </li>
        )}
      </ol>
    </section>
  );
}
