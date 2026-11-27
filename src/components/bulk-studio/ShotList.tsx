import { Diamond } from 'lucide-react';
import {
  MAX_ANGLES_PER_PIECE, canApplyToAll, rowAssignees, totalShotCount,
  type AssigneeKind, type ShotListAction, type ShotListState,
} from '@/lib/shot-list';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ShotRow } from './ShotRow';
import type { AssignRequest } from './AssignDrawer';
import type { PrecisionDefault } from '@/lib/bulk-studio';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

interface ShotListProps {
  state: ShotListState;
  dispatch: (a: ShotListAction) => void;
  precisionDefault: PrecisionDefault;
  kind: AssigneeKind;
  onAddFilesToRow: (rowId: string, files: File[]) => void;
  onSplit: (rowId: string, angleCount: number) => void;
  onAddJewelry: () => void;
  onAssign: (request: AssignRequest) => void;
}

export function ShotList({
  state, dispatch, precisionDefault, kind, onAddFilesToRow, onSplit, onAddJewelry, onAssign,
}: ShotListProps) {
  if (state.rows.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddJewelry}
        className="flex w-full flex-1 min-h-[320px] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-border px-4 text-center hover:border-formanova-hero-accent transition-colors"
      >
        <Diamond className="h-9 w-9 text-primary" />
        <span className="font-display text-2xl uppercase tracking-wide">Drop jewelry photos here</span>
        <span className={`${MONO} text-foreground/50`}>or click to add · up to 3 angles per piece</span>
      </button>
    );
  }

  const allSelected = state.selectedIds.length === state.rows.length;
  const pieces = state.rows.length;
  const shots = totalShotCount(state, kind);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <span className={`${MONO} text-foreground/60`} aria-live="polite">
          {pieces} {pieces === 1 ? 'piece' : 'pieces'} ·{' '}
          <span className="text-foreground">{shots} {shots === 1 ? 'shot' : 'shots'}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
          className={`h-9 px-4 text-foreground/60 ${MONO}`}
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </Button>
      </div>
      <ol className="flex flex-col gap-3">
        {state.rows.map((row, i) => {
          const assignees = rowAssignees(row, kind);
          return (
            <ShotRow
              key={row.id}
              row={row}
              index={i}
              precisionDefault={precisionDefault}
              selected={state.selectedIds.includes(row.id)}
              assign={{
                kind,
                assignees,
                pieceCount: pieces,
                canApplyAll: canApplyToAll(state, row.id, kind),
                onChoose: () => onAssign({ mode: 'multi', rowIds: [row.id], initial: assignees }),
                onSwap: (oldId) => onAssign({ mode: 'single', rowId: row.id, oldId }),
                onRemove: (assigneeId) => dispatch({ type: 'removeAssignee', rowId: row.id, assigneeId }),
                onApplyAll: () => {
                  dispatch({ type: 'applyToAll', fromRowId: row.id, kind });
                  toast({ title: `Applied to all ${pieces} pieces` });
                },
              }}
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
          );
        })}
      </ol>
    </section>
  );
}
