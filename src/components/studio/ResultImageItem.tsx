import { useEffect, useState, type ReactNode } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShopifyPublishButton } from '@/components/shopify/ShopifyPublishButton';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { findGeneratedPhotoAssetByWorkflowId, getAssetDisplayName, type UserAsset } from '@/lib/assets-api';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { resolutionTierLabel } from '@/lib/upscale-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';

function safeFetch(src: string): Promise<Response> {
  // Artifact paths need the Bearer token; CDN/signed URLs must use plain fetch
  // (adding Authorization to a cross-origin CDN request triggers CORS preflight failure)
  return src.includes('/artifacts/') ? authenticatedFetch(src) : fetch(src);
}

function openImageInNewTab(src: string) {
  // Direct navigation works for blob:, data:, artifact-resolved blob URLs, and
  // public/SAS https URLs alike, and unlike fetch() it is not subject to CORS,
  // so cross-origin Azure result images open reliably.
  // Chromium cannot resolve blob: URLs in a noopener window (the tab lands in a
  // separate agent cluster and shows "site can't be reached"), so same-origin
  // blob/data URLs we minted ourselves must open WITHOUT noopener.
  const features = src.startsWith('blob:') || src.startsWith('data:') ? '' : 'noopener,noreferrer';
  const win = window.open(src, '_blank', features);
  if (!win) throw new Error('Popup blocked');
}

export interface ResultImageMeta {
  tier: string | null;
  width: number;
  height: number;
}

export function ResultImageItem({ url, index, workflowId, outputAssetId, jewelryType, naturalAspect, hero, onMeta, belowImage }: {
  url: string;
  index: number;
  workflowId: string | null;
  outputAssetId?: string | null;
  jewelryType: string;
  naturalAspect?: boolean;
  /** Single-result mode: render large and centered as the screen's hero. */
  hero?: boolean;
  /** Reports the loaded image's tier + pixel dimensions (for a details line). */
  onMeta?: (meta: ResultImageMeta) => void;
  /** Rendered between the image and the Download/Export pair (metadata + upscale row). */
  belowImage?: ReactNode;
}) {
  const resolvedSrc = useAuthenticatedImage(url);
  // Track load so the card holds its space until the image is ready. Without this,
  // a not-yet-loaded/failed image (naturalAspect = no fixed height) collapses the
  // container to zero height and the badge + action buttons appear to vanish.
  const [loaded, setLoaded] = useState(false);
  // Re-show the spinner whenever the source swaps (e.g. an upscaled result
  // replacing the original) instead of holding the previous image on screen.
  useEffect(() => {
    setLoaded(false);
  }, [resolvedSrc]);

  const [generatedAsset, setGeneratedAsset] = useState<UserAsset | null>(null);
  // Skip the lookup entirely when outputAssetId is already known
  const [isResolvingAsset, setIsResolvingAsset] = useState(Boolean(workflowId) && outputAssetId === undefined);

  useEffect(() => {
    // If the caller already knows the asset ID, no lookup needed
    if (outputAssetId !== undefined) {
      setIsResolvingAsset(false);
      return;
    }
    if (!workflowId) {
      setGeneratedAsset(null);
      setIsResolvingAsset(false);
      return;
    }

    let cancelled = false;
    setIsResolvingAsset(true);

    findGeneratedPhotoAssetByWorkflowId(workflowId)
      .then((asset) => {
        if (cancelled) return;
        setGeneratedAsset(asset);
        setIsResolvingAsset(false);
      })
      .catch((error) => {
        console.error('[ResultImageItem] asset lookup error:', error);
        if (cancelled) return;
        setGeneratedAsset(null);
        setIsResolvingAsset(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workflowId, outputAssetId]);

  const handleDownload = async () => {
    const src = resolvedSrc ?? url;
    try {
      let blobUrl: string;
      if (src.startsWith('blob:') || src.startsWith('data:')) {
        blobUrl = src;
      } else {
        const resp = await safeFetch(src);
        if (!resp.ok) throw new Error('Fetch failed');
        const blob = await resp.blob();
        blobUrl = URL.createObjectURL(blob);
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `photoshoot-${workflowId?.slice(0, 8)}-${index + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (!src.startsWith('blob:') && !src.startsWith('data:')) URL.revokeObjectURL(blobUrl);
      import('@/lib/posthog-events').then(m => m.trackDownloadClicked({
        file_type: 'jpg',
        context: 'unified-studio',
        category: TO_SINGULAR[jewelryType] ?? jewelryType,
      }));
    } catch {
      // A cross-origin image (e.g. an Azure blob without CORS) blocks the
      // fetch-to-blob path. Fall back to opening it so the user can save it
      // manually instead of showing a dead-end error.
      try {
        openImageInNewTab(src);
      } catch {
        alert('Download failed. Please try again.');
      }
    }
  };

  return (
    <div className={hero ? 'w-full max-w-2xl mx-auto' : 'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]'}>
      {/* Image card */}
      <div className="relative group border border-border/30 overflow-hidden bg-muted/20 min-h-[220px]">
        <img
          src={resolvedSrc ?? ""}
          alt={`Result ${index + 1}`}
          onLoad={(e) => {
            const el = e.currentTarget;
            const width = el.naturalWidth;
            const height = el.naturalHeight;
            setLoaded(true);
            // Tier ("1K"/"2K"...) from real pixels - re-fires when resolvedSrc
            // swaps (e.g. an upscaled result), keeping the details line current.
            onMeta?.({ tier: resolutionTierLabel(Math.max(width, height)), width, height });
          }}
          onError={() => setLoaded(false)}
          className={`w-full object-contain bg-muted/30 ${hero ? 'max-h-[72vh]' : 'max-h-[70vh]'}${naturalAspect ? '' : ' aspect-[3/4]'}`}
        />
        {/* Loading state — keeps the card sized so the badge + buttons stay visible. */}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
          </div>
        )}
        {/* No resolution badge on the image itself - the tier is reported via
            onMeta and shown in the details line under the preview instead. */}
        <div className="absolute top-2 right-2 flex gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Open image in new tab"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm border-border/40 hover:bg-background"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const src = resolvedSrc ?? url;
                if (!src) throw new Error('No image source');
                openImageInNewTab(src);
              } catch {
                alert('Could not open the image in a new tab. Please try again.');
              }
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Metadata + upscale row (parent-owned), directly under the image */}
      {belowImage && <div className="mt-2.5">{belowImage}</div>}

      {/* Ship-it actions — always equal-width two columns */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          aria-label="Download image"
          onClick={handleDownload}
          className="h-[44px] w-full gap-[6px] border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-[10px] font-mono text-[10px] uppercase tracking-[0.03em] text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden whitespace-nowrap sm:inline">Download image</span>
          <span className="whitespace-nowrap sm:hidden">Download</span>
        </Button>
        <ShopifyPublishButton
          assetId={outputAssetId ?? generatedAsset?.id ?? null}
          assetName={(generatedAsset && getAssetDisplayName(generatedAsset)) || generatedAsset?.name || `Photoshoot ${index + 1}`}
          workflowId={workflowId}
          previewUrl={resolvedSrc ?? url}
          isResolvingAsset={isResolvingAsset}
          label="Export to Shopify"
          shortLabel="Export"
          className="h-[44px] w-full gap-[6px] px-[10px] font-mono text-[10px] uppercase tracking-[0.03em]"
        />
      </div>
    </div>
  );
}
