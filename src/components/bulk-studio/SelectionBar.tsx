/**
 * Sticky bar for selected pieces: Assign / Merge / Remove / Clear.
 * Full width on mobile with safe-area padding; floating and centered from md up.
 */
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_ANGLES_PER_PIECE } from '@/lib/shot-list';
import type { AssigneeKind } from '@/lib/shot-list';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

interface SelectionBarProps {
  count: number;
  kind: AssigneeKind;
  canMerge: boolean;
  onAssign: () => void;
  onMerge: () => void;
  onRemove: () => void;
  onClear: () => void;
}

export function SelectionBar({ count, kind, canMerge, onAssign, onMerge, onRemove, onClear }: SelectionBarProps) {
  if (count === 0) return null;
  const noun = kind === 'model' ? 'Model' : 'Scene';
  return (
    <div
      role="toolbar"
      aria-label="Selected pieces"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:left-1/2 md:bottom-6 md:-translate-x-1/2 md:border md:pb-3 md:shadow-lg"
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 md:flex">
        <span className={`${MONO} whitespace-nowrap md:mr-2`}>{count} selected</span>
        <Button variant="ghost" size="icon" className="h-10 w-10 md:order-last" aria-label="Clear selection" title="Clear selection" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
        <div className="col-span-2 flex items-center gap-2">
          <Button
            onClick={onAssign}
            className={`h-10 flex-1 px-4 md:flex-none text-primary-foreground bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] hover:opacity-90 ${MONO}`}
          >
            Assign {noun} to {count}
          </Button>
          {count >= 2 && (
            <Button
              variant="outline"
              disabled={!canMerge}
              title={canMerge ? undefined : `A piece can have up to ${MAX_ANGLES_PER_PIECE} angles`}
              onClick={onMerge}
              className={`h-10 px-4 ${MONO}`}
            >
              Merge
            </Button>
          )}
          <Button variant="outline" onClick={onRemove} className={`h-10 px-4 ${MONO}`} aria-label={`Remove ${count} selected`}>
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Remove</span>
        </Button>
        </div>
      </div>
    </div>
  );
}
