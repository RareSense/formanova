import type { ReactNode } from 'react';

/** One labelled value in the run header (costs). Everything renders as text. */
export function LabelledValue({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="break-words font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{value}</div>
    </div>
  );
}
