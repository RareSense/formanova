import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, Loader2 } from 'lucide-react';

import { CLICK_ONLY_BYTES, type IoItem } from '@/lib/admin-workflow-views/io-summary';
import { FileLink } from './FileLink';
import { fetchModelBytes, openModel, type OpenedModel } from './model-viewer';

/**
 * One 3D file in the "Inputs -> Outputs" summary. The WebGL viewer mounts lazily:
 *   - preview 'auto': when the placeholder scrolls into view;
 *   - preview 'click': on "Load 3D preview" (the WebGL cap, or a file over ~50 MB);
 *   - preview 'none' (untrusted host): never; the file is a warned link (FileLink).
 * A failure says "Could not load preview" next to the file's link; the box is never blank.
 */

type State = 'waiting' | 'click' | 'untrusted' | 'loading' | 'failed';

function formatMb(bytes: number | null): string | null {
  return bytes === null ? null : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(item: IoItem, fallbackStem: string): string {
  const stem = (item.name ?? `${fallbackStem}-${item.label}`).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 100);
  return stem.toLowerCase().endsWith(`.${item.format}`) ? stem : `${stem}.${item.format}`;
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
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted/20" data-testid="model-viewport" style={{ touchAction: 'none' }}>
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

export function ModelPreview({ item, fallbackStem }: { item: IoItem; fallbackStem: string }) {
  const initial: State = !item.trusted || item.preview === 'none' ? 'untrusted' : item.preview === 'auto' ? 'waiting' : 'click';
  const [state, setState] = useState<State>(initial);
  const [reason, setReason] = useState<string | null>(null);
  const placeholder = useRef<HTMLDivElement>(null);

  // Auto previews mount only once visible. No IntersectionObserver: wait for a click instead.
  useEffect(() => {
    if (state !== 'waiting') return;
    const el = placeholder.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        setState('loading');
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  const size = formatMb(item.bytes);
  const kind = item.format ? item.format.toUpperCase() : '3D';
  const file = { label: item.label, url: item.url, name: item.name, bytes: item.bytes, ext: item.format };

  let body;
  if (state === 'untrusted') {
    body = null;
  } else if (state === 'loading') {
    body = <Viewport url={item.url} name={fileName(item, fallbackStem)} onFail={(r) => { setReason(r); setState('failed'); }} />;
  } else if (state === 'failed') {
    body = (
      <div className="flex min-h-40 w-full flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/20 p-3 text-center text-muted-foreground">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm">Could not load preview</span>
        {reason && <span className="break-all font-mono text-[10px]">{reason}</span>}
      </div>
    );
  } else {
    body = (
      <div ref={placeholder} className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3 text-center">
        <Box className="h-6 w-6 text-muted-foreground/60" />
        <button
          type="button"
          onClick={() => setState('loading')}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/40"
        >
          Load 3D preview
        </button>
        {state === 'click' && item.bytes !== null && item.bytes > CLICK_ONLY_BYTES && (
          <span className="text-[11px] text-muted-foreground">{`${size}, loads on click`}</span>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2" data-testid="model-preview" data-format={item.format ?? ''} data-state={state}>
      <p className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {item.label}
        {item.label.toUpperCase() !== kind && <span className="ml-1 rounded bg-muted px-1">{kind}</span>}
      </p>
      {body}
      <FileLink file={file} fallbackStem={fallbackStem} />
    </div>
  );
}
