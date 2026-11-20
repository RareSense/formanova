import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { missingFields, type Product } from '@/lib/line-sheet/layout';
import { ACCEPTED_IMAGES } from '@/lib/line-sheet/image';

const PIECE_FIELDS: { key: keyof Product; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'name', label: 'Name', placeholder: 'e.g. Halo Ring', wide: true },
  { key: 'sku', label: 'SKU', placeholder: 'e.g. LR-014' },
  { key: 'metal', label: 'Metal', placeholder: 'e.g. 14k yellow gold' },
  { key: 'stone', label: 'Stone', placeholder: 'e.g. 0.5 ct lab diamond' },
  { key: 'size', label: 'Size', placeholder: 'e.g. 5 to 9' },
  { key: 'wholesale', label: 'Wholesale price', placeholder: 'e.g. 120' },
  { key: 'retail', label: 'Retail price', placeholder: 'e.g. 260' },
];

export function PieceEditor({ index, total, product, onChange, onMove, onRemove, onPhoto }: {
  index: number;
  total: number;
  product: Product;
  onChange: (patch: Partial<Product>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onPhoto: (file?: File) => void;
}) {
  const missing = missingFields(product);
  const photoId = `piece-photo-${product.id}`;
  return (
    <li className="border border-border p-4 space-y-4">
      <div className="flex items-start gap-4">
        <label htmlFor={photoId} className="shrink-0 cursor-pointer" title="Change photo">
          {product.image ? (
            <img src={product.image.src} alt={product.name || `Piece ${index + 1}`} className="h-20 w-20 object-contain bg-white border border-border/40" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center border border-dashed border-border text-center font-body text-[11px] text-muted-foreground">Add photo</span>
          )}
          <input id={photoId} type="file" accept={ACCEPTED_IMAGES} className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-body text-sm font-medium">Piece {index + 1}</p>
          {missing.length > 0 && <p className="font-body text-xs text-destructive">Missing: {missing.join(', ')}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={`Move piece ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Move piece ${index + 1} down`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove piece ${index + 1}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {PIECE_FIELDS.map((f) => {
          const id = `${product.id}-${f.key}`;
          return (
            <div key={f.key} className={`space-y-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
              <Label htmlFor={id} className="text-sm">{f.label}</Label>
              <Input
                id={id}
                value={product[f.key] as string}
                placeholder={f.placeholder}
                inputMode={f.key === 'wholesale' || f.key === 'retail' ? 'decimal' : undefined}
                onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<Product>)}
              />
            </div>
          );
        })}
      </div>
    </li>
  );
}
