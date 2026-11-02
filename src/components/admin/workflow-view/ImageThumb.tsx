import { useState } from 'react';
import { AlertTriangle, ImageOff, Loader2 } from 'lucide-react';

import { useAuthenticatedImageState } from '@/hooks/useAuthenticatedImage';
import { azureUriToUrl } from '@/lib/azure-utils';
import { classifyUrl, isTrustedImageSrc } from '@/lib/admin-workflow-views/url-safety';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const GALLERY_LIMIT = 24;

/**
 * A labelled picture thumbnail; click opens it full size. Artifact urls are fetched with the
 * admin's token. Only the artifact proxy, same origin and the configured storage hosts are
 * loaded (url-safety.ts); any other host becomes a link with a warning, so a payload cannot
 * make the admin's browser call a third party. A failed load says so instead of spinning.
 */
export function ImageThumb({ url, label, path, tile = false }: { url: string | null; label: string; path?: string; tile?: boolean }) {
  const normalized = url ? azureUriToUrl(url) || url : null;
  const trusted = isTrustedImageSrc(normalized);
  const { src, failed: fetchFailed } = useAuthenticatedImageState(trusted ? normalized : null);
  const [imgFailed, setImgFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // The src it last painted. A lazy <img> below the fold has a src but no size until the
  // browser decodes it, so until onLoad it keeps a sized "Loading" placeholder (no empty strip).
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const failed = fetchFailed || imgFailed;
  const painted = Boolean(src) && paintedSrc === src;
  const busy = Boolean(url) && trusted && !failed && !painted;

  // tile: a small square for the Inputs -> Outputs strip, caption underneath.
  const box = tile ? 'flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center' : '';
  let body;
  if (!url) {
    body = <div className={tile ? box : 'flex h-40 items-center justify-center'}><ImageOff className="h-5 w-5 text-muted-foreground/50" /></div>;
  } else if (!trusted) {
    const link = classifyUrl(url);
    const href = link && (link.kind === 'image' || link.kind === 'link') && /^https?:\/\//i.test(link.url) ? link.url : null;
    body = tile ? (
      <div className={`${box} text-[10px] leading-tight`}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-amber-600 dark:text-amber-400">External image, not loaded</span>
        {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" title={href} className="underline">Open link</a>}
      </div>
    ) : (
      <div className="flex min-h-24 flex-col justify-center gap-1 p-3 text-xs">
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> External image, not loaded
        </span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{href}</a>
        ) : (
          <span className="break-all text-muted-foreground">{url.slice(0, 300)}</span>
        )}
      </div>
    );
  } else if (failed) {
    body = (
      <div className={tile ? `${box} text-muted-foreground` : 'flex h-40 flex-col items-center justify-center gap-1 text-muted-foreground'}>
        <ImageOff className="h-5 w-5" />
        <span className="font-mono text-[10px] uppercase tracking-widest">Could not load</span>
      </div>
    );
  } else if (!src) {
    body = <div className={tile ? box : 'flex h-40 items-center justify-center'}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  } else {
    body = (
      <>
        <button
          type="button"
          className={`relative block w-full cursor-zoom-in ${tile ? 'h-full' : painted ? '' : 'min-h-40'}`}
          onClick={() => setOpen(true)}
          aria-label={`Open ${label} full size`}
        >
          <img
            src={src}
            alt={label}
            loading="lazy"
            decoding="async"
            onLoad={() => setPaintedSrc(src)}
            onError={() => setImgFailed(true)}
            className={tile ? 'h-full w-full object-cover' : 'max-h-72 w-full object-contain'}
          />
          {!painted && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-mono text-[10px] uppercase tracking-widest">Loading</span>
            </span>
          )}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[min(96vw,1400px)] p-3 sm:p-4">
            <DialogTitle className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</DialogTitle>
            <img src={src} alt={label} decoding="async" className="max-h-[85vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (tile) {
    return (
      <figure className="w-[120px] shrink-0 space-y-1" aria-label={label} aria-busy={busy} data-url={url ?? ''} data-path={path}>
        <div className="h-[120px] w-[120px] overflow-hidden rounded-md border border-border bg-muted/20">{body}</div>
        <figcaption title={label} className="line-clamp-2 break-words text-[11px] leading-tight text-muted-foreground">{label}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="min-w-0 space-y-2" aria-label={label} aria-busy={busy} data-url={url ?? ''} data-path={path}>
      <figcaption className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</figcaption>
      <div className="overflow-hidden rounded-md border border-border bg-muted/20">{body}</div>
    </figure>
  );
}

/** Pictures in a grid; long lists show the first GALLERY_LIMIT and a "show more". */
export function ImageGrid({ images }: { images: Array<{ url: string; label: string; path?: string }> }) {
  const [shown, setShown] = useState(GALLERY_LIMIT);
  if (!images.length) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {images.slice(0, shown).map((image, i) => <ImageThumb key={`${image.path ?? image.url}-${i}`} url={image.url} label={image.label} path={image.path} />)}
      </div>
      {images.length > shown && (
        <button type="button" className="text-xs underline" onClick={() => setShown((n) => n + GALLERY_LIMIT)}>
          Show {Math.min(GALLERY_LIMIT, images.length - shown)} more of {images.length - shown} pictures
        </button>
      )}
    </div>
  );
}
