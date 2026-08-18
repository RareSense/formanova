/**
 * CadHistoryLibrary — "My Prompts" (text_to_cad) / "My Rings" (image_to_cad)
 * right-column panel for the CAD Studio upload screens.
 *
 * Presentational shell only — search/pagination/data ownership lives in
 * useCadHistoryLibrary. Mirrors the shape of Photo Studio's
 * StudioVaultUploadStep (search bar, scrollable grid, pagination), per
 * docs/CAD_LIBRARY_PANEL_PLAN.md.
 */
import { useEffect } from "react";
import { useAuthenticatedImage } from "@/hooks/useAuthenticatedImage";
import { useCadHistoryLibrary, type CadLibraryEntry } from "@/hooks/useCadHistoryLibrary";
import { Search, ChevronLeft, ChevronRight, Diamond } from "lucide-react";

const localDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Local rendering of a workflow timestamp — bare seconds/ms precision from the
 * backend is normalized to a Date-parseable ISO string first. */
function formatLocalTimestamp(ts: string): string {
  const normalized = ts.trim() && !/[Zz]$/.test(ts) && !/[+-]\d{2}:?\d{2}$/.test(ts) ? `${ts}Z` : ts;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : localDateFmt.format(date);
}

interface CadHistoryLibraryProps {
  variant: "prompts" | "images";
  onSelectPrompt?: (prompt: string) => void;
  onSelectImage?: (url: string) => void;
  /** Fires once loading settles, so the caller can swap "Try an example" for
   * this panel without fetching the history twice. */
  onHasHistoryChange?: (hasHistory: boolean) => void;
}

function ImageThumb({ url, onSelect }: { url: string; onSelect: () => void }) {
  const resolved = useAuthenticatedImage(url);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative aspect-square border border-border bg-muted/10 overflow-hidden hover:border-foreground/40 transition-colors"
      aria-label="Reuse this reference image"
    >
      {resolved ? (
        <img src={resolved} alt="" className="h-full w-full object-contain p-1 transition-transform duration-200 group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Diamond className="h-5 w-5 text-muted-foreground/30" />
        </div>
      )}
    </button>
  );
}

function PromptCard({ entry, onSelect }: { entry: CadLibraryEntry; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col items-start gap-1 border-b border-border/20 px-3 py-3 text-left transition-colors hover:bg-[hsl(var(--formanova-hero-accent))]/5"
    >
      <p className="line-clamp-2 font-body text-[13px] italic leading-snug text-foreground">
        {entry.prompt}
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

export default function CadHistoryLibrary({ variant, onSelectPrompt, onSelectImage, onHasHistoryChange }: CadHistoryLibraryProps) {
  const sourceType = variant === "prompts" ? "text_to_cad" : "image_to_cad";
  const { isLoading, error, hasHistory, isSearchable, items, search, setSearch, page, setPage, totalPages } =
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
        <h3 className="font-display text-2xl uppercase tracking-tight text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border border-border/30">
        {isSearchable && (
          <div className="flex-shrink-0 border-b border-border/20 px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search prompts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-border/20 bg-muted/20 py-1.5 pl-7 pr-3 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-border/60"
              />
            </div>
          </div>
        )}

        {error && <p className="p-3 text-xs text-destructive">{error}</p>}

        {!error && items.length === 0 && <EmptyGuide variant={variant} />}

        {!error && items.length > 0 && variant === "prompts" && (
          <div className="flex-1 overflow-y-auto">
            {items.map((entry) => (
              <PromptCard
                key={entry.workflowId}
                entry={entry}
                onSelect={() => entry.prompt && onSelectPrompt?.(entry.prompt)}
              />
            ))}
          </div>
        )}

        {!error && items.length > 0 && variant === "images" && (
          <div className="flex-1 overflow-y-auto p-2">
            {/* Every image from every past upload, not just the primary angle of
                each generation — a multi-image upload (2-5 reference angles)
                would otherwise hide all but the first from being reused. */}
            <div className="grid grid-cols-3 gap-2">
              {items.flatMap((entry) =>
                entry.referenceImageUrls.map((url, index) => (
                  <ImageThumb key={`${entry.workflowId}-${index}`} url={url} onSelect={() => onSelectImage?.(url)} />
                )),
              )}
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
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
