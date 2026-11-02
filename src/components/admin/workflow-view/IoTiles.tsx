import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Box, Download, FileArchive, FileText, FileVideo, File as FileIcon, Loader2 } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { IoItem } from '@/lib/admin-workflow-views/io-summary';
import { externalHref, formatBytes, isSameOrigin, useFileDownload } from './use-file-download';
import { fetchModelBytes, openModel, type OpenedModel } from './model-viewer';

/**
 * Small, equal tiles for the Inputs -> Outputs strip (pictures use ImageThumb's tile).
 *   - 3D (GLB / 3DM / STL): cube icon, format badge, file name and size. No WebGL until the
 *     tile is clicked; the viewer (CatalogEngine: orbit, zoom, pan) opens in a dialog, and a
 *     file over ~50 MB asks once more there before it is fetched.
 *   - Any other file: type icon and badge; the tile downloads it.
 *   - Another host: never fetched; the tile says so and links out (no token, no referrer).
 */

const badgeOf = (item: IoItem) => (item.format ? item.format.toUpperCase().slice(0, 5) : 'FILE');

function iconFor(item: IoItem) {
  if (item.kind === 'model3d') return Box;
  const f = item.format ?? '';
  if (['pdf', 'txt', 'json', 'csv'].includes(f)) return FileText;
  if (['zip', 'gz'].includes(f)) return FileArchive;
  if (['mp4', 'mov', 'webm', 'quicktime'].includes(f)) return FileVideo;
  return FileIcon;
}

/** A 120 px square with a caption underneath; every tile in the strip has this frame. */
export function TileFrame({ label, children, testId, format }: { label: string; children: ReactNode; testId?: string; format?: string | null }) {
  return (
    <div className="w-[120px] shrink-0 space-y-1" data-testid={testId} data-format={format ?? undefined} aria-label={label} role="group">
      <div className="relative h-[120px] w-[120px] overflow-hidden rounded-md border border-border bg-muted/20">{children}</div>
      <p title={label} className="line-clamp-2 break-words text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function TileBody({ item }: { item: IoItem }) {
  const Icon = iconFor(item);
  const size = formatBytes(item.bytes);
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      <span className="rounded bg-muted px-1 font-mono text-[10px]">{badgeOf(item)}</span>
      {item.name && <span className="w-full truncate text-[10px] text-muted-foreground" title={item.name}>{item.name}</span>}
      {size && <span className="font-mono text-[10px] text-muted-foreground">{size}</span>}
      {item.kind === 'model3d' && item.trusted && <span className="text-[10px] underline underline-offset-2">View 3D</span>}
    </span>
  );
}

/** Not fetchable from here (another host, or not a same-origin file): say so, link out. */
function ExternalBody({ item }: { item: IoItem }) {
  const href = externalHref(item.url);
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] leading-tight">
      <span className="rounded bg-muted px-1 font-mono">{badgeOf(item)}</span>
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="text-amber-600 dark:text-amber-400">External file, open at your own risk</span>
      {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" title={href} className="underline">Open link</a>}
    </span>
  );
}

