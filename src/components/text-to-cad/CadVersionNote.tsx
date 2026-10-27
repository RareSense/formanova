/**
 * The note left with the model on screen, behind a lightbulb in the viewer's top-left corner.
 *
 * Square, card-coloured and bordered like the viewer's tool buttons, and the same 40 px height as
 * the top toolbar so the two line up. It opens by itself the first time a version with a note is
 * shown (remembered per version in this browser), then stays one press away. The note is plain
 * text: rendered as text with its line breaks, never as HTML.
 */
import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const SEEN_KEY = 'formanova_cad_note_seen:';

function wasSeen(assetId: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY + assetId) === '1';
  } catch {
    return false;
  }
}

function markSeen(assetId: string) {
  try {
    window.localStorage.setItem(SEEN_KEY + assetId, '1');
  } catch {
    // Private mode or blocked storage: the note just opens again next time.
  }
}

export function CadVersionNote({ assetId, text }: { assetId: string; text: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const already = wasSeen(assetId);
    setOpen(!already);
    if (!already) markSeen(assetId);
  }, [assetId]);

  return (
    <div className="absolute left-2 top-2 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Note on this model"
            title="Note on this model"
            className="flex h-10 w-10 items-center justify-center border border-border bg-card text-primary shadow-lg transition-colors hover:bg-accent/40"
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[min(22rem,calc(100vw-2rem))] rounded-none border border-border bg-card p-0 shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Lightbulb className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Note on this model</span>
          </div>
          <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {text}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default CadVersionNote;
