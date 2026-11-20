import { useState, type ClipboardEvent, type DragEvent } from 'react';
import { Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { type Product } from '@/lib/line-sheet/layout';
import { ACCEPTED_IMAGES } from '@/lib/line-sheet/image';
import { TABLE_FIELDS, isMultiCell, parsePaste, type TableField } from '@/lib/line-sheet/paste';

const HEADINGS: Record<TableField, string> = {
  name: 'Name', sku: 'SKU', metal: 'Metal', stone: 'Stone', size: 'Size', wholesale: 'Wholesale', retail: 'Retail',
};
/** Fixed column widths so the grid always fits its card; Name takes the rest. */
const WIDTH: Record<TableField, string> = {
  name: '', sku: 'w-[12%]', metal: 'w-[14%]', stone: 'w-[14%]', size: 'w-[8%]', wholesale: 'w-[11%]', retail: 'w-[11%]',
};
const NUMERIC: TableField[] = ['wholesale', 'retail'];

interface SheetGridProps {
  products: Product[];
  onChange: (id: string, patch: Partial<Product>) => void;
  /** Patches written from row `index` downward; rows past the end are created. */
  onFillRows: (index: number, patches: Partial<Product>[]) => void;
  onPhotos: (files: File[], rowIndex?: number) => void;
  onMove: (index: number, by: -1 | 1) => void;
  onRemove: (id: string) => void;
}

/**
 * The pieces, laid out like a Google Sheets grid: row numbers, grey column
 * headings, gridlines, one blank row at the bottom to type into, a row menu on
 * the row number. Drop photos anywhere on it; paste cells from a spreadsheet.
 */
export function SheetGrid({ products, onChange, onFillRows, onPhotos, onMove, onRemove }: SheetGridProps) {
  const [dragging, setDragging] = useState(false);
  const blankIndex = products.length;

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, rowIndex: number, field: TableField) => {
    const text = e.clipboardData.getData('text/plain');
    if (!isMultiCell(text)) return;
    e.preventDefault();
    onFillRows(rowIndex, parsePaste(text, field));
  };

  const dropProps = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: DragEvent) => { if (e.currentTarget === e.target) setDragging(false); },
    onDrop: (e: DragEvent) => { e.preventDefault(); setDragging(false); onPhotos(Array.from(e.dataTransfer.files)); },
  };

  const cell = 'border border-border/70 p-0';
  const input = 'h-10 w-full min-w-0 truncate bg-transparent px-3 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:relative focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary';

  const row = (p: Product | null, i: number) => {
    const id = p?.id ?? 'blank';
    const photoId = `grid-photo-${id}`;
    return (
      <tr key={id}>
        <th scope="row" className={`${cell} w-10 bg-muted/60 text-center font-body text-xs font-normal text-muted-foreground`}>
          {p ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="h-10 w-full hover:bg-muted" aria-label={`Row ${i + 1} options`}>{i + 1}</DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem disabled={i === 0} onSelect={() => onMove(i, -1)}>Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={i === products.length - 1} onSelect={() => onMove(i, 1)}>Move down</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRemove(p.id)}>Delete row</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="block leading-10">{i + 1}</span>
          )}
        </th>
        <td className={`${cell} w-14`}>
          <label htmlFor={photoId} className="flex h-10 w-14 cursor-pointer items-center justify-center hover:bg-muted/60" title={p?.image ? 'Change photo' : 'Add photo'}>
            {p?.image
              ? <img src={p.image.src} alt={p.name || `Piece ${i + 1}`} className="h-9 w-9 object-contain" />
              : <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            <span className="sr-only">{p?.image ? `Change photo for row ${i + 1}` : `Add photo for row ${i + 1}`}</span>
          </label>
          <input
            id={photoId}
            type="file"
            accept={ACCEPTED_IMAGES}
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotos([f], i); e.target.value = ''; }}
          />
        </td>
        {TABLE_FIELDS.map((field) => (
          <td key={field} className={cell}>
            <input
              aria-label={`${HEADINGS[field]}, row ${i + 1}`}
              className={`${input} ${NUMERIC.includes(field) ? 'text-right tabular-nums' : ''}`}
              inputMode={NUMERIC.includes(field) ? 'decimal' : undefined}
              value={p ? (p[field] as string) : ''}
              onChange={(e) => (p ? onChange(p.id, { [field]: e.target.value }) : onFillRows(i, [{ [field]: e.target.value }]))}
              onPaste={(e) => handlePaste(e, i, field)}
            />
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div
      {...dropProps}
      className={`relative overflow-x-auto border border-border/70 ${dragging ? 'ring-2 ring-primary' : ''}`}
    >
      <table className="w-full min-w-[720px] table-fixed border-collapse">
        <thead>
          <tr className="bg-muted/60">
            <th scope="col" className={`${cell} w-10`}><span className="sr-only">Row</span></th>
            <th scope="col" className={`${cell} w-14 px-2 py-2 text-left font-body text-xs font-medium text-muted-foreground`}>Photo</th>
            {TABLE_FIELDS.map((f) => (
              <th key={f} scope="col" className={`${cell} ${WIDTH[f]} px-3 py-2 font-body text-xs font-medium text-muted-foreground ${NUMERIC.includes(f) ? 'text-right' : 'text-left'}`}>
                {HEADINGS[f]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => row(p, i))}
          {row(null, blankIndex)}
        </tbody>
      </table>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 font-body text-sm">
          Drop photos to add a row for each one
        </div>
      )}
    </div>
  );
}
