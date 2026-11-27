/**
 * Results queue. Docked on the right from xl up (always visible, never blocks
 * the Shot List); a sheet below xl, opened from the Generate bar.
 */
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { QueueView } from '@/hooks/useBulkQueue';
import { ResultCard } from './ResultCard';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

export interface ResultsActions {
  onFixAI: (item: QueueView) => void;
  onFixHuman: (item: QueueView) => void;
  onUpscaled: (item: QueueView, url: string) => void;
}

interface ResultsBodyProps extends ResultsActions {
  views: QueueView[];
  counts: { total: number; active: number; done: number };
}

function summary(c: ResultsBodyProps['counts']): string {
  if (!c.total) return 'Generated shots appear here';
  return c.active ? `${c.done} of ${c.total} ready · ${c.active} rendering` : `${c.done} of ${c.total} ready`;
}

function ResultsList({ views, onFixAI, onFixHuman, onUpscaled }: Omit<ResultsBodyProps, 'counts'>) {
  if (!views.length) {
    return (
      <div className="flex flex-1 items-center justify-center border border-dashed border-border p-6 text-center">
        <span className={`${MONO} text-foreground/50`}>Pick models, then Generate. Shots render here while you keep working.</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
      {views.map((v) => (
        <ResultCard
          key={v.id}
          item={v}
          onFixAI={() => onFixAI(v)}
          onFixHuman={() => onFixHuman(v)}
          onUpscaled={(url) => onUpscaled(v, url)}
        />
      ))}
    </div>
  );
}

/** Docked panel (xl+). */
export function ResultsDock(props: ResultsBodyProps) {
  return (
    <aside aria-label="Results" className="hidden xl:flex sticky top-0 h-dvh w-[420px] 2xl:w-[520px] shrink-0 flex-col border-l border-border">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-2xl uppercase tracking-wide">Results</h2>
        <p className={`${MONO} text-foreground/60`} aria-live="polite">{summary(props.counts)}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
        <ResultsList {...props} />
      </div>
    </aside>
  );
}

/** Sheet (below xl). */
export function ResultsSheet({ open, onOpenChange, ...props }: ResultsBodyProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={`flex flex-col gap-0 p-0 ${isMobile ? 'h-dvh' : 'h-dvh w-full sm:max-w-xl'}`}>
        <SheetHeader className="border-b border-border px-4 md:px-6 py-4 text-left">
          <SheetTitle className="font-display text-2xl uppercase tracking-wide">Results</SheetTitle>
          <SheetDescription className={MONO}>{summary(props.counts)}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 md:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <ResultsList {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
