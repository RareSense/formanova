import { Info } from 'lucide-react';

import type { CostView } from '@/lib/admin-cost-display';
import { formatUsd, type ProviderSpend } from '@/lib/admin-provider-spend';

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

/**
 * Real provider money the steps themselves reported (see admin-provider-spend.ts). Says so
 * plainly when the workflow reports none, instead of showing an invented $0.
 */
export function ProviderSpendBlock({ spend }: { spend: ProviderSpend }) {
  const priced = spend.steps.filter((s) => s.usd !== null);
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {spend.totalUsd !== null
          ? `Provider spend (reported): ${formatUsd(spend.totalUsd)} across ${priced.length} ${priced.length === 1 ? 'step' : 'steps'}`
          : 'Provider spend (reported): not reported by this workflow'}
      </p>
      {spend.steps.length > 0 && (
        <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
          {spend.steps.map((s) => (
            <li key={s.index}>
              {`${s.index}. ${s.tool}: ${s.usd !== null ? formatUsd(s.usd) : 'usage reported, no USD'}${s.tokens !== null ? ` · ${s.tokens.toLocaleString('en-US')} tokens` : ''}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
