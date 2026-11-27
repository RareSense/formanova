/**
 * One Shot List row = one jewelry piece:
 * [ Piece & angles ] -> [ Model(s) / Scene(s) ] -> [ Output ]
 */
import { useState } from 'react';
import { GripVertical, Split, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  MAX_ANGLES_PER_PIECE, ShotRow as Row, canAddAngle, rowPrecision,
} from '@/lib/shot-list';
import { AngleThumb, EmptyAngleSlot } from './AngleSlot';
import { PIECE_DRAG_MIME, isPieceDrag, type PrecisionDefault } from '@/lib/bulk-studio';
import { AssignmentCell } from './AssignmentCell';

type AssignProps = Parameters<typeof AssignmentCell>[0];

interface ShotRowProps {
  row: Row;
  index: number;
  selected: boolean;
  precisionDefault: PrecisionDefault;
  /** Column 2: models/scenes for this piece. */
  assign: AssignProps;
  onToggleSelect: () => void;
  onAddAngles: (files: File[]) => void;
  onRemoveAngle: (angleId: string) => void;
  onMoveAngle: (from: number, to: number) => void;
  onSplit: () => void;
  onRemove: () => void;
  /** Another piece was dropped on this one: merge it in. */
  onMergeFrom: (sourceRowId: string) => void;
}

export function ShotRow({
  row, index, selected, precisionDefault, assign,
  onToggleSelect, onAddAngles, onRemoveAngle, onMoveAngle, onSplit, onRemove, onMergeFrom,
}: ShotRowProps) {
  const multi = rowPrecision(row) === 'multi-angle';
  const room = MAX_ANGLES_PER_PIECE - row.angles.length;
  const m = assign.assignees.length;
  const noun = assign.kind === 'model' ? 'model' : 'scene';
  const [dropTarget, setDropTarget] = useState(false);

  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(PIECE_DRAG_MIME, row.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (isPieceDrag(e)) { e.preventDefault(); e.stopPropagation(); setDropTarget(true); } }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        if (!isPieceDrag(e)) return;
        e.preventDefault(); e.stopPropagation(); setDropTarget(false);
        const source = e.dataTransfer.getData(PIECE_DRAG_MIME);
        if (source && source !== row.id) onMergeFrom(source);
      }}
      className={`group/row grid grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,18rem)_9rem] items-center gap-4 border px-4 py-3 transition-colors ${
        dropTarget ? 'border-formanova-hero-accent border-dashed' : selected ? 'border-formanova-hero-accent/60 bg-muted/40' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1">
        <GripVertical aria-hidden className="hidden [@media(hover:hover)]:block h-4 w-4 cursor-grab text-foreground/30" />
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select piece ${index + 1}`} />
      </div>

      {/* 1. Piece & angles */}
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        {row.angles.map((a, i) => (
          <AngleThumb
            key={a.id}
            angle={a}
            index={i}
            total={row.angles.length}
            onRemove={() => onRemoveAngle(a.id)}
            onMove={(to) => onMoveAngle(i, to)}
          />
        ))}
        {canAddAngle(row) && (precisionDefault === 'multi'
          ? Array.from({ length: room }, (_, k) => (
              <EmptyAngleSlot
                key={k}
                label={`Angle ${row.angles.length + k + 1}`}
                maxFiles={room}
                onFiles={onAddAngles}
              />
            ))
          : <EmptyAngleSlot compact label="Angle" maxFiles={room} onFiles={onAddAngles} />)}
      </div>

      {/* 2. Model(s) / Scene(s) */}
      <AssignmentCell {...assign} />

      {/* 3. Output */}
      <div className="col-span-2 lg:col-span-1 flex min-w-0 items-center justify-between lg:flex-col lg:items-end gap-2">
        <span
          className={`whitespace-nowrap px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider border ${
            multi ? 'border-formanova-hero-accent text-formanova-hero-accent' : 'border-border text-foreground/60'
          }`}
        >
          {multi ? 'High Precision' : 'Standard'}
        </span>
        <span
          className="flex flex-col whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-foreground/60 lg:items-end"
          aria-label={`1 piece times ${m} ${noun}s equals ${m} shots`}
        >
          <span>1 × {m} {m === 1 ? noun : `${noun}s`}</span>
          <span className={m ? 'text-foreground' : undefined}>= {m} {m === 1 ? 'shot' : 'shots'}</span>
        </span>
        <div className="flex gap-1">
          {multi && (
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Split into separate pieces" title="Split into separate pieces" onClick={onSplit}>
              <Split className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove piece" title="Remove piece" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
