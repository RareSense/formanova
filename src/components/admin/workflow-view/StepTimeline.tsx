import { Badge } from '@/components/ui/badge';
import type { Enhancement, StepView } from '@/lib/admin-workflow-views';
import { JsonBlock } from './JsonBlock';
import { NodeView } from './NodeView';

function formatTook(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Every recorded tool call in order, with its output shown and its input folded (both in
 * full). Failed is inferred from the step output (the API does not send is_success /
 * is_retry); "retried" means a later call of the same tool exists.
 */
export function StepTimeline({ steps, enh, fallbackStem }: { steps: StepView[]; enh: Enhancement; fallbackStem: string }) {
  if (!steps.length) return <p className="text-sm text-muted-foreground">No processing steps were returned for this workflow.</p>;
  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        const took = formatTook(step.tookMs);
        const opts = { enh, tool: step.tool, fallbackStem };
        return (
          <li
            key={step.index}
            className={`space-y-3 rounded-md border p-3 sm:p-4 ${step.failed ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{step.index}.</span>
              <span className="break-all font-mono text-sm font-medium">{step.tool}</span>
              {step.failed ? (
                <Badge variant="destructive">{step.retried ? 'Failed, retried' : 'Failed'}</Badge>
              ) : (
                <Badge variant="outline">OK</Badge>
              )}
              {took && <span className="font-mono text-xs text-muted-foreground">{took}</span>}
            </div>
            {step.error && <p className="whitespace-pre-wrap break-words text-sm text-destructive">{step.error}</p>}
            <NodeView node={step.output} opts={opts} />
            <details className="rounded-md border border-border px-3 py-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Step input</summary>
              <div className="mt-3"><NodeView node={step.input} opts={opts} /></div>
            </details>
            <div className="grid gap-2 md:grid-cols-2">
              <JsonBlock title="Raw input" value={step.raw.input} />
              <JsonBlock title="Raw output" value={step.raw.output} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
