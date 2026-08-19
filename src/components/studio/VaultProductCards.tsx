/**
 * VaultProductCards - presentational cards for the "My Products" jewelry vault grid.
 *
 * Extracted from StudioVaultUploadStep to keep that file within the concern-boundary
 * budget (AI_RULES.md #8): these components hold only their own card-local UI state
 * (rename, active angle) and render; they own no data-fetching, upload, or step logic.
 *
 * - ProductCard: a single ungrouped jewelry asset, with inline rename.
 * - GroupedProductCard: a multi-angle set (shared input_group_id) shown as one card.
 * - buildVaultCards: collapses the flat asset list into single/grouped cards.
 */
import React, { useState } from 'react';
import { Check, X, Pencil, Layers } from 'lucide-react';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { getAssetDisplayName, renameAsset } from '@/lib/assets-api';
import type { UserAsset } from '@/lib/assets-api';

const DISPLAY_NAME_MAX_CHARS = 50;

function truncateDisplayName(name: string): string {
  return name.length > DISPLAY_NAME_MAX_CHARS
    ? `${name.slice(0, DISPLAY_NAME_MAX_CHARS)}...`
    : name;
}

function ProductThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const resolved = useAuthenticatedImage(src);
  return (
    <img
      src={resolved ?? ""}
      alt={alt}
      loading="lazy"
      className={className ?? "w-full block transition-transform duration-300 group-hover:scale-105"}
    />
  );
}

