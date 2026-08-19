/**
 * CadHistoryLibrary — "My Prompts" (text_to_cad) / "My Rings" (image_to_cad)
 * right-column panel for the CAD Studio upload screens.
 *
 * Presentational shell only — search/pagination/data ownership lives in
 * useCadHistoryLibrary. Mirrors the shape of Photo Studio's
 * StudioVaultUploadStep (search bar, scrollable grid, pagination), per
 * docs/CAD_LIBRARY_PANEL_PLAN.md.
 */
import { useEffect, useState } from "react";
import { useAuthenticatedImage } from "@/hooks/useAuthenticatedImage";
import { useCadHistoryLibrary, type CadLibraryEntry } from "@/hooks/useCadHistoryLibrary";
import { Search, ChevronLeft, ChevronRight, Diamond, Layers, Pencil, Check, X } from "lucide-react";

const localDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Local rendering of a workflow timestamp — bare seconds/ms precision from the
 * backend is normalized to a Date-parseable ISO string first. */
function formatLocalTimestamp(ts: string): string {
  const normalized = ts.trim() && !/[Zz]$/.test(ts) && !/[+-]\d{2}:?\d{2}$/.test(ts) ? `${ts}Z` : ts;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : localDateFmt.format(date);
}

/** Prompts come back from the backend with raw markdown emphasis (e.g.
 * `**spider-shaped**`) meant for a chat surface, not this card — strip it so
 * the literal asterisks don't render. */
function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "$1");
}

interface CadHistoryLibraryProps {
  variant: "prompts" | "images";
  onSelectPrompt?: (prompt: string) => void;
  /** Fires with the one reference image URL that was clicked. */
  onSelectImages?: (urls: string[]) => void;
  /** Fires once loading settles, so the caller can swap "Try an example" for
   * this panel without fetching the history twice. */
  onHasHistoryChange?: (hasHistory: boolean) => void;
  /** Fixed height for the images-variant panel so it frames identically to
   * the paired upload canvas on Image-to-CAD (shared height constant owned
   * by the caller, e.g. ImagePromptScreen.tsx's PANEL_H). Ignored for prompts. */
  panelH?: string;
}

function RingThumb({ url, className }: { url: string; className: string }) {
  const resolved = useAuthenticatedImage(url);
  if (!resolved) {
    return (
      <div className={`flex items-center justify-center bg-muted/20 ${className}`}>
        <Diamond className="h-4 w-4 text-muted-foreground/30" />
      </div>
    );
  }
  return <img src={resolved} alt="" loading="lazy" className={className} />;
}

/**
 * One card per uploaded set, mirroring Photo Studio's GroupedProductCard:
 * cover shown big with a count badge, a centered strip of angle thumbnails
 * below, and an inline rename row. Clicking a strip thumbnail swaps which
 * angle is shown; clicking the cover reuses the whole set.
 *
 * Rename targets the cover asset, which is also what search matches on, so an
 * unnamed set is unfindable until named.
 */
