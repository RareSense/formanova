// src/components/vault/AssetCard.tsx
// Purely presentational — no data fetching. Restyle freely; keep AssetCardProps stable.

import { useState } from 'react';
import { Pencil, Check, X, Download } from 'lucide-react';
import { getAssetDisplayName, type UserAsset } from '@/lib/assets-api';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';

export interface AssetCardProps {
  asset: UserAsset;
  onReshoot?: (asset: UserAsset) => void;
  onClick?: (asset: UserAsset) => void;
  reshootLabel?: string;
  /** Show category label + inline rename (gated feature) */
  showMetadata?: boolean;
  onRename?: (asset: UserAsset, newName: string) => void;
  onDownload?: (asset: UserAsset) => void;
}

export function AssetCard({ asset, onReshoot, onClick, reshootLabel, showMetadata, onRename, onDownload }: AssetCardProps) {
  const label = reshootLabel ?? (asset.asset_type === 'model_photo' ? 'New Shoot' : 'New Style');
  const displayName = getAssetDisplayName(asset);
  const isGenerated = asset.asset_type === 'generated_photo' || asset.asset_type === 'generated_cad';
  // Resolution tier badge (Step 7). Only present for assets generated after the backend
  // started populating metadata.image_size; absent for uploads and older assets, in which
  // case nothing renders.
  const resolutionBadge = asset.metadata?.image_size?.trim() || null;
  const [editing, setEditing] = useState(false);
  const resolvedThumbnail = useAuthenticatedImage(asset.thumbnail_url);
  const [nameInput, setNameInput] = useState(displayName ?? '');
  const [saved, setSaved] = useState(false);

  const handleRenameCommit = () => {
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== displayName) {
      onRename?.(asset, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };

  const cancel = () => {
    setEditing(false);
    setNameInput(displayName ?? '');
  };

  return (
    <div
      className="group relative flex flex-col rounded-lg overflow-hidden bg-card border border-border cursor-pointer hover:border-formanova-glow transition-colors duration-200"
      onClick={() => !editing && onClick?.(asset)}
    >
      {/* ── Image area ── */}
      <div className="w-full overflow-hidden bg-muted">
        <img
          src={resolvedThumbnail ?? ""}
          alt={displayName ?? (asset.asset_type === 'model_photo' ? 'Model photo' : 'Jewelry photo')}
          className="w-full h-auto block group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {resolutionBadge && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm pointer-events-none">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{resolutionBadge}</span>
        </div>
      )}

      {/* ── Naming row — fixed height for grid alignment ── */}
      <div className="h-10 sm:h-11 flex items-center px-3 overflow-hidden">
        {onRename && editing ? (
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
            <button
              onClick={cancel}
              className="flex-shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              onClick={handleRenameCommit}
              className="flex-shrink-0 p-1.5 rounded text-foreground hover:bg-muted/30 transition-colors"
              aria-label="Save"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : onRename ? (
          <button
            className="flex items-center justify-center gap-2 sm:gap-2.5 w-full h-full rounded hover:bg-muted/20 transition-colors group/rename"
            title="Click to rename"
            onClick={e => { e.stopPropagation(); setEditing(true); setNameInput(displayName ?? ''); }}
          >
            {saved ? (
              <>
                <Check className="h-3 w-3 text-formanova-success flex-shrink-0" />
                <span className="font-mono text-[11px] text-formanova-success truncate">Saved!</span>
              </>
            ) : (
              <>
                <span className="font-mono text-[11px] truncate text-foreground transition-colors">
                  {displayName || <span className="italic opacity-60">Click to edit</span>}
                </span>
                <Pencil className="h-3 w-3 flex-shrink-0 text-muted-foreground/40 group-hover/rename:text-foreground/60 transition-colors" />
              </>
            )}
          </button>
        ) : (
          showMetadata && asset.metadata?.category ? (
            <span className="font-mono text-[11px] text-muted-foreground capitalize truncate w-full text-center">{asset.metadata.category}</span>
          ) : null
        )}
      </div>

      {onReshoot && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-background/20">
          <button
            className="px-6 py-2 bg-formanova-glow text-black text-xs font-bold rounded hover:brightness-110 transition-all"
            onClick={(e) => { e.stopPropagation(); onReshoot(asset); }}
          >
            {label}
          </button>
        </div>
      )}

      {isGenerated && onDownload && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            className="p-1.5 rounded bg-background/80 backdrop-blur-sm text-foreground hover:bg-background transition-colors"
            title="Download"
            onClick={(e) => { e.stopPropagation(); onDownload(asset); }}
            aria-label="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
