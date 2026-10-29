/**
 * The pictures of the shoot, filling in live under the view: each tile shows
 * its picture as soon as it is drawn or placed, "Drawing…" / "Placing…" while
 * it is made, or why it failed. Click a tile to see it large and download it.
 */
import { useState } from 'react';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { progress, type Picture, type QueueState } from '@/lib/cad-to-catalog-queue';

interface Props {
  queue: QueueState;
  onDownloadAll: () => void;
  downloading: boolean;
  onDownloadOne: (p: Picture) => void;
}

const CHECKER = 'repeating-conic-gradient(#e8e8e8 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';

export default function PicturesStrip({ queue, onDownloadAll, downloading, onDownloadOne }: Props) {
  const [open, setOpen] = useState<Picture | null>(null);
  const pr = progress(queue);
  if (!queue.pictures.length) return null;
  const pieceName = (id: string) => queue.pieces.find((p) => p.id === id)?.name ?? '';
  // Newest piece first, its pictures in shooting order.
  const order = [...new Set(queue.pictures.map((x) => x.pieceId))].reverse();
  const list = order.flatMap((id) => queue.pictures.filter((x) => x.pieceId === id));

  return (
    <section aria-label="Pictures" className="absolute left-0 right-0 bottom-0 z-10 bg-card/95 border-t border-border">
      <div className="flex items-center justify-between gap-3 px-3 pt-2">
        <span className="font-display text-sm tracking-[0.15em] uppercase font-bold">
          Pictures <span className="font-mono text-[10px] text-muted-foreground normal-case tracking-normal">{pr.done}/{pr.total}{pr.failed ? ` · ${pr.failed} failed` : ''}</span>
        </span>
        <button type="button" disabled={!pr.done || downloading} onClick={onDownloadAll}
          className="h-8 px-4 flex items-center gap-1.5 border border-foreground font-mono text-[10px] uppercase tracking-[0.15em] disabled:opacity-30">
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download all
        </button>
      </div>
      <ul className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-thin">
        {list.map((x) => (
          <li key={x.id} className="shrink-0">
            <button type="button" disabled={x.status !== 'done'} onClick={() => setOpen(x)}
              title={`${pieceName(x.pieceId)} · ${x.name}${x.error ? ` · ${x.error}` : ''}`}
              className="relative w-24 h-24 border border-border overflow-hidden bg-background disabled:cursor-default">
              {x.status === 'done' && x.url && (
                <img src={x.url} alt={x.name} className="absolute inset-0 w-full h-full object-contain" style={x.background === 'transparent' ? { background: CHECKER } : undefined} />
              )}
              {(x.status === 'drawing' || x.status === 'placing' || x.status === 'waiting') && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 font-mono text-[8px] uppercase text-muted-foreground">
                  {x.status !== 'waiting' && <Loader2 className="w-4 h-4 animate-spin text-formanova-hero-accent" />}
                  {x.status === 'drawing' ? 'Drawing…' : x.status === 'placing' ? 'Placing…' : 'Waiting'}
                </span>
              )}
              {x.status === 'failed' && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 font-mono text-[8px] uppercase text-destructive text-center">
                  <AlertTriangle className="w-4 h-4" /> Failed
                </span>
              )}
              <span className="absolute left-0 right-0 bottom-0 bg-card/85 px-1 py-0.5 font-mono text-[8px] truncate text-left">{x.angle.name}{x.metal ? ` · ${x.metal}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="font-display text-lg uppercase tracking-wide truncate">{open ? `${pieceName(open.pieceId)} · ${open.name}` : ''}</DialogTitle>
          {open?.url && <img src={open.url} alt={open.name} className="w-full max-h-[70vh] object-contain" style={open.background === 'transparent' ? { background: CHECKER } : undefined} />}
          <div className="flex justify-end">
            <button type="button" onClick={() => open && onDownloadOne(open)} className="h-10 px-6 flex items-center gap-2 bg-formanova-hero-accent text-primary-foreground font-mono text-[11px] uppercase tracking-[0.2em]">
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
