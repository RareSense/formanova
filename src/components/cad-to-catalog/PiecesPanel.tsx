/**
 * Pieces: every CAD file dropped on the page, one row each, with its jewellery
 * type (guessed from the name, changeable) and where it is in the shoot.
 * Clicking a row opens that piece in the view.
 */
import { useRef } from 'react';
import { FolderOpen, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { CATEGORIES, CATEGORY_LABEL, progress, type JewelryCategory, type Piece, type QueueState } from '@/lib/cad-to-catalog-queue';
import { entriesFromInput, type FileEntry } from './engine/package';

interface Props {
  queue: QueueState;
  openId: string | null;
  onFiles: (entries: FileEntry[]) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCategory: (id: string, c: JewelryCategory) => void;
}

function statusText(piece: Piece, queue: QueueState): { text: string; busy: boolean } {
  const pr = progress(queue, piece.id);
  const placing = queue.pictures.some((x) => x.pieceId === piece.id && x.status === 'placing');
  switch (piece.status) {
    case 'opening': return { text: 'Opening…', busy: true };
    case 'shooting': return { text: `Shooting ${pr.done}/${pr.total}`, busy: true };
    case 'failed': return { text: piece.error ? `Failed: ${piece.error}` : 'Failed', busy: false };
    case 'stopped': return { text: pr.done ? `Stopped · ${pr.done}/${pr.total}` : 'Stopped', busy: false };
    case 'done':
      if (placing) return { text: `Placing in photos · ${pr.done}/${pr.total}`, busy: true };
      return { text: pr.failed ? `${pr.done}/${pr.total} · ${pr.failed} failed` : `Done · ${pr.done}`, busy: false };
    default: return { text: queue.running && pr.total ? 'Waiting' : pr.done ? `${pr.done} pictures` : 'Not shot yet', busy: false };
  }
}

export default function PiecesPanel({ queue, openId, onFiles, onOpen, onRemove, onRetry, onCategory }: Props) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => { if (list?.length) onFiles(entriesFromInput(list)); };

  return (
    <section aria-label="Pieces" className="flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-display text-sm tracking-[0.15em] uppercase font-bold">Pieces</span>
        <span className="font-mono text-[10px] text-muted-foreground">{queue.pieces.length}</span>
      </div>
      <div className="flex gap-1.5 px-4 pt-3">
        <button type="button" onClick={() => files.current?.click()} className="flex-1 h-9 px-4 flex items-center justify-center gap-1.5 bg-formanova-hero-accent text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em]">
          <Plus className="w-3.5 h-3.5" /> Add CAD files
        </button>
        <button type="button" onClick={() => folder.current?.click()} aria-label="Add a folder" title="Add a whole folder" className="h-9 px-4 flex items-center justify-center border border-border hover:bg-accent/50">
          <FolderOpen className="w-4 h-4" />
        </button>
        <input ref={files} type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      </div>
      {!queue.pieces.length ? (
        <p className="px-4 py-4 font-mono text-[10px] leading-relaxed text-muted-foreground text-justify">
          Add one CAD file, or many at once: every piece is opened in the view and shot with the same angles, metals and backgrounds.
        </p>
      ) : (
        <ul className="overflow-y-auto min-h-0 max-h-[34vh] px-4 py-3 space-y-1 scrollbar-thin">
          {queue.pieces.map((p) => {
            const st = statusText(p, queue);
            const open = p.id === openId;
            const busy = queue.running && p.status !== 'waiting' && p.status !== 'done';
            const thumb = queue.pictures.find((x) => x.pieceId === p.id && x.status === 'done' && x.background === 'white')?.url;
            return (
              <li key={p.id} className={`flex items-stretch border ${open ? 'border-foreground bg-accent/30' : 'border-border'}`}>
                <button type="button" disabled={queue.running} onClick={() => onOpen(p.id)} className="flex-1 min-w-0 flex items-center gap-2.5 p-2 text-left hover:bg-accent/20 disabled:hover:bg-transparent">
                  <span className="w-10 h-10 shrink-0 bg-muted/40 border border-border/60 overflow-hidden">
                    {thumb && <img src={thumb} alt="" className="w-full h-full object-contain" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px]" title={p.name}>{p.name}</span>
                    <span className={`flex items-center gap-1 truncate font-mono text-[9px] uppercase tracking-[0.1em] ${p.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`} title={st.text}>
                      {st.busy && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}{st.text}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-1 pr-1.5">
                  <select
                    value={p.category}
                    disabled={busy}
                    onChange={(e) => onCategory(p.id, e.target.value as JewelryCategory)}
                    aria-label={`Jewellery type of ${p.name}`}
                    className="h-7 px-1 bg-background border border-border font-mono text-[10px]"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                  {(p.status === 'failed' || p.status === 'stopped') && !queue.running && (
                    <button type="button" onClick={() => onRetry(p.id)} aria-label={`Shoot ${p.name} again`} title="Shoot again" className="w-7 h-7 flex items-center justify-center border border-border hover:bg-accent/50">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`} className="w-7 h-7 flex items-center justify-center border border-border hover:bg-accent/50 disabled:opacity-30">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
