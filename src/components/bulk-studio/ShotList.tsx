import { Diamond } from 'lucide-react';
import { MAX_ANGLES_PER_PIECE, canMergeSelected, type ShotListAction, type ShotListState } from '@/lib/shot-list';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ShotRow } from './ShotRow';
import type { PrecisionDefault, ShootMode } from '@/lib/bulk-studio';

interface ShotListProps {
  state: ShotListState;
  dispatch: (a: ShotListAction) => void;
  precisionDefault: PrecisionDefault;
  mode: ShootMode;
  onAddFilesToRow: (rowId: string, files: File[]) => void;
  onSplit: (rowId: string, angleCount: number) => void;
  onAddJewelry: () => void;
}

export function ShotList({
  state, dispatch, precisionDefault, mode, onAddFilesToRow, onSplit, onAddJewelry,
}: ShotListProps) {
  if (state.rows.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddJewelry}
        className="flex w-full flex-1 min-h-[320px] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-border hover:border-formanova-hero-accent transition-colors"
      >
        <Diamond className="h-9 w-9 text-primary" />
        <span className="font-display text-2xl uppercase tracking-wide">Drop jewelry photos here</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/50">
          or click to browse · one photo per piece
        </span>
      </button>
    );
  }

  const allSelected = state.selectedIds.length === state.rows.length;
  const mergeable = canMergeSelected(state);
  const selectedCount = state.selectedIds.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/60">
          {state.rows.length} {state.rows.length === 1 ? 'piece' : 'pieces'}
        </span>
        <div className="flex items-center gap-2">
          {selectedCount >= 2 && (
            <Button
              variant="outline"
              size="sm"
              disabled={!mergeable}
              title={mergeable ? undefined : 'A piece can have up to 3 angles'}
              onClick={() => dispatch({ type: 'mergeSelected' })}
              className="h-9 px-4 font-mono text-[10px] uppercase tracking-wider"
            >
              Merge {selectedCount} into 1 piece
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
            className="h-9 px-4 font-mono text-[10px] uppercase tracking-wider text-foreground/60"
          >
            {allSelected ? 'Clear selection' : 'Select all'}
          </Button>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {state.rows.map((row, i) => (
          <ShotRow
            key={row.id}
            row={row}
            index={i}
            mode={mode}
            precisionDefault={precisionDefault}
            selected={state.selectedIds.includes(row.id)}
            onToggleSelect={() => dispatch({ type: 'toggleSelect', rowId: row.id })}
            onAddAngles={(files) => onAddFilesToRow(row.id, files)}
            onRemoveAngle={(angleId) => dispatch({ type: 'removeAngle', rowId: row.id, angleId })}
            onMoveAngle={(from, to) => dispatch({ type: 'moveAngle', rowId: row.id, from, to })}
            onSplit={() => onSplit(row.id, row.angles.length)}
            onRemove={() => dispatch({ type: 'removeRow', rowId: row.id })}
            onMergeFrom={(sourceId) => {
              const source = state.rows.find((r) => r.id === sourceId);
              if (source && source.angles.length + row.angles.length > MAX_ANGLES_PER_PIECE) {
                toast({ title: `A piece can have up to ${MAX_ANGLES_PER_PIECE} angles` });
                return;
              }
              dispatch({ type: 'mergeRows', sourceId, targetId: row.id });
            }}
          />
        ))}
      </ol>
    </section>
  );
}
