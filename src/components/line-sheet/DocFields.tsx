import { Plus, X } from 'lucide-react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { SheetImage } from '@/lib/line-sheet/layout';
import { ACCEPTED_IMAGES } from '@/lib/line-sheet/image';
import { cn } from '@/lib/utils';

/**
 * Inputs that read as text on the page (the invoice-generator pattern): no box
 * until hovered, a clear outline while typing. The placeholder says what goes
 * there; the aria-label names it for screen readers.
 */
const QUIET = 'w-full bg-transparent border border-transparent px-2 -mx-2 outline-none transition-colors hover:border-border focus:border-primary placeholder:text-muted-foreground/60';

export function DocInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { 'aria-label': string }) {
  return <input {...props} className={cn(QUIET, 'h-9', className)} />;
}

export function DocTextarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { 'aria-label': string }) {
  return <textarea {...props} className={cn(QUIET, 'resize-none py-2', className)} />;
}

/** "+ Add logo" box where the logo will sit, as on the printed sheet. */
export function LogoBox({ logo, onFile, onRemove }: { logo?: SheetImage; onFile: (f?: File) => void; onRemove: () => void }) {
  return (
    <div className="relative shrink-0">
      <label
        htmlFor="sheet-logo"
        className="flex h-20 w-32 cursor-pointer items-center justify-center border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/50"
      >
        {logo
          ? <img src={logo.src} alt="Your logo" className="max-h-16 max-w-28 object-contain" />
          : <span className="flex items-center gap-1"><Plus className="h-4 w-4" aria-hidden="true" /> Add logo</span>}
      </label>
      <input id="sheet-logo" type="file" accept={ACCEPTED_IMAGES} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {logo && (
        <button type="button" onClick={onRemove} aria-label="Remove logo" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
