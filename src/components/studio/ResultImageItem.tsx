import { useEffect, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
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

export function ResultImageItem({ url, index, workflowId, jewelryType, naturalAspect, hero, onMeta }: {
  url: string;
  index: number;
  workflowId: string | null;
  jewelryType: string;
  naturalAspect?: boolean;
  /** Single-result mode: render large and centered as the screen's hero. */
  hero?: boolean;
  /** Reports the loaded image's tier + pixel dimensions (for a details line). */
  onMeta?: (meta: ResultImageMeta) => void;
}) {
  const resolvedSrc = useAuthenticatedImage(url);
  // Resolution badge ("1K"/"2K"/"4K"/"6K"...) derived from the rendered image's
  // real pixels. Re-fires whenever resolvedSrc changes, so swapping in an
  // upscaled result automatically updates the badge to its new tier.
  const [tier, setTier] = useState<string | null>(null);
  // Track load so the card holds its space until the image is ready. Without this,
  // a not-yet-loaded/failed image (naturalAspect = no fixed height) collapses the
  // container to zero height and the badge + action buttons appear to vanish.
  const [loaded, setLoaded] = useState(false);
  // Re-show the spinner whenever the source swaps (e.g. an upscaled result
  // replacing the original) instead of holding the previous image on screen.
  useEffect(() => {
    setLoaded(false);
  }, [resolvedSrc]);
  return (
    <div
      className={`relative group border border-border/30 overflow-hidden bg-muted/20 min-h-[220px] ${
        hero
          ? 'w-full max-w-2xl mx-auto'
          : 'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]'
      }`}
    >
      <img
        src={resolvedSrc ?? ""}
        alt={`Result ${index + 1}`}
        onLoad={(e) => {
          const el = e.currentTarget;
          const width = el.naturalWidth;
          const height = el.naturalHeight;
          const nextTier = resolutionTierLabel(Math.max(width, height));
          setTier(nextTier);
          setLoaded(true);
          onMeta?.({ tier: nextTier, width, height });
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
      {tier && (
        <span className="absolute top-3 left-3 rounded-md border border-foreground/15 bg-background/90 px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-foreground shadow-sm backdrop-blur-sm">
          {tier}
        </span>
      )}
      <div className="absolute top-2 right-2 flex gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm border-border/40 hover:bg-background"
          onClick={async (e) => {
            e.stopPropagation();
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
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
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
  );
}
