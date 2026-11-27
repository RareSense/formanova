/**
 * Upload New: stage photos, decide how they group into pieces, then add.
 * Staging reuses the Shot List reducer, so merge/split rules are identical.
 */
import { useRef, useState } from 'react';
import { Diamond, Split, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { revokeAngleBlobs, type ShotListApi } from '@/hooks/useShotList';
import {
  MAX_ANGLES_PER_PIECE, canGroupAll, canMergeSelected, totalAngles,
  type ShotAngle, type ShotRow,
} from '@/lib/shot-list';
import { IMAGE_ACCEPT, PIECE_DRAG_MIME, isPieceDrag } from '@/lib/bulk-studio';
import { isLikelyImageFile, normalizeImageFiles } from '@/lib/image-normalize';
import { IntakeFooter } from './IntakeFooter';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

function Thumb({ angle, label }: { angle: ShotAngle; label: string }) {
  const src = useAuthenticatedImage(angle.previewUrl);
  return (
    <div className="h-16 w-16 shrink-0 border border-border bg-muted">
      {src && <img src={src} alt={label} draggable={false} className="h-full w-full object-cover" />}
    </div>
  );
}

function StagedPiece({
  row, index, selected, onToggle, onSplit, onRemove, onMergeFrom,
}: {
  row: ShotRow; index: number; selected: boolean;
  onToggle: () => void; onSplit: () => void; onRemove: () => void; onMergeFrom: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const n = row.angles.length;
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(PIECE_DRAG_MIME, row.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (isPieceDrag(e)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!isPieceDrag(e)) return;
        e.preventDefault(); e.stopPropagation(); setOver(false);
        const id = e.dataTransfer.getData(PIECE_DRAG_MIME);
        if (id && id !== row.id) onMergeFrom(id);
      }}
      className={`flex min-w-0 items-center gap-3 border p-2 ${
        over ? 'border-dashed border-formanova-hero-accent' : selected ? 'border-formanova-hero-accent/60 bg-muted/40' : 'border-border'
      }`}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select piece ${index + 1}`} />
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {row.angles.map((a, i) => <Thumb key={a.id} angle={a} label={`Piece ${index + 1}, angle ${i + 1}`} />)}
      </div>
      <span className={`${MONO} shrink-0 text-foreground/60`}>{n} {n === 1 ? 'angle' : 'angles'}</span>
      {n > 1 && (
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Split into separate pieces" title="Split" onClick={onSplit}>
          <Split className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Remove" title="Remove" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function IntakeUploadTab({ staging, onAdd }: { staging: ShotListApi; onAdd: (pieces: ShotAngle[][]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { state, dispatch } = staging;
  const photos = totalAngles(state);
  const pieces = state.rows.length;
  const selected = state.selectedIds.length;

  const stage = async (list: FileList | null) => {
    const raw = Array.from(list ?? []);
    const images = raw.filter(isLikelyImageFile);
    if (images.length < raw.length) toast({ title: 'Some files were skipped', description: 'Only images can be added.' });
    if (images.length) staging.addFilesAsPieces(await normalizeImageFiles(images));
  };

  const removeRow = (row: ShotRow) => { revokeAngleBlobs(row.angles); dispatch({ type: 'removeRow', rowId: row.id }); };

  const mergeFrom = (sourceId: string, target: ShotRow) => {
    const source = state.rows.find((r) => r.id === sourceId);
    if (source && source.angles.length + target.angles.length > MAX_ANGLES_PER_PIECE) {
      toast({ title: `A piece can have up to ${MAX_ANGLES_PER_PIECE} angles` });
      return;
    }
    dispatch({ type: 'mergeRows', sourceId, targetId: target.id });
  };

  const submit = () => {
    onAdd(state.rows.map((r) => r.angles));
    dispatch({ type: 'reset' }); // photos now belong to the Shot List (no revoke)
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 md:px-6 py-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { if (!isPieceDrag(e)) e.preventDefault(); }}
          onDrop={(e) => { if (isPieceDrag(e)) return; e.preventDefault(); e.stopPropagation(); void stage(e.dataTransfer.files); }}
          className={`flex w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border hover:border-formanova-hero-accent transition-colors ${pieces ? 'py-5' : 'py-12'}`}
        >
          <Diamond className="h-9 w-9 text-primary" />
          <span className="font-display text-xl uppercase tracking-wide">Drop photos or browse</span>
          <span className={`${MONO} text-foreground/50`}>JPG · PNG · WEBP</span>
        </button>
        <input
          ref={input} type="file" accept={IMAGE_ACCEPT} multiple className="hidden"
          onChange={(e) => { void stage(e.target.files); e.target.value = ''; }}
        />

        {photos >= 2 && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={pieces === photos}
              onClick={staging.separateAll}
              className={`h-10 px-4 ${MONO}`}
            >
              Separate Pieces
            </Button>
            <Button
              variant="outline"
              disabled={!canGroupAll(state)}
              title={photos > MAX_ANGLES_PER_PIECE ? `A piece can have up to ${MAX_ANGLES_PER_PIECE} angles` : undefined}
              onClick={() => dispatch({ type: 'groupAll' })}
              className={`h-10 px-4 ${MONO}`}
            >
              Group as 1 Piece
            </Button>
          </div>
        )}

        {pieces > 0 && (
          <>
            <div className="flex min-h-9 items-center justify-between gap-2">
              <span className={`${MONO} text-foreground/60`}>
                {photos} {photos === 1 ? 'photo' : 'photos'} · {pieces} {pieces === 1 ? 'piece' : 'pieces'}
              </span>
              {selected >= 2 && (
                <Button
                  variant="outline" size="sm"
                  disabled={!canMergeSelected(state)}
                  onClick={() => dispatch({ type: 'mergeSelected' })}
                  className={`h-9 px-4 ${MONO}`}
                >
                  Merge {selected}
                </Button>
              )}
            </div>
            {pieces >= 2 && (
              <p className={`${MONO} text-foreground/50`}>
                Same piece? Drag one onto another, or tick them and tap Merge.
              </p>
            )}
            <ol className="flex flex-col gap-2">
              {state.rows.map((row, i) => (
                <StagedPiece
                  key={row.id}
                  row={row}
                  index={i}
                  selected={state.selectedIds.includes(row.id)}
                  onToggle={() => dispatch({ type: 'toggleSelect', rowId: row.id })}
                  onSplit={() => staging.splitRow(row.id, row.angles.length)}
                  onRemove={() => removeRow(row)}
                  onMergeFrom={(id) => mergeFrom(id, row)}
                />
              ))}
            </ol>
          </>
        )}
      </div>
      <IntakeFooter
        label={pieces ? `Add ${pieces} ${pieces === 1 ? 'Piece' : 'Pieces'} to Shot List` : 'Add to Shot List'}
        disabled={pieces === 0}
        onClick={submit}
      />
    </>
  );
}
