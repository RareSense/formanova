import { Info } from 'lucide-react';

import type { CostView } from '@/lib/admin-cost-display';

/** A cost label with an (i) whose native tooltip says what the number means. */
export function CostLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span title={help} aria-label={help} role="img" className="inline-flex cursor-help text-muted-foreground">
        <Info className="h-3 w-3" aria-hidden />
      </span>
    </span>
  );
}

/** The workflow cost, with the amber gap above what the user paid and the detail page's note. */
export function WorkflowCostValue({ view }: { view: CostView }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className={view.workflowCost === 'not priced' ? 'text-muted-foreground' : undefined}>{view.workflowCost}</span>
      {view.overBy !== null && (
        <span className="text-amber-600 dark:text-amber-400">+{view.overBy.toLocaleString()}</span>
      )}
      {view.note && <span className="text-[11px] text-muted-foreground">{view.note}</span>}
    </span>
  );
}
