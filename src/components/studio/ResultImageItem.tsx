import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShopifyPublishButton } from '@/components/shopify/ShopifyPublishButton';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { findGeneratedPhotoAssetByWorkflowId, getAssetDisplayName, type UserAsset } from '@/lib/assets-api';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { TO_SINGULAR } from '@/lib/jewelry-utils';

function safeFetch(src: string): Promise<Response> {
  // Artifact paths need the Bearer token; CDN/signed URLs must use plain fetch
  // (adding Authorization to a cross-origin CDN request triggers CORS preflight failure)
  return src.includes('/artifacts/') ? authenticatedFetch(src) : fetch(src);
}

async function openImageInNewTab(src: string) {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    window.open(src, '_blank', 'noopener,noreferrer');
    return;
  }

  const newTab = window.open('', '_blank', 'noopener,noreferrer');
  if (!newTab) throw new Error('Popup blocked');

  try {
    const resp = await safeFetch(src);
    if (!resp.ok) throw new Error('Fetch failed');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    newTab.location.href = blobUrl;
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    newTab.close();
    throw error;
  }
}

export function ResultImageItem({ url, index, workflowId, jewelryType, naturalAspect }: {
  url: string;
  index: number;
  workflowId: string | null;
  jewelryType: string;
  naturalAspect?: boolean;
}) {
  const resolvedSrc = useAuthenticatedImage(url);
  const [generatedAsset, setGeneratedAsset] = useState<UserAsset | null>(null);
  const [isResolvingAsset, setIsResolvingAsset] = useState(Boolean(workflowId));

  useEffect(() => {
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
  }, [workflowId]);

  const handleDownload = async () => {
    try {
      const src = resolvedSrc ?? url;
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
      alert('Download failed. Please try again.');
    }
  };

  return (
    <div className="relative group border border-border/30 overflow-hidden w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] max-w-xs">
      <div className="relative">
        <img
          src={resolvedSrc ?? ""}
          alt={`Result ${index + 1}`}
          className={`w-full object-contain bg-muted/30 max-h-[70vh]${naturalAspect ? '' : ' aspect-[3/4]'}`}
        />
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
                await openImageInNewTab(src);
              } catch {
                alert('Could not open the image in a new tab. Please try again.');
              }
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/30 bg-background/80 p-3">
        <Button
          variant="outline"
          size="sm"
          aria-label="Download image"
          className="h-10 w-full gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
        <ShopifyPublishButton
          assetId={generatedAsset?.id ?? null}
          assetName={(generatedAsset && getAssetDisplayName(generatedAsset)) || generatedAsset?.name || `Photoshoot ${index + 1}`}
          workflowId={workflowId}
          isResolvingAsset={isResolvingAsset}
          className="h-10 w-full font-mono text-[10px] uppercase tracking-[0.15em]"
        />
      </div>
    </div>
  );
}
