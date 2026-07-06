/**
 * StudioVaultUploadStep — internal experiment (gated via feature flag).
 *
 * Left  (2/3) — upload canvas.
 * Right (1/3) — Upload Guide when canvas is empty; My Products library when image loaded.
 *
 * Test Mode (toggle, same gate): always shows the Upload Guide regardless of state,
 * for testing the empty-state UX.
 */

import React, { useState } from 'react';
import {
  Check, X, Diamond, Upload, ArrowRight, Loader2,
  ChevronLeft, ChevronRight, ImageIcon, Lightbulb, Pencil, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useUserAssets } from '@/hooks/useUserAssets';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { trackMyProductsCategoryFiltered } from '@/lib/posthog-events';
import { MasonryGrid } from '@/components/ui/masonry-grid';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { getAssetDisplayName, renameAsset } from '@/lib/assets-api';
import type { UserAsset } from '@/lib/assets-api';
import { EffortToggle, type EffortLevel } from '@/components/studio/EffortToggle';
import { HighEffortUploadCanvas } from '@/components/studio/HighEffortUploadCanvas';
import type { SupportingImage } from '@/hooks/useSupportingImages';

const DISPLAY_NAME_MAX_CHARS = 50;

function truncateDisplayName(name: string): string {
  return name.length > DISPLAY_NAME_MAX_CHARS
    ? `${name.slice(0, DISPLAY_NAME_MAX_CHARS)}...`
    : name;
}

function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const resolved = useAuthenticatedImage(src);
  return (
    <img
      src={resolved ?? ""}
      alt={alt}
      loading="lazy"
      className="w-full block transition-transform duration-300 group-hover:scale-105"
    />
  );
}

