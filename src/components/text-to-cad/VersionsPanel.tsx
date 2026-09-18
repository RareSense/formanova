/**
 * The ring's saved versions, under its reference images in the left panel.
 *
 * One card per version, oldest first, so the history reads left to right the
 * way it happened. The card carries the version's own thumbnail, its name and
 * the time it was saved; the newest is badged, and the one on screen is
 * outlined. Picking a card opens that version in the viewer, which is what
 * makes improving from an older version possible at all.
 *
 * Renders nothing until a ring has versions: a run under an older workflow
 * saves none, and an empty section would read as something being broken.
 */

import { cn } from '@/lib/utils';

export interface VersionCard {
  asset_id: string;
  position: number;
  thumbnail_url?: string | null;
  created_at?: string | null;
  /** The improve verdict, e.g. "Looks better"; absent on the first version. */
  label?: { code: string; text: string } | null;
}

export interface VersionsPanelProps {
  versions: VersionCard[];
  selectedAssetId?: string | null;
  onSelect?: (assetId: string) => void;
}

/** Saved-at time, hour and minute, which is what distinguishes same-day versions. */
function savedAt(value?: string | null): string {
  if (!value) return '';
  const when = new Date(value);
  return Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function VersionsPanel({ versions, selectedAssetId, onSelect }: VersionsPanelProps) {
  if (!versions.length) return null;

  const newest = versions.reduce((a, b) => ((b.position ?? 0) >= (a.position ?? 0) ? b : a));

  return (
    <section className="mt-8">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Versions</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{versions.length}</span>
      </header>

      <div className="flex flex-wrap gap-3">
        {versions.map((version) => {
          const isSelected = version.asset_id === selectedAssetId;
          const isNewest = version.asset_id === newest.asset_id;
          return (
            <button
              key={version.asset_id}
              type="button"
              onClick={() => onSelect?.(version.asset_id)}
              aria-current={isSelected}
              title={version.label?.text ?? undefined}
              className={cn(
                'relative w-[104px] overflow-hidden rounded-lg border bg-card text-left transition-colors',
                isSelected ? 'border-foreground' : 'border-border hover:border-foreground/40',
              )}
            >
              {isNewest && (
                <span className="absolute right-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                  Latest
                </span>
              )}
              <div className="flex h-[88px] items-center justify-center bg-muted/40">
                {version.thumbnail_url ? (
                  <img
                    src={version.thumbnail_url}
                    alt={`Version ${version.position + 1}`}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  // A version whose screenshot could not be made still belongs
                  // in the list; it is a real ring the user can open.
                  <span className="font-mono text-[10px] text-muted-foreground">No preview</span>
                )}
              </div>
              <div className="flex items-baseline justify-between px-2 py-1.5">
                <span className="font-mono text-[11px] font-bold">{`V${version.position + 1}`}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{savedAt(version.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default VersionsPanel;
