/**
 * Row column 2: assigned models/scenes. Tap a thumbnail to swap it, X to remove,
 * + to add more. Controls stay visible on touch screens.
 */
import { Plus, UserRound, Image as ImageIcon, X } from 'lucide-react';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import type { AssigneeKind, ShotAssignee } from '@/lib/shot-list';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';
const HOVER_REVEAL = '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/assignee:opacity-100 focus-visible:opacity-100';

function AssigneeThumb({ a, onSwap, onRemove }: { a: ShotAssignee; onSwap: () => void; onRemove: () => void }) {
  const src = useAuthenticatedImage(a.imageUrl);
  return (
    <div className="group/assignee relative h-14 w-14 shrink-0 border border-border bg-muted">
      <button type="button" onClick={onSwap} aria-label={`Swap ${a.name}`} title={a.name} className="h-full w-full">
        {src && <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${a.name}`}
        className={`absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-background/85 text-foreground/70 hover:text-foreground ${HOVER_REVEAL}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface AssignmentCellProps {
  kind: AssigneeKind;
  assignees: ShotAssignee[];
  pieceCount: number;
  canApplyAll: boolean;
  onChoose: () => void;
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
  onApplyAll: () => void;
}

export function AssignmentCell({
  kind, assignees, pieceCount, canApplyAll, onChoose, onSwap, onRemove, onApplyAll,
}: AssignmentCellProps) {
  const noun = kind === 'model' ? 'model' : 'scene';
  const Icon = kind === 'model' ? UserRound : ImageIcon;

  if (assignees.length === 0) {
    return (
      <button
        type="button"
        onClick={onChoose}
        className="col-span-2 lg:col-span-1 flex h-14 lg:h-20 min-w-0 items-center justify-center gap-2 border border-dashed border-border px-3 text-foreground/60 hover:border-formanova-hero-accent hover:text-foreground"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className={`truncate ${MONO}`}>Choose {noun}</span>
      </button>
    );
  }

  return (
    <div className="col-span-2 lg:col-span-1 flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        {assignees.map((a) => (
          <AssigneeThumb key={a.id} a={a} onSwap={() => onSwap(a.id)} onRemove={() => onRemove(a.id)} />
        ))}
        <button
          type="button"
          onClick={onChoose}
          aria-label={`Add ${noun}`}
          title={`Add ${noun}`}
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border border-dashed border-border text-foreground/60 hover:border-formanova-hero-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          <span className="font-mono text-[9px] uppercase tracking-wider">Add</span>
        </button>
      </div>
      {canApplyAll && (
        <button
          type="button"
          onClick={onApplyAll}
          className={`self-start border border-formanova-hero-accent/60 px-2 py-1 text-formanova-hero-accent hover:bg-formanova-hero-accent hover:text-primary-foreground ${MONO}`}
        >
          Apply to all {pieceCount} pieces
        </button>
      )}
    </div>
  );
}