function RingCard({ entry, onSelect, onRename }: {
  entry: CadLibraryEntry;
  onSelect: (urls: string[]) => void;
  onRename: (assetId: string, name: string) => Promise<void>;
}) {
  const urls = entry.referenceImageUrls;
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!editing) setDraft(entry.name ?? ''); }, [editing, entry.name]);

  const commit = async () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (!entry.assetId || !trimmed || trimmed === entry.name) { setDraft(entry.name ?? ''); return; }
    try {
      await onRename(entry.assetId, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setDraft(entry.name ?? '');
    }
  };

  return (
    <div className="mb-2 break-inside-avoid">
      <button
        type="button"
        onClick={() => onSelect(urls)}
        aria-label={urls.length > 1 ? `Reuse these ${urls.length} reference images` : 'Reuse this reference image'}
        className="group relative block w-full overflow-hidden border border-border/20 transition-colors hover:border-[hsl(var(--formanova-hero-accent))]/50"
      >
        <RingThumb url={urls[activeIndex] ?? urls[0]} className="block w-full" />
        {urls.length > 1 && (
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 bg-foreground/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-background">
            <Layers className="h-2.5 w-2.5" /> {urls.length}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors group-hover:bg-foreground/10">
          <span className="bg-foreground/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-background opacity-0 transition-opacity group-hover:opacity-100">
            Use
          </span>
        </div>
      </button>

      {urls.length > 1 && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
          {urls.map((url, index) => (
            <button
              key={entry.assetIds[index] ?? index}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show angle ${index + 1}`}
              className={`h-8 w-8 overflow-hidden border transition-colors ${
                index === activeIndex ? 'border-[hsl(var(--formanova-hero-accent))]' : 'border-border/30 hover:border-foreground/40'
              }`}
            >
              <RingThumb url={url} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Rename row — fixed height so cards stay aligned, matching ModelCard. */}
      <div className="flex h-9 items-center overflow-hidden px-1">
        {editing ? (
          <div className="flex w-full items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commit();
                if (e.key === 'Escape') { setEditing(false); setDraft(entry.name ?? ''); }
              }}
              maxLength={50}
              placeholder="Name this ring..."
              className="min-w-0 flex-1 border border-foreground/20 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-foreground outline-none transition-colors focus:border-[hsl(var(--formanova-hero-accent))]"
            />
            <button onClick={() => { setEditing(false); setDraft(entry.name ?? ''); }} aria-label="Cancel rename" className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
            <button onClick={() => void commit()} aria-label="Save name" className="p-1 text-foreground hover:bg-muted/30">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setEditing(true); setDraft(entry.name ?? ''); }}
            title="Click to rename"
            className="group/rename flex h-full w-full items-center justify-center gap-1.5 transition-colors hover:bg-muted/20"
          >
            {saved ? (
              <>
                <Check className="h-3 w-3 flex-shrink-0 text-formanova-success" />
                <span className="font-mono text-[10px] text-formanova-success">Saved!</span>
              </>
            ) : (
              <>
                <span className="truncate font-mono text-[10px] text-foreground" title={entry.name ?? undefined}>
                  {entry.name || <span className="italic text-muted-foreground/60">Click to name</span>}
                </span>
                <Pencil className="h-3 w-3 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover/rename:text-foreground/60" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function PromptCard({ entry, onSelect }: { entry: CadLibraryEntry; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col items-start gap-1.5 border border-border/20 bg-background px-3.5 py-3 text-left transition-colors hover:border-[hsl(var(--formanova-hero-accent))]/50 hover:bg-[hsl(var(--formanova-hero-accent))]/5"
    >
      <p className="line-clamp-2 font-body text-[13px] italic leading-relaxed text-foreground">
        {entry.prompt ? stripMarkdownEmphasis(entry.prompt) : ""}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {formatLocalTimestamp(entry.createdAt)}
      </p>
    </button>
  );
}

function EmptyGuide({ variant }: { variant: "prompts" | "images" }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Diamond className="h-6 w-6 text-muted-foreground/30" />
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {variant === "prompts" ? "No saved prompts yet" : "No past uploads yet"}
      </p>
      <p className="max-w-[220px] text-[11px] leading-relaxed text-muted-foreground/70">
        {variant === "prompts"
          ? "Design briefs you generate from will show up here to reuse."
          : "Reference images you upload will show up here to reuse."}
      </p>
    </div>
  );
}

export default function CadHistoryLibrary({ variant, onSelectPrompt, onSelectImages, onHasHistoryChange, panelH }: CadHistoryLibraryProps) {
  const sourceType = variant === "prompts" ? "text_to_cad" : "image_to_cad";
  const { isLoading, error, hasHistory, isSearchable, items, renameEntry, search, setSearch, page, setPage, totalPages } =
    useCadHistoryLibrary(sourceType);

  useEffect(() => {
    if (!isLoading) onHasHistoryChange?.(hasHistory);
  }, [isLoading, hasHistory, onHasHistoryChange]);

  // Nothing to show yet (still loading the very first time) or the user has
  // no history at all — the caller falls back to "Try an example" instead.
  if (isLoading || !hasHistory) return null;

  const title = variant === "prompts" ? "My Prompts" : "My Rings";
  const subtitle = variant === "prompts" ? "Reuse a past design brief" : "Reuse a past upload";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2">
        {/* Invisible spacer mirrors the left column's "Image to CAD · Step 1"
            label so both headers are the same height and the two panels below
            share a top and bottom edge. Same technique as Photo Studio's
            StudioVaultUploadStep. */}
        <span className="marta-label mb-1 block invisible" aria-hidden="true">Step 1</span>
        {/* No "Show all" toggle here, unlike Photo Studio: that switch filters
            between on_model / pdp intended_use, which CAD references have no
            equivalent of. A disabled copy of it would never become functional. */}
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className={`flex min-h-0 flex-col border border-border/30 ${variant === "images" ? `flex-none ${panelH ?? ""}` : "flex-1"}`}>
        {isSearchable && (
          <div className="flex-shrink-0 border-b border-border/20 px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder={variant === "images" ? "Search by name..." : "Search prompts..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={variant === "images" ? "Search rings by name" : "Search prompts"}
                className="w-full border border-border/20 bg-muted/20 py-1.5 pl-7 pr-3 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-border/60"
              />
            </div>
          </div>
        )}

        {error && <p className="p-3 text-xs text-destructive">{error}</p>}

        {!error && items.length === 0 && <EmptyGuide variant={variant} />}

        {!error && items.length > 0 && variant === "prompts" && (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {items.map((entry) => (
              <PromptCard
                key={entry.id}
                entry={entry}
                onSelect={() => entry.prompt && onSelectPrompt?.(entry.prompt)}
              />
            ))}
          </div>
        )}

        {!error && items.length > 0 && variant === "images" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {/* True masonry: every reference image is its own tile at its
                natural aspect ratio, packed into 3 columns with small
                consistent gaps — matches Photo Studio's My Models panel. */}
            <div className="columns-2 gap-2">
              {items.map((entry) => (
                <RingCard
                  key={entry.id}
                  entry={entry}
                  onSelect={(urls) => onSelectImages?.(urls)}
                  onRename={renameEntry}
                />
              ))}
            </div>
          </div>
        )}

        {/* Pagination lives inside the fixed-height box for the images
            variant so its bottom edge lines up with the paired upload
            canvas's bottom edge (both end at panelH). Prompts keeps its
            existing below-the-box placement, unchanged. */}
        {variant === "images" && totalPages > 1 && (
          <div className="flex flex-shrink-0 items-center justify-center gap-1 border-t border-border/20 py-1.5">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {variant === "prompts" && totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
