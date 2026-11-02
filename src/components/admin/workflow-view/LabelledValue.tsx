import type { ReactNode } from 'react';

import type { ViewField } from '@/lib/admin-workflow-views';

/** One labelled value. Long text (prompts) is a readable block; everything renders as text. */
export function LabelledValue({ label, value, long = false }: { label: ReactNode; value: ReactNode; long?: boolean }) {
  return (
    <div className={long ? 'space-y-2 sm:col-span-2 lg:col-span-4' : 'min-w-0 space-y-1'}>
      <p className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {long ? (
        <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-muted/20 px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value}</p>
        </div>
      ) : (
        <div className="break-words text-sm">{value}</div>
      )}
    </div>
  );
}

export function FieldGrid({ fields }: { fields: ViewField[] }) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((f, i) => <LabelledValue key={`${f.label}-${i}`} label={f.label} value={f.value} long={f.long} />)}
    </div>
  );
}