function ProductCard({
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

      {/* Naming row — fixed height matches ModelCard, never overlaps image */}
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

// ── Example images ────────────────────────────────────────────────────────────
import necklaceAllowed1    from '@/assets/examples/necklace-allowed-1.jpg';
import necklaceAllowed2    from '@/assets/examples/necklace-allowed-2.jpg';
import necklaceAllowed3    from '@/assets/examples/necklace-allowed-3.jpg';
import necklaceAllowed4    from '@/assets/examples/necklace-allowed-4.jpg';
import necklaceNotAllowed1 from '@/assets/examples/necklace-notallowed-1.png';
import necklaceNotAllowed2 from '@/assets/examples/necklace-notallowed-2.png';
import necklaceNotAllowed3 from '@/assets/examples/necklace-notallowed-3.png';
import earringAllowed1     from '@/assets/examples/earring-allowed-1.jpg';
import earringAllowed2     from '@/assets/examples/earring-allowed-2.jpg';
import earringAllowed3     from '@/assets/examples/earring-allowed-3.jpg';
import earringAllowed4     from '@/assets/examples/earring-allowed-4.jpg';
import earringNotAllowed1  from '@/assets/examples/earring-notallowed-1.png';
import earringNotAllowed2  from '@/assets/examples/earring-notallowed-2.png';
import earringNotAllowed3  from '@/assets/examples/earring-notallowed-3.png';
import braceletAllowed1    from '@/assets/examples/bracelet-allowed-1.jpg';
import braceletAllowed2    from '@/assets/examples/bracelet-allowed-2.jpg';
import braceletAllowed3    from '@/assets/examples/bracelet-allowed-3.jpg';
import braceletAllowed4    from '@/assets/examples/bracelet-allowed-4.jpg';
import braceletNotAllowed1 from '@/assets/examples/bracelet-notallowed-1.png';
import braceletNotAllowed2 from '@/assets/examples/bracelet-notallowed-2.png';
import braceletNotAllowed3 from '@/assets/examples/bracelet-notallowed-3.png';
import ringAllowed1        from '@/assets/examples/ring-allowed-1.png';
import ringAllowed2        from '@/assets/examples/ring-allowed-2.png';
import ringAllowed3        from '@/assets/examples/ring-allowed-3.jpg';
import ringAllowed4        from '@/assets/examples/ring-allowed-4.jpg';
import ringNotAllowed1     from '@/assets/examples/ring-notallowed-1.png';
import ringNotAllowed2     from '@/assets/examples/ring-notallowed-2.png';
import ringNotAllowed3     from '@/assets/examples/ring-notallowed-3.png';
import watchAllowed1       from '@/assets/examples/watch-allowed-1.jpg';
import watchAllowed2       from '@/assets/examples/watch-allowed-2.jpg';
import watchAllowed3       from '@/assets/examples/watch-allowed-3.png';
import watchAllowed4       from '@/assets/examples/watch-allowed-4.jpg';
import watchNotAllowed1    from '@/assets/examples/watch-notallowed-1.png';
import watchNotAllowed2    from '@/assets/examples/watch-notallowed-2.png';
import watchNotAllowed3    from '@/assets/examples/watch-notallowed-3.png';

// ── Product-shot guide images ─────────────────────────────────────────────────
import psLightingBright from '@/assets/examples/ps-lighting-bright-input.webp';
import psBlurClear      from '@/assets/examples/ps-blur-clear-input.webp';
import psLightingDim    from '@/assets/examples/ps-lighting-dim-input.webp';
import psBlur           from '@/assets/examples/ps-blur-input.webp';

const CATEGORY_EXAMPLES: Record<string, { allowed: string[]; notAllowed: string[] }> = {
  necklace:  { allowed: [necklaceAllowed1, necklaceAllowed2, necklaceAllowed3, necklaceAllowed4],   notAllowed: [necklaceNotAllowed1, necklaceNotAllowed2, necklaceNotAllowed3] },
  earrings:  { allowed: [earringAllowed1,  earringAllowed2,  earringAllowed3,  earringAllowed4],    notAllowed: [earringNotAllowed1,  earringNotAllowed2,  earringNotAllowed3]  },
  bracelets: { allowed: [braceletAllowed1, braceletAllowed2, braceletAllowed3, braceletAllowed4],   notAllowed: [braceletNotAllowed1, braceletNotAllowed2, braceletNotAllowed3] },
  rings:     { allowed: [ringAllowed1,     ringAllowed2,     ringAllowed3,     ringAllowed4],        notAllowed: [ringNotAllowed1,     ringNotAllowed2,     ringNotAllowed3]     },
  watches:   { allowed: [watchAllowed1,    watchAllowed2,    watchAllowed3,    watchAllowed4],       notAllowed: [watchNotAllowed1,    watchNotAllowed2,    watchNotAllowed3]    },
};

// Shared canvas height — locks both columns to the same vertical bounds.
const CANVAS_H = 'h-[500px] md:h-[640px]';

// ── Upload Guide — 2×2 recommended photos, shown to users with no uploads yet ──
function UploadGuidePanel({
  examples,
  categoryType,
  isProductShot,
}: {
  examples: { allowed: string[]; notAllowed: string[] };
  categoryType: string;
  isProductShot?: boolean;
}) {
  if (isProductShot) {
    return (
      <div className={`border border-border/30 flex flex-col overflow-hidden ${CANVAS_H}`}>
        <p className="px-12 pt-3 pb-2 text-lg font-bold text-foreground flex-shrink-0">
          Better photo. Better result.
        </p>
        <div className="px-12 flex-1 overflow-hidden flex flex-col justify-center">
          <div className="grid grid-cols-2 gap-4">
            {/* Do column */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-green-500">Do</span>
              <div className="relative aspect-square overflow-hidden border border-green-500/30 bg-muted/20">
                <img src={psLightingBright} alt="Good lighting" draggable={false} className="w-full h-full object-cover" />
              </div>
              <div className="relative aspect-square overflow-hidden border border-green-500/30 bg-muted/20">
                <img src={psBlurClear} alt="Clear focus" draggable={false} className="w-full h-full object-cover" />
              </div>
            </div>
            {/* Don't column */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-destructive">Don't</span>
              <div className="relative aspect-square overflow-hidden border border-destructive/30 bg-muted/20">
                <img src={psLightingDim} alt="Dim lighting" draggable={false} className="w-full h-full object-cover" style={{ filter: 'brightness(0.35)' }} />
              </div>
              <div className="relative aspect-square overflow-hidden border border-destructive/30 bg-muted/20">
                <img src={psBlur} alt="Blurry photo" draggable={false} className="w-full h-full object-cover" style={{ filter: 'blur(4px) scale(1.05)' }} />
              </div>
            </div>
          </div>
        </div>
        <div className="px-12 pt-2 pb-3 flex items-start gap-2 flex-shrink-0">
          <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">Pro Tip:</span> Bright, even lighting with a sharp focus gives the best results.
          </p>
        </div>
      </div>
    );
  }

  const topLabel = categoryType === 'rings'
    ? 'Recommended input poses for best results'
    : 'Recommended input photos for best results';

  return (
    <div className={`border border-border/30 flex flex-col overflow-hidden ${CANVAS_H}`}>
      {/* Top label */}
      <p className="px-12 pt-3 pb-2 text-base font-bold text-foreground flex-shrink-0">
        {topLabel}
      </p>

      {/* Grid — padded horizontally to keep images small */}
      <div className="px-12 flex-1 overflow-hidden flex flex-col justify-center">
        <div className="grid grid-cols-2 gap-4">
          {examples.allowed.slice(0, 4).map((src, i) => (
            <div key={`rec-${i}`} className="relative aspect-square overflow-hidden border border-green-500/30 bg-muted/20">
              <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom tip */}
      <div className="px-12 pt-2 pb-3 flex items-start gap-2 flex-shrink-0">
        <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-bold text-foreground">Pro Tip:</span> For more accurate results, use clear photos of jewelry worn on a person or on a mannequin.
        </p>
      </div>
    </div>
  );
}

// ── Pagination helper ─────────────────────────────────────────────────────────
function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | '…')[] = [0];
  if (current > 2)          pages.push('…');
  const lo = Math.max(1, current - 1);
  const hi = Math.min(total - 2, current + 1);
  for (let i = lo; i <= hi; i++) pages.push(i);
  if (current < total - 3) pages.push('…');
  pages.push(total - 1);
  return pages;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StudioVaultUploadStepProps {
  exampleCategoryType: string;
  jewelryImage: string | null;
  activeProductAssetId: string | null;
  canProceed: boolean;
  jewelryInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (file: File) => void;
  onClearImage: () => void;
  onNextStep: () => void;
  onProductSelect: (thumbnailUrl: string, assetId: string) => void;
  onCategoryChange?: (category: string) => void;
  isProductShot?: boolean;
  effort: EffortLevel;
  onEffortChange: (v: EffortLevel) => void;
  effortModeEnabled: boolean;
  supportingImages: SupportingImage[];
  addSupportingImages: (files: File[]) => void;
  removeSupportingImage: (index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StudioVaultUploadStep({
  exampleCategoryType,
  jewelryImage,
  activeProductAssetId,
  canProceed,
  jewelryInputRef,
  onFileUpload,
  onClearImage,
  onNextStep,
  onProductSelect,
  onCategoryChange,
  isProductShot,
  effort,
  onEffortChange,
  effortModeEnabled,
  supportingImages,
  addSupportingImages,
  removeSupportingImage,
}: StudioVaultUploadStepProps) {
  const examples = CATEGORY_EXAMPLES[exampleCategoryType] ?? CATEGORY_EXAMPLES['necklace'];
  const categoryCopy = {
    necklace: { singular: 'necklace', plural: 'necklaces' },
    necklaces: { singular: 'necklace', plural: 'necklaces' },
    earring: { singular: 'earring', plural: 'earrings' },
    earrings: { singular: 'earring', plural: 'earrings' },
    bracelet: { singular: 'bracelet', plural: 'bracelets' },
    bracelets: { singular: 'bracelet', plural: 'bracelets' },
    ring: { singular: 'ring', plural: 'rings' },
    rings: { singular: 'ring', plural: 'rings' },
    watch: { singular: 'watch', plural: 'watches' },
    watches: { singular: 'watch', plural: 'watches' },
  }[exampleCategoryType] ?? { singular: 'jewelry', plural: 'jewelry' };

  const urlCategory = TO_SINGULAR[exampleCategoryType] ?? exampleCategoryType;

  const [guideDialogOpen, setGuideDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory);
  const [showAll, setShowAll] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const resolvedJewelryImage = useAuthenticatedImage(jewelryImage);

  // Primary drop zone accepts multi-select: first file -> primary, rest -> supporting.
  const handlePrimaryFiles = (files: File[]) => {
    if (!files.length) return;
    if (!jewelryImage) {
      onFileUpload(files[0]);
      if (files.length > 1) addSupportingImages(files.slice(1));
    } else {
      addSupportingImages(files);
    }
  };

  const PAGE_SIZE = 10;
  const activeCategory = selectedCategory ?? undefined;
  const isModelShotMode = !showAll && !isProductShot;

  React.useEffect(() => { setClientPage(0); }, [isModelShotMode, activeCategory]);
  // Product shot: server-side pdp filter, accurate pagination.
  // Model shot: fetch large batch (50), exclude pdp client-side (untagged = on_model fallback),
  //             then paginate filtered results client-side so page 1 always has up to 10 items.
  // Show all: normal server pagination.
  const intendedUse = (!showAll && isProductShot) ? 'pdp' : undefined;
  const serverPageSize = isModelShotMode ? 50 : PAGE_SIZE;
  const [clientPage, setClientPage] = useState(0);
  const { assets: rawAssets, total, page: serverPage, isLoading, error, goToPage: goToServerPage } = useUserAssets('jewelry_photo', serverPageSize, activeCategory, intendedUse);

  const filteredAssets = isModelShotMode
    ? rawAssets.filter(a => a.metadata?.['intended_use'] !== 'pdp')
    : rawAssets;
  const assets = isModelShotMode
    ? filteredAssets.slice(clientPage * PAGE_SIZE, (clientPage + 1) * PAGE_SIZE)
    : filteredAssets;

  const page = isModelShotMode ? clientPage : serverPage;
  const goToPage = isModelShotMode ? setClientPage : goToServerPage;
  const totalPages = isModelShotMode
    ? Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE))
    : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const searchActive = productSearch.trim().length > 0;
  const searchQuery = productSearch.toLowerCase();
  const displayAssets = searchActive
    ? filteredAssets.filter(a => {
        const name = getAssetDisplayName(a);
        return name.toLowerCase().includes(searchQuery);
      })
    : assets;

  // Show upload guide if user has no uploads matching the current context
  const showGuide = !isLoading && assets.length === 0;

  const JEWELRY_CATS = [
    { label: 'Necklaces', value: 'necklace' },
    { label: 'Earrings', value: 'earring' },
    { label: 'Rings', value: 'ring' },
    { label: 'Bracelets', value: 'bracelet' },
    { label: 'Watches', value: 'watch' },
  ];

  return (
    <>
    <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">

      {/* ══════════════════════════════════════════════════════════════
          LEFT — Upload Canvas  (2 / 3)
          ══════════════════════════════════════════════════════════════ */}
      <div className="lg:col-span-2 flex flex-col gap-4">

        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="marta-label block mb-1">Step 1</span>
            <h1 className="font-display text-3xl md:text-4xl uppercase tracking-tight mt-2">
              Upload Your {categoryCopy.singular}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {isProductShot
                ? `Upload a high quality photo of your ${categoryCopy.singular}.`
                : <>Upload a photo of your {categoryCopy.singular} <strong>worn on a person or mannequin</strong></>}
            </p>
          </div>
          {/* Effort toggle — aligned on the same baseline as the "Show all" toggle in the right column.
              Only shown when High Effort is enabled for the user (rollout gate). */}
          {effortModeEnabled && (
            <EffortToggle value={effort} onChange={onEffortChange} className="mt-8 shrink-0" />
          )}
        </div>

        {/* ── High Effort canvas: primary + up to 2 supporting angles ── */}
        {effort === 'high' && (
          <HighEffortUploadCanvas
            singular={categoryCopy.singular}
            canvasH={CANVAS_H}
            primaryImage={jewelryImage}
            resolvedPrimaryImage={resolvedJewelryImage}
            primaryInputRef={jewelryInputRef}
            onPrimaryFiles={handlePrimaryFiles}
            onPrimaryClear={onClearImage}
            supporting={supportingImages}
            onSupportingFile={(_i, file) => addSupportingImages([file])}
            onSupportingRemove={removeSupportingImage}
          />
        )}

        {/* Drop zone — empty state (Low effort) */}
        {effort !== 'high' && !jewelryImage && (
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileUpload(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => jewelryInputRef.current?.click()}
            className={`relative border border-dashed border-border/40 text-center cursor-pointer
                        hover:border-foreground/40 hover:bg-foreground/5 transition-all
                        flex flex-col items-center justify-center ${CANVAS_H}`}
          >
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping"
                   style={{ animationDuration: '2.5s' }} />
              <div className="absolute inset-0 rounded-full bg-primary/5 flex items-center justify-center border-2 border-primary/20">
                <Diamond className="h-9 w-9 text-primary" />
              </div>
            </div>
            <p className="text-lg font-display font-medium mb-1.5">Drop your {categoryCopy.singular} image here</p>
            <p className="text-sm text-muted-foreground mb-6">
              Drag &amp; drop · click to browse · paste (Ctrl+V)
            </p>
            <Button variant="outline" size="lg" className="gap-2 pointer-events-none">
              <ImageIcon className="h-4 w-4" />
              Browse {categoryCopy.singular} files
            </Button>
            <input ref={jewelryInputRef} type="file" accept="image/*,.jfif,.pjpeg,.jpe" className="hidden"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); }} />

            {!showGuide && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setGuideDialogOpen(true); }}
                className="absolute top-3 right-3 flex items-center gap-1.5 border border-foreground/30
                           bg-muted px-2.5 py-1
                           font-mono text-[10px] tracking-widest uppercase
                           text-foreground hover:bg-foreground/10 hover:border-foreground/60
                           transition-colors"
              >
                <Lightbulb className="h-3 w-3" />
                View Guide
              </button>
            )}
          </div>
        )}

        {/* Uploaded preview (Low effort) */}
        {effort !== 'high' && jewelryImage && (
          <div className={`relative border overflow-hidden flex items-center justify-center bg-muted/20 border-border/30 ${CANVAS_H}`}>
            <img src={resolvedJewelryImage ?? undefined} alt="Jewelry" className="max-w-full max-h-full object-contain" />

            {!showGuide && (
              <button
                type="button"
                onClick={() => setGuideDialogOpen(true)}
                className="absolute top-3 right-12 flex items-center gap-1.5 border border-foreground/30
                           bg-muted px-2.5 py-1
                           font-mono text-[10px] tracking-widest uppercase
                           text-foreground hover:bg-foreground/10 hover:border-foreground/60
                           transition-colors z-10"
              >
                <Lightbulb className="h-3 w-3" />
                View Guide
              </button>
            )}

            <button onClick={onClearImage}
                    className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm
                               flex items-center justify-center border border-border/40
                               hover:bg-destructive hover:text-destructive-foreground transition-colors z-10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Action area — Next, shown once a primary image is present (both modes) */}
        {jewelryImage && (
          <div className="flex items-center justify-end gap-3">
            <Button size="lg" onClick={onNextStep} disabled={!canProceed}
                    className="gap-2.5 font-display text-base uppercase tracking-wide px-10
                               bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))]
                               text-background hover:opacity-90 transition-opacity border-0 disabled:opacity-60">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          RIGHT — Upload Guide / My Products  (1 / 3)
          ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 h-full">

        <div className="flex items-start justify-between gap-2">
          <div>
            {/* Invisible spacer mirrors "Step 1" label so headings align */}
            <span className="marta-label block mb-1 invisible" aria-hidden="true">Step 1</span>
            <h3 className="font-display text-3xl md:text-4xl uppercase tracking-tight mt-2">
              {showGuide ? 'Upload Guide' : `My ${categoryCopy.plural}`}
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {showGuide ? 'For best results, follow the guidelines below.' : `Previously uploaded ${categoryCopy.plural}`}
            </p>
          </div>
          {!showGuide && (
            <div className="mt-8 flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Show all
              </span>
              <Switch checked={showAll} onCheckedChange={setShowAll} />
            </div>
          )}
        </div>

        {/* ── Upload Guide ── */}
        {showGuide && <UploadGuidePanel examples={examples} categoryType={exampleCategoryType} isProductShot={isProductShot} />}

        {/* ── Product library ── */}
        {!showGuide && (
          <>
            {isLoading && (
              <div className={`${CANVAS_H} border border-border/30 grid grid-cols-3 gap-2 content-start p-2`}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!isLoading && error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {!isLoading && !error && assets.length > 0 && (
              <div className={`${CANVAS_H} flex flex-col border border-border/30`}>
                {/* Search bar — lives inside the fixed-height container so it never shifts vertical alignment */}
                <div className="flex-shrink-0 border-b border-border/20 px-2 py-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="w-full bg-muted/20 border border-border/20 pl-7 pr-3 py-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/60 transition-colors"
                    />
                  </div>
                </div>
                {/* Scrollable grid */}
                <div className="flex-1 overflow-y-auto p-2">
                  {searchActive && displayAssets.length === 0 ? (
                    <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider text-center py-8">
                      No products match "{productSearch}"
                    </p>
                  ) : (
                    <div className="columns-3 gap-2">
                      {displayAssets.map((asset) => (
                        <ProductCard
                          key={asset.id}
                          asset={asset}
                          isSelected={asset.id === activeProductAssetId}
                          onSelect={() => onProductSelect(asset.thumbnail_url, asset.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isLoading && !error && !searchActive && totalPages > 1 && (
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 0}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground
                             hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {buildPageList(page, totalPages).map((p, idx) =>
                  p === '…' ? (
                    <span key={`ellipsis-${idx}`}
                          className="w-7 h-7 flex items-center justify-center font-mono text-[10px]
                                     text-muted-foreground/50 select-none">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      className={`w-7 h-7 flex items-center justify-center font-mono text-[10px]
                                  tracking-wide transition-colors
                                  ${p === page
                                    ? 'bg-foreground text-background'
                                    : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {(p as number) + 1}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground
                             hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

    </div>

    {/* ── Flagged image popup — centered overlay ── */}

    {guideDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
        <div className="bg-background border border-border/30 shadow-2xl max-w-md w-full mx-4 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
            <div>
              <h4 className="font-display text-2xl uppercase tracking-tight">Upload Guide</h4>
              <p className="text-muted-foreground text-sm mt-0.5">For best results, follow the guidelines below.</p>
            </div>
            <button
              type="button"
              onClick={() => setGuideDialogOpen(false)}
              className="w-7 h-7 flex items-center justify-center border border-border/40
                         hover:bg-foreground/5 transition-colors flex-shrink-0"
              aria-label="Close guide"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Guide content */}
          <div className="px-6 pb-6">
            <UploadGuidePanel examples={examples} categoryType={exampleCategoryType} isProductShot={isProductShot} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