function DownloadButton({ item, fallbackStem, className, children }: { item: IoItem; fallbackStem: string; className: string; children: ReactNode }) {
  const file = { label: item.label, url: item.url, name: item.name, bytes: item.bytes, ext: item.format };
  const { busy, download } = useFileDownload(file, fallbackStem);
  const size = formatBytes(item.bytes);
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={className}
      aria-label={`Download ${item.label}${item.name ? ` ${item.name}` : ''}${size ? ` ${size}` : ''}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

export function FileTile({ item, fallbackStem }: { item: IoItem; fallbackStem: string }) {
  const local = item.trusted && isSameOrigin(item.url);
  return (
    <TileFrame label={item.label} testId="file-tile" format={item.format}>
      {local ? (
        <DownloadButton item={item} fallbackStem={fallbackStem} className="h-full w-full hover:bg-muted/40">
          <TileBody item={item} />
          <Download className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </DownloadButton>
      ) : (
        <ExternalBody item={item} />
      )}
    </TileFrame>
  );
}

function Viewport({ url, name, onFail }: { url: string; name: string; onFail: (reason: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    const abort = new AbortController();
    let opened: OpenedModel | null = null;
    let live = true;
    (async () => {
      try {
        const data = await fetchModelBytes(url, abort.signal);
        if (!live || !host.current) return;
        const model = await openModel(host.current, data, name);
        if (!live) { model.dispose(); return; }
        opened = model;
        setReady(true);
      } catch (error) {
        if (live) onFailRef.current(error instanceof Error ? error.message : 'error');
      }
    })();
    return () => {
      live = false;
      abort.abort();
      opened?.dispose();
    };
  }, [url, name]);

  return (
    <div className="relative h-full w-full" data-testid="model-viewport" style={{ touchAction: 'none' }}>
      <div ref={host} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Loading 3D</span>
        </div>
      )}
    </div>
  );
}

function viewerFileName(item: IoItem, fallbackStem: string): string {
  const stem = (item.name ?? `${fallbackStem}-${item.label}`).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 100);
  return stem.toLowerCase().endsWith(`.${item.format}`) ? stem : `${stem}.${item.format}`;
}

/** The viewer dialog: mounts WebGL only while open; a large file waits for "Load preview". */
function ModelDialog({ item, fallbackStem, open, onOpenChange }: { item: IoItem; fallbackStem: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [confirmed, setConfirmed] = useState(!item.large);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!open) { setFailed(null); setConfirmed(!item.large); }
  }, [open, item.large]);
  const size = formatBytes(item.bytes);
  const local = isSameOrigin(item.url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(94vw,960px)] p-3 sm:p-4">
        <DialogTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {item.label}
          <span className="rounded bg-muted px-1 font-mono text-[10px]">{badgeOf(item)}</span>
          {item.name && <span className="truncate font-normal text-muted-foreground">{item.name}</span>}
          {size && <span className="font-mono text-xs font-normal text-muted-foreground">{size}</span>}
        </DialogTitle>
        <DialogDescription className="sr-only">Interactive 3D preview: drag to orbit, scroll to zoom, right-drag to pan.</DialogDescription>
        <div className="aspect-[4/3] max-h-[72vh] w-full overflow-hidden rounded-md border border-border bg-muted/20">
          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-muted-foreground">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm">Could not load preview</span>
              <span className="break-all font-mono text-[10px]">{failed}</span>
            </div>
          ) : !confirmed ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
              <Box className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{`Large file${size ? ` (${size})` : ''}: click to load`}</span>
              <button type="button" onClick={() => setConfirmed(true)} className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40">
                Load preview
              </button>
            </div>
          ) : open ? (
            <Viewport url={item.url} name={viewerFileName(item, fallbackStem)} onFail={setFailed} />
          ) : null}
        </div>
        {local && (
          <DownloadButton item={item} fallbackStem={fallbackStem} className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40">
            <Download className="h-4 w-4" /> Download
          </DownloadButton>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ModelTile({ item, fallbackStem }: { item: IoItem; fallbackStem: string }) {
  const [open, setOpen] = useState(false);
  if (!item.trusted) {
    return (
      <TileFrame label={item.label} testId="model-tile" format={item.format}>
        <ExternalBody item={item} />
      </TileFrame>
    );
  }
  return (
    <TileFrame label={item.label} testId="model-tile" format={item.format}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-full w-full hover:bg-muted/40"
        aria-label={`Open 3D preview of ${item.label}${item.name ? ` ${item.name}` : ''}`}
      >
        <TileBody item={item} />
      </button>
      <ModelDialog item={item} fallbackStem={fallbackStem} open={open} onOpenChange={setOpen} />
    </TileFrame>
  );
}
