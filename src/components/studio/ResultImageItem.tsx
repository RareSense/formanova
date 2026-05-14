import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
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
  return (
    <div className="relative group border border-border/30 overflow-hidden w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] max-w-xs">
      <img
        src={resolvedSrc ?? ""}
        alt={`Result ${index + 1}`}
        className={`w-full object-contain bg-muted/30${naturalAspect ? '' : ' aspect-[3/4]'}`}
      />
      <div className="absolute top-2 right-2 flex gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm border-border/40 hover:bg-background"
          onClick={async (e) => {
            e.stopPropagation();
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
            } catch { alert('Download failed. Please try again.'); }
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
  );
}
