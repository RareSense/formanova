import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { Enhancement, StepView } from '@/lib/admin-workflow-views';
import { JsonBlock } from './JsonBlock';
import { NodeView } from './NodeView';

function formatTook(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const Label = ({ children }: { children: string }) => (
  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{children}</p>
);

/** One tool call: a single line; opening it shows its input and output (walked) and raw JSON. */
function StepRow({ step, enh, fallbackStem }: { step: StepView; enh: Enhancement; fallbackStem: string }) {
  const [open, setOpen] = useState(false);
  const took = formatTook(step.tookMs);
  const opts = { enh, tool: step.tool, fallbackStem, hideTechnical: true };
  return (
    <li className={step.failed ? 'bg-destructive/5' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 sm:px-4"
      >
        <span className="font-mono text-xs text-muted-foreground">{step.index}.</span>
        <span className="min-w-0 break-all font-mono text-sm font-medium">{step.tool}</span>
        {step.failed ? (
          <Badge variant="destructive">{step.retried ? 'Failed, retried' : 'Failed'}</Badge>
        ) : (
          <Badge variant="outline">OK</Badge>
        )}
        {took && <span className="font-mono text-xs text-muted-foreground">{took}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        {step.error && <span className="basis-full truncate text-xs text-destructive">{step.error}</span>}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3 sm:px-4">
          <div className="space-y-2"><Label>Input</Label><NodeView node={step.input} opts={opts} /></div>
          <div className="space-y-2"><Label>Output</Label><NodeView node={step.output} opts={opts} /></div>
          <div className="grid gap-2 md:grid-cols-2">
            <JsonBlock title="Raw input" value={step.raw.input} />
            <JsonBlock title="Raw output" value={step.raw.output} />
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Every recorded tool call in order, one line each (tool, OK / Failed / Failed-retried,
 * duration, and the error when it failed). Failed is inferred from the step output (the API
 * sends no is_success / is_retry); "retried" means a later call of the same tool exists.
 */
export function StepTimeline({ steps, enh, fallbackStem }: { steps: StepView[]; enh: Enhancement; fallbackStem: string }) {
  if (!steps.length) return <p className="text-sm text-muted-foreground">No processing steps were returned for this workflow.</p>;
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {steps.map((step) => <StepRow key={step.index} step={step} enh={enh} fallbackStem={fallbackStem} />)}
    </ol>
  );
}
