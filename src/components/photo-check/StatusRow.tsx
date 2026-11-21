import { Check as CheckIcon, CircleAlert, CircleHelp, X } from 'lucide-react';
import type { Check, CheckStatus } from '@/lib/photo-check/analyze';

const LABEL: Record<Check['id'], string> = { size: 'Size', shape: 'Shape', background: 'Background', fill: 'Jewelry fills', file: 'File' };
const MARK: Record<CheckStatus, { Icon: typeof CheckIcon; label: string; tone: string }> = {
  pass: { Icon: CheckIcon, label: 'OK', tone: 'text-muted-foreground' },
  warn: { Icon: CircleAlert, label: 'Fix', tone: 'text-foreground' },
  fail: { Icon: X, label: 'Problem', tone: 'text-destructive' },
  unknown: { Icon: CircleHelp, label: "Can't tell", tone: 'text-muted-foreground' },
};

/**
 * One row of equal cells, like the info strip under a photo in an editor:
 * label, value, a small mark. Only a real problem gets colour.
 */
export function StatusRow({ checks }: { checks: Check[] }) {
  const shown = checks.filter((c) => c.id !== 'file');
  return (
    <dl className="grid grid-cols-2 divide-border border-t border-border sm:grid-cols-4 sm:divide-x">
      {shown.map((c) => {
        const { Icon, label, tone } = MARK[c.status];
        return (
          <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-4" title={c.text}>
            <div className="min-w-0">
              <dt className="font-body text-xs text-muted-foreground">{LABEL[c.id]}</dt>
              <dd className={`mt-1 font-body text-sm font-medium sm:text-base ${c.status === 'fail' ? 'text-destructive' : 'text-foreground'}`}>{c.value}</dd>
            </div>
            <Icon className={`h-4 w-4 shrink-0 ${tone}`} strokeWidth={1.75} aria-label={label} />
          </div>
        );
      })}
    </dl>
  );
}
