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

import { ScissorGLBGrid, GLBPreviewSlot } from '@/components/generations/ScissorGLBGrid';
import { cn } from '@/lib/utils';

export interface VersionCard {
  asset_id: string;
  position: number;
  /** The version's model, which the card renders as its picture. */
  glb_url?: string | null;
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

/**
 * The card's picture: the version's own model, rendered still.
 *
 * The saved screenshots are the ones the likeness review works from, shot in
 * flat grey clay so metal and sparkle cannot flatter the shape, which made
 * every card look grey. Rendering the GLB instead shows the ring as it is.
 *
 * All the cards share one canvas (that is what ScissorGLBGrid exists for), and
 * the click lands on the button above this, so a card reads as a picture
 * rather than as a second thing to drag around.
 */
function VersionCardModel({ version }: { version: VersionCard }) {
  if (!version.glb_url) {
    // Nothing to render yet: the version is still real and still openable.
    return (
      <span className="font-mono text-[11px] font-bold tracking-wider text-muted-foreground">
        {`V${version.position + 1}`}
      </span>
    );
  }
  return <GLBPreviewSlot id={version.asset_id} glbUrl={version.glb_url} className="h-full w-full" />;
}

export function VersionsPanel({ versions, selectedAssetId, onSelect }: VersionsPanelProps) {
  if (!versions.length) return null;

  const newest = versions.reduce((a, b) => ((b.position ?? 0) >= (a.position ?? 0) ? b : a));

  return (
    <section>
      {/* Header matches the panel's other sections: small caps label on the
          left, the count on the right, same type scale as REFERENCE IMAGES. */}
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Versions</h3>
        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground/60 tabular-nums">
          {versions.length}
        </span>
      </div>

      {/* Three to a row, matching the reference thumbnails above, so the two
          strips line up instead of each choosing its own width. */}
      <ScissorGLBGrid>
      <div className="grid grid-cols-3 gap-2">
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
                'group relative overflow-hidden border bg-card text-left transition-colors',
                isSelected ? 'border-foreground' : 'border-border hover:border-foreground/50',
              )}
            >
              {isNewest && (
                <span className="absolute right-1 top-1 z-10 bg-primary px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-primary-foreground">
                  Latest
                </span>
              )}
              {/* Contain, not cover: a screenshot cropped to a square cuts the
                  shank off and two versions of the same ring then look like
                  different rings. The padding keeps the silhouette off the
                  border so the card does not read as cramped. */}
              <div className="pointer-events-none relative flex aspect-square items-center justify-center bg-muted/10">
                <VersionCardModel version={version} />
              </div>
              <div className="flex items-baseline justify-between border-t border-border px-1.5 py-1">
                <span className="font-mono text-[10px] font-bold tracking-wider">{`V${version.position + 1}`}</span>
                <span className="font-mono text-[9px] text-muted-foreground tabular-nums">{savedAt(version.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
      </ScissorGLBGrid>
    </section>
  );
}

export default VersionsPanel;
