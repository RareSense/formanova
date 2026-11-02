import { Badge } from '@/components/ui/badge';
import type { ViewStep } from '@/lib/admin-workflow-views';
import { ImageGrid } from './ImageThumb';
import { JsonBlock } from './JsonBlock';
import { FieldGrid } from './LabelledValue';

function formatTook(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Every recorded tool call in order. Failed is inferred from the step output (the API does
 * not send is_success / is_retry), and "retried" means a later call of the same tool exists.
 */
export function StepTimeline({ steps }: { steps: ViewStep[] }) {
  if (!steps.length) return <p className="text-sm text-muted-foreground">No processing steps were returned for this workflow.</p>;
  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        const took = formatTook(step.tookMs);
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
            <FieldGrid fields={step.fields} />
            <ImageGrid images={step.images} />
            <div className="grid gap-2 md:grid-cols-2">
              <JsonBlock title="Raw input" value={step.input} />
              <JsonBlock title="Raw output" value={step.output} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
