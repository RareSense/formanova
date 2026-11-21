import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FORMAT_LABEL, exportSize, type ExportFormat } from '@/lib/photo-check/export';

interface Props {
  fixedW: number;
  fixedH: number;
  format: ExportFormat;
  width: number;
  onChange: (format: ExportFormat, width: number) => void;
}

/**
 * The quiet line under Download, like Canva's or Figma's export: it states
 * what you will get ("JPG · 2000 × 2000") and "Change" opens a small panel
 * with file type and width. The height follows the marketplace's shape.
 */
export function DownloadOptions({ fixedW, fixedH, format, width, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFormat, setDraftFormat] = useState<ExportFormat>(format);
  const [draftWidth, setDraftWidth] = useState(String(width));
  const preview = exportSize(fixedW, fixedH, Number(draftWidth));
  const current = exportSize(fixedW, fixedH, width);

  const openPanel = (next: boolean) => {
    if (next) { setDraftFormat(format); setDraftWidth(String(width)); }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={openPanel}>
      <p className="font-body text-sm text-muted-foreground">
        {FORMAT_LABEL[format]} · {current.width} × {current.height}
        {' · '}
        <PopoverTrigger aria-label="Change file type or size" className="underline underline-offset-4 hover:text-foreground">Change</PopoverTrigger>
      </p>
      <PopoverContent align="center" className="w-72 space-y-5 p-5">
        <div className="space-y-2">
          <p className="font-body text-sm font-medium" id="format-label">File type</p>
          <div role="group" aria-labelledby="format-label" className="grid grid-cols-2 border border-border">
            {(['jpeg', 'webp'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={draftFormat === f}
                onClick={() => setDraftFormat(f)}
                className={`h-9 font-body text-sm transition-colors ${draftFormat === f ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {draftFormat === 'webp' ? 'Smaller files. Shopify and most websites accept WebP.' : 'Accepted everywhere, including Amazon and Etsy.'}
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="export-width" className="block font-body text-sm font-medium">Width</label>
          <div className="flex items-center border border-border focus-within:border-foreground">
            <input
              id="export-width"
              type="number"
              inputMode="numeric"
              min={200}
              max={fixedW}
              value={draftWidth}
              onChange={(e) => setDraftWidth(e.target.value)}
              className="h-9 w-full bg-transparent px-3 font-body text-sm outline-none"
            />
            <span className="pr-3 font-body text-sm text-muted-foreground">px</span>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {preview.capped ? `Up to ${fixedW} px: larger would blur the jewelry.` : `Height ${preview.height} px, same shape.`}
          </p>
        </div>
        <Button
          type="button"
          className="w-full bg-foreground text-background hover:bg-foreground/90"
          onClick={() => { onChange(draftFormat, preview.width); setOpen(false); }}
        >
          Done
        </Button>
      </PopoverContent>
    </Popover>
  );
}
