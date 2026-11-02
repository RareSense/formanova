import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const MAX_STRING = 4000;

/** JSON for reading: very long strings (inline base64, data: urls) are cut so the page stays usable. */
function readableJson(value: unknown): string {
  return JSON.stringify(
    value ?? {},
    (_key, v) => (typeof v === 'string' && v.length > MAX_STRING ? `${v.slice(0, 200)}… (${v.length.toLocaleString('en-US')} characters, cut)` : v),
    2,
  );
}

/** Collapsible raw JSON; only formatted once opened. */
export function JsonBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const formatted = useMemo(() => (open ? readableJson(value) : ''), [open, value]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/20 p-4">
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
              {formatted}
            </pre>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