export function ProductCard({
  asset,
  isSelected,
  onSelect,
}: {
  asset: UserAsset;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const displayName = getAssetDisplayName(asset) || 'Product';
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? '');
  const [localName, setLocalName] = useState(displayName ?? '');
  const [saved, setSaved] = useState(false);
  const syncedDisplayNameRef = React.useRef(displayName);

  React.useEffect(() => {
    if (displayName && displayName !== syncedDisplayNameRef.current) {
      syncedDisplayNameRef.current = displayName;
      setLocalName(displayName);
      setNameInput(displayName);
    }
  }, [displayName]);

  const handleRenameCommit = async () => {
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== localName) {
      try {
        await renameAsset(asset.id, trimmed);
        setLocalName(trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } catch {
        setNameInput(localName);
      }
    }
  };

  const cancel = () => {
    setEditing(false);
    setNameInput(localName);
  };

  return (
    <div className="break-inside-avoid mb-2">
      <button
        type="button"
        onClick={() => !editing && onSelect()}
        className={`relative overflow-hidden border transition-all group w-full
          ${isSelected
            ? 'border-[hsl(var(--formanova-hero-accent))]'
            : 'border-border/20 hover:border-foreground/30'}`}
      >
        <ProductThumb src={asset.thumbnail_url} alt={localName || 'Product'} />
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center"
               style={{ background: 'hsl(var(--formanova-hero-accent)/0.15)' }}>
            <div className="w-6 h-6 flex items-center justify-center"
                 style={{ background: 'hsl(var(--formanova-hero-accent))' }}>
              <Check className="h-3.5 w-3.5 text-background" />
            </div>
          </div>
        )}
        {!isSelected && (
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10
                          transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity
                             font-mono text-[9px] tracking-[0.15em] uppercase
                             text-background bg-foreground/70 px-2 py-1">
              Use
            </span>
          </div>
        )}
      </button>

      {/* Naming row - fixed height matches ModelCard, never overlaps image */}
      <div className="h-10 sm:h-11 flex items-center px-2 overflow-hidden">
        {editing ? (
          <div className="flex items-center gap-1.5 w-full" onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className="font-mono text-[11px] text-foreground bg-muted/30 border border-foreground/20 focus:border-formanova-glow rounded px-2 py-1 outline-none flex-1 min-w-0 transition-colors"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') cancel(); }}
              maxLength={50}
              placeholder="Enter a name..."
            />
            <button onClick={cancel} className="flex-shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors" aria-label="Cancel">
              <X className="h-3 w-3" />
            </button>
            <button onClick={handleRenameCommit} className="flex-shrink-0 p-1.5 rounded text-foreground hover:bg-muted/30 transition-colors" aria-label="Save">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            className="flex items-center justify-center gap-2 sm:gap-2.5 w-full h-full rounded hover:bg-muted/20 transition-colors group/rename"
            title="Click to rename"
            onClick={e => { e.stopPropagation(); setEditing(true); setNameInput(localName); }}
          >
            {saved ? (
              <>
                <Check className="h-3 w-3 text-formanova-success flex-shrink-0" />
                <span className="font-mono text-[11px] text-formanova-success truncate">Saved!</span>
              </>
            ) : (
              <>
                <span className="font-mono text-[11px] truncate text-foreground transition-colors" title={localName || undefined}>
                  {localName ? truncateDisplayName(localName) : <span className="italic text-muted-foreground/60">Click to name</span>}
                </span>
                <Pencil className="h-3 w-3 flex-shrink-0 text-muted-foreground/40 group-hover/rename:text-foreground/60 transition-colors" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Grouped multi-image jewelry sets (input_group_id) ---

interface VaultCard { groupId: string | null; cover: UserAsset; members: UserAsset[]; }

/**
 * Collapse the flat jewelry-photo list into cards. Assets sharing a set become
 * one card; ungrouped assets stay standalone. Order follows first appearance so
 * the grid does not reshuffle. Cover = earliest-uploaded member (the backend
 * returns no is_cover flag, so we infer it from created_at; see caveat below).
 *
 * Membership reads `set_ids`, not `input_group_id`. Since the 2026-08-19
 * backend grouping consolidation an asset can belong to SEVERAL sets — re-
 * uploading an image the user already owns now adds it to the new set rather
 * than leaving it welded to the first one — and a single-valued
 * `input_group_id` cannot express that. An asset therefore appears in every
 * card it is a member of, which is intended: previously it silently vanished
 * from every set but the first. `input_group_id` is still honoured as a
 * fallback for responses predating the consolidation.
 *
 * KNOWN GAP — cover selection in mixed sets. A reused asset keeps its original
 * `created_at`, so in a set built from both new uploads and reused images the
 * created_at sort can pick an older reused image as the cover instead of the
 * intended first one. The backend stores an explicit per-set `position` that
 * would resolve this, but it is not exposed on the GET /assets response yet
 * (asked; see artifacts/claude-coordination). Until it is, this is unchanged
 * from previous behaviour rather than newly broken.
 */
export function buildVaultCards(assets: UserAsset[]): VaultCard[] {
  const groups = new Map<string, UserAsset[]>();
  const order: string[] = [];
  for (const a of assets) {
    const setIds = a.set_ids?.length
      ? a.set_ids
      : [a.input_group_id ?? `single:${a.id}`];
    for (const key of setIds) {
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(a);
    }
  }
  return order.map((key) => {
    const members = groups.get(key)!;
    const cover = members.length > 1
      ? [...members].sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0))[0]
      : members[0];
    return { groupId: key.startsWith('single:') ? null : key, cover, members };
  });
}

/**
 * Card for a grouped set: cover shown big with a count badge; a centered strip of
 * angle thumbnails below. Clicking a thumbnail swaps it into the big spot; clicking
 * the big image selects the piece (the cover) for generation.
 */
export function GroupedProductCard({
  members,
  cover,
  isSelected,
  onSelect,
}: {
  members: UserAsset[];
  cover: UserAsset;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Cover first, then remaining angles in stable order.
  const ordered = React.useMemo(
    () => [cover, ...members.filter((m) => m.id !== cover.id)],
    [members, cover],
  );
  const [activeId, setActiveId] = useState(cover.id);
  const active = ordered.find((m) => m.id === activeId) ?? cover;
  const name = getAssetDisplayName(cover) || 'Product';

  return (
    <div className="break-inside-avoid mb-2">
      <button
        type="button"
        onClick={onSelect}
        className={`relative overflow-hidden border transition-all group w-full
          ${isSelected
            ? 'border-[hsl(var(--formanova-hero-accent))]'
            : 'border-border/20 hover:border-foreground/30'}`}
      >
        <ProductThumb src={active.thumbnail_url} alt={name} />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-foreground/70 text-background
                        font-mono text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5">
          <Layers className="h-2.5 w-2.5" /> {ordered.length}
        </div>
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center"
               style={{ background: 'hsl(var(--formanova-hero-accent)/0.15)' }}>
            <div className="w-6 h-6 flex items-center justify-center"
                 style={{ background: 'hsl(var(--formanova-hero-accent))' }}>
              <Check className="h-3.5 w-3.5 text-background" />
            </div>
          </div>
        )}
        {!isSelected && (
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10
                          transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity
                             font-mono text-[9px] tracking-[0.15em] uppercase
                             text-background bg-foreground/70 px-2 py-1">
              Use
            </span>
          </div>
        )}
      </button>

      {/* Angle strip - centered; click a thumbnail to enlarge it into the cover slot */}
      <div className="flex items-center justify-center gap-1.5 mt-1.5">
        {ordered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveId(m.id); }}
            aria-label="Show this angle"
            className={`w-8 h-8 overflow-hidden border transition-colors
              ${m.id === activeId
                ? 'border-[hsl(var(--formanova-hero-accent))]'
                : 'border-border/30 hover:border-foreground/40'}`}
          >
            <ProductThumb src={m.thumbnail_url} alt={name} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Name row - mirrors ProductCard height so grouped and single cards align */}
      <div className="h-10 sm:h-11 flex items-center justify-center px-2 overflow-hidden">
        <span className="font-mono text-[11px] truncate text-foreground" title={name}>
          {truncateDisplayName(name)}
        </span>
      </div>
    </div>
  );
}
