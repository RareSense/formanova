import { useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';

import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * A labelled picture thumbnail; click opens it full size. Artifact urls are fetched with
 * the admin's token (useAuthenticatedImage). The thumbnail is height-capped and lazy, so a
 * very large picture is scaled by the browser rather than laid out at full size.
 */
export function ImageThumb({ url, label, zoomable = true }: { url: string | null; label: string; zoomable?: boolean }) {
  const resolvedUrl = useAuthenticatedImage(url);
  const [open, setOpen] = useState(false);

  return (
    <figure className="space-y-2" aria-label={label} data-url={url ?? ''}>
      <figcaption className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</figcaption>
      <div className="overflow-hidden rounded-md border border-border bg-muted/20">
        {url ? (
          resolvedUrl ? (
            zoomable ? (
              <>
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => setOpen(true)} aria-label={`Open ${label} full size`}>
                  <img src={resolvedUrl} alt={label} loading="lazy" decoding="async" className="max-h-72 w-full object-contain" />
                </button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogContent className="max-w-[min(96vw,1400px)] p-3 sm:p-4">
                    <DialogTitle className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</DialogTitle>
                    <img src={resolvedUrl} alt={label} decoding="async" className="max-h-[85vh] w-full object-contain" />
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <img src={resolvedUrl} alt={label} loading="lazy" decoding="async" className="max-h-72 w-full object-contain" />
            )
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )
        ) : (
          <div className="flex h-40 items-center justify-center">
            <ImageOff className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>
    </figure>
  );
}

export function ImageGrid({ images }: { images: Array<{ url: string; label: string }> }) {
  if (!images.length) return null;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {images.map((image, i) => <ImageThumb key={`${image.url}-${i}`} url={image.url} label={image.label} />)}
    </div>
  );
}
