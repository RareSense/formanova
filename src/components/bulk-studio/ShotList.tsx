import { Diamond } from 'lucide-react';
import type { ShotListAction, ShotListState } from '@/lib/shot-list';
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

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/60">
          {state.rows.length} {state.rows.length === 1 ? 'piece' : 'pieces'}
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
          className="font-mono text-[10px] uppercase tracking-wider text-foreground/60 hover:text-foreground"
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
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
          />
        ))}
      </ol>
    </section>
  );
}
