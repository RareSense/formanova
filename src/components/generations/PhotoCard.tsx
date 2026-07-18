// Photo / CAD-render history card: image-first, minimal metadata, with an
// inline upscale control under the thumbnail.

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { Maximize2, Pencil, Check, X, Gem } from 'lucide-react';
import creditCoinIcon from '@/assets/icons/credit-coin.png';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Input } from '@/components/ui/input';
import type { WorkflowSummary } from '@/lib/generation-history-api';
import { PhotoPreviewModal } from './PhotoPreviewModal';
import { renameAsset, getAsset } from '@/lib/assets-api';
import { UpscaleControl } from '@/components/studio/UpscaleControl';
import { CreditPreflightModal } from '@/components/CreditPreflightModal';
import { useUpscaleLauncher } from '@/hooks/useUpscaleLauncher';
import { loadUpscaleIntent, clearUpscaleIntent } from '@/lib/upscale-intent';
import { inferResolutionTier, resolutionTierLabel, upscaleEtaLabel } from '@/lib/upscale-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { truncateDisplayName, formatLocal, formatLocalDateOnly, itemVariants, CreditsBadge } from './workflow-card-shared';
import { ShopifyPublishButton } from '@/components/shopify/ShopifyPublishButton';

const PHOTO_RENAMES_KEY = 'formanova_photo_renames';
function loadPhotoRenames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PHOTO_RENAMES_KEY) ?? '{}'); } catch { return {}; }
}
function savePhotoRename(id: string, name: string) {
  try {
    const map = loadPhotoRenames();
    map[id] = name;
    localStorage.setItem(PHOTO_RENAMES_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

export function PhotoCard({ workflow, index, onUpscaled }: { workflow: WorkflowSummary; index: number; onUpscaled?: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(
    () => loadPhotoRenames()[workflow.workflow_id] ?? workflow.output_asset_name ?? null,
  );
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (workflow.output_asset_name && !loadPhotoRenames()[workflow.workflow_id]) {
      setDisplayName(workflow.output_asset_name);
    }
  }, [workflow.output_asset_name]);

  const dateStr = workflow.created_at ? formatLocal(workflow.created_at) : '-';
  const dateOnlyStr = workflow.created_at ? formatLocalDateOnly(workflow.created_at) : '-';

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(displayName ?? '');
    setIsRenaming(true);
  };

  const handleConfirmPhotoRename = async () => {
    const sanitized = renameValue.trim().replace(/[<>:"/\\|?*]/g, '_');
    if (sanitized) {
      setDisplayName(sanitized);
      savePhotoRename(workflow.workflow_id, sanitized);
      if (workflow.output_asset_id) {
        try {
          await renameAsset(workflow.output_asset_id, sanitized);
        } catch (err) {
          console.error('[PhotoCard] photo rename error:', err);
        }
      }
    }
    setIsRenaming(false);
  };

  const handleCancelPhotoRename = () => setIsRenaming(false);

  // undefined = enrichment not started; '' = enriched but no thumbnail found
  const isEnriching = workflow.thumbnail_url === undefined;
  const hasThumbnail = !!workflow.thumbnail_url;
  const resolvedThumbnail = useAuthenticatedImage(workflow.thumbnail_url);

  // ── Inline upscale (photo / product shot results only) ──────────────────────
  const isProductShot = workflow.source_type === 'product_shot';
  const upscaleEligible =
    (workflow.source_type === 'photo' || workflow.source_type === 'product_shot') && hasThumbnail;
  // Billing tier is inferred from the result's real pixels; null = already past
  // 4K (no priced tier) so the control hides itself.
  const [upscaleTier, setUpscaleTier] = useState<Resolution | null>(null);
  // Resolution badge label (1K/2K/4K/6K/8K...) from the result's real pixels.
  const [badgeTier, setBadgeTier] = useState<string | null>(null);
  const [activeFactor, setActiveFactor] = useState<number | null>(null);
  // Resumed factor after a credits purchase: re-arm the dropdown to the user's
  // prior choice so finishing the upscale is a single click, not a restart.
  const [resumeFactor, setResumeFactor] = useState<number | null>(null);
  const intentConsumedRef = useRef(false);
  const {
    status: upscaleStatus, error: upscaleError, launch,
    showInsufficientModal, dismissModal, preflightResult,
  } = useUpscaleLauncher();

  // Once the thumbnail is known, claim a matching pending upscale intent (one
  // card consumes it). thumbnail_url can arrive after mount via enrichment, so
  // this keys off it rather than running only on mount.
  useEffect(() => {
    if (intentConsumedRef.current || !workflow.thumbnail_url) return;
    const intent = loadUpscaleIntent();
    if (intent && intent.imageUri === workflow.thumbnail_url) {
      intentConsumedRef.current = true;
      setResumeFactor(intent.factor);
      clearUpscaleIntent();
    }
  }, [workflow.thumbnail_url]);

  useEffect(() => {
    setUpscaleTier(null);
    setBadgeTier(null);
    let cancelled = false;

    // Authoritative tier from the asset's own metadata.image_size — independent of
    // whether the thumbnail actually loads. This avoids the failure where a raw/
    // expired image 403s (img.onerror) and the badge + upscale control silently
    // vanish. Only used when the asset reports a real 1K/2K/4K tier.
    const applyTier = (tier: Resolution) => {
      if (cancelled) return;
      setBadgeTier(tier);
      // Billing tier only for upscale-eligible cards.
      setUpscaleTier(upscaleEligible ? tier : null);
    };

    // Fallback: infer the tier from the rendered image's real pixels. Used when the
    // card has no linked asset or the asset lacks metadata (older/ungrouped items),
    // and it's the only path that can surface tiers beyond 4K (6K/8K upscales).
    const inferFromPixels = () => {
      if (!resolvedThumbnail) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
        setBadgeTier(resolutionTierLabel(longEdge));
        // null past 4K hides the control.
        setUpscaleTier(upscaleEligible ? inferResolutionTier(longEdge) : null);
      };
      img.onerror = () => { /* leave null -> badge/control hidden */ };
      img.src = resolvedThumbnail;
    };

    if (workflow.output_asset_id) {
      getAsset(workflow.output_asset_id)
        .then((asset) => {
          if (cancelled) return;
          const size = asset?.metadata?.image_size;
          if (size === '1K' || size === '2K' || size === '4K') applyTier(size);
          else inferFromPixels();
        })
        .catch(() => { if (!cancelled) inferFromPixels(); });
    } else {
      inferFromPixels();
    }

    return () => { cancelled = true; };
  }, [resolvedThumbnail, upscaleEligible, workflow.output_asset_id]);

  const upscaling = upscaleStatus === 'starting' || upscaleStatus === 'processing';
  const etaLabel = activeFactor && upscaleTier ? upscaleEtaLabel(upscaleTier, activeFactor) : null;

  return (
    <>
      <motion.div variants={itemVariants} className="marta-frame overflow-hidden">
        {/* Thumbnail - sharp rectangle, image-first */}
        <div className="relative">
        {/* Non-blocking upscale overlay over the thumbnail: dim + spinner + ETA,
            mirroring the studio overlay. The job is tracked in the header
            indicator so the user can keep browsing while it runs. */}
        {upscaling && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/75 px-3 text-center backdrop-blur-sm">
            <div className="relative">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <Gem className="absolute inset-0 m-auto h-5 w-5 text-primary" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-foreground">Upscaling</span>
            <span className="font-mono text-[9px] text-foreground/70">{etaLabel ?? 'a few minutes'}</span>
          </div>
        )}
        {/* Resolution badge (1K/2K/4K...) from the image's real pixels. */}
        {badgeTier && hasThumbnail && (
          <span className="absolute top-1.5 right-1.5 z-10 rounded border border-foreground/15 bg-background/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-foreground backdrop-blur-sm">
            {badgeTier}
          </span>
        )}
        {hasThumbnail ? (
          <button
            onClick={() => setPreviewOpen(true)}
            className="group relative w-full bg-muted overflow-hidden block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
            aria-label="Enlarge preview"
          >
            <OptimizedImage
              src={resolvedThumbnail ?? ""}
              alt={workflow.name || 'Generation preview'}
              sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
              className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* Credits badge - mobile only, top-left corner */}
            {workflow.credits_spent != null && (
              <div className="sm:hidden absolute top-0 left-0 flex items-center gap-1 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 border-r border-b border-border/30">
                <img src={creditCoinIcon} alt="" className="w-3 h-3" />
                <span className="font-mono text-[9px] text-foreground">{workflow.credits_spent}</span>
              </div>
            )}
            {/* View / enlarge icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/0 group-hover:bg-background/20 transition-colors duration-200">
              <div className="bg-background/80 backdrop-blur-sm p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Maximize2 className="h-5 w-5 text-foreground" />
              </div>
            </div>
          </button>
        ) : isEnriching ? (
          /* Spinner placeholder while enrichment is in progress */
          <div className="w-full aspect-square bg-muted/30 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
          </div>
        ) : null}
        </div>

        {/* Rename row - only when asset is linked */}
        {workflow.output_asset_id && (
          <div className="mx-2 sm:mx-3 mt-2 min-w-0" onClick={e => e.stopPropagation()}>
            {isRenaming ? (
              <div className="flex flex-col gap-1">
                <Input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmPhotoRename();
                    if (e.key === 'Escape') handleCancelPhotoRename();
                  }}
                  autoFocus
                  placeholder="Name..."
                  maxLength={50}
                  className="h-6 w-full font-mono text-[10px] tracking-wider px-1.5 py-0"
                />
                <div className="flex items-center justify-end gap-2">
                  <button onClick={handleCancelPhotoRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                  <button onClick={handleConfirmPhotoRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <Check className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
                <span
                  className="font-mono text-[10px] tracking-wider text-foreground truncate max-w-[calc(100%-1.25rem)]"
                  title={displayName ?? undefined}
                >
                  {displayName ? truncateDisplayName(displayName) : <span className="text-muted-foreground/40 italic">Untitled</span>}
                </span>
                <button
                  onClick={handleStartRename}
                  className="p-0.5 hover:text-foreground text-muted-foreground/50 transition-colors flex-shrink-0"
                  aria-label="Rename generation"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline upscale - under the thumbnail, above the credits/date footer. */}
        {upscaleEligible && upscaleTier && (
          <div className="mx-2 sm:mx-3 mt-2">
            <UpscaleControl
              compact
              resultImageUrl={workflow.thumbnail_url ?? null}
              resolution={upscaleTier}
              runStatus={upscaleStatus}
              error={upscaleError}
              initialFactor={resumeFactor ?? undefined}
              onUpscale={(factor) => {
                setActiveFactor(factor);
                launch({
                  imageUri: workflow.thumbnail_url ?? '',
                  resolution: upscaleTier,
                  factor,
                  isProductShot,
                  jewelryType: 'other',
                  onCompleted: () => onUpscaled?.(),
                });
              }}
            />
          </div>
        )}

        {/* Card footer: index . credits . date */}
        <div className="flex items-center justify-end sm:justify-between px-3 pt-3 pb-3 gap-2">
          <span className="hidden sm:inline font-mono text-[10px] tracking-[0.15em] text-muted-foreground/70 select-none min-w-0">
            #{index}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline-flex"><CreditsBadge credits={workflow.credits_spent} /></span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground whitespace-nowrap">
              <span className="sm:hidden">{dateOnlyStr}</span>
              <span className="hidden sm:inline">{dateStr}</span>
            </span>
          </div>
        </div>

        {/* Export to Shopify - photo / product shot results only */}
        {hasThumbnail && (workflow.source_type === 'photo' || workflow.source_type === 'product_shot') && (
          <div className="px-3 pb-3">
            <ShopifyPublishButton
              assetId={workflow.output_asset_id ?? null}
              assetName={displayName ?? workflow.output_asset_name ?? workflow.name ?? 'Untitled'}
              workflowId={workflow.workflow_id}
              previewUrl={resolvedThumbnail ?? workflow.thumbnail_url ?? null}
              className="h-10 w-full font-mono text-[10px] uppercase tracking-[0.15em]"
            />
          </div>
        )}
      </motion.div>

      {/* Insufficient-credit modal for the inline upscale */}
      {showInsufficientModal && preflightResult && (
        <CreditPreflightModal
          open={showInsufficientModal}
          onOpenChange={(open) => !open && dismissModal()}
          estimatedCredits={preflightResult.estimatedCredits}
          currentBalance={preflightResult.currentBalance}
        />
      )}

      {/* Enlarged preview modal */}
      {previewOpen && hasThumbnail && (
        <PhotoPreviewModal
          imageUrl={workflow.thumbnail_url!}
          alt={displayName || workflow.name || 'Generation preview'}
          onClose={() => setPreviewOpen(false)}
          assetId={workflow.output_asset_id}
        />
      )}
    </>
  );
}
