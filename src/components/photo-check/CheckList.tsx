import { Check as CheckIcon, CircleAlert, CircleHelp, X } from 'lucide-react';
import type { Check, CheckStatus, Verdict } from '@/lib/photo-check/analyze';

const ICON: Record<CheckStatus, { Icon: typeof CheckIcon; label: string; className: string }> = {
  pass: { Icon: CheckIcon, label: 'Passed', className: 'text-muted-foreground' },
  warn: { Icon: CircleAlert, label: 'Needs attention', className: 'text-foreground' },
  fail: { Icon: X, label: 'Problem', className: 'text-destructive' },
  unknown: { Icon: CircleHelp, label: "Can't tell", className: 'text-muted-foreground' },
};

const VERDICT: Record<Verdict, string> = {
  good: 'Looks good.',
  attention: 'Needs attention.',
  unknown: "Can't tell reliably.",
};

/** The verdict in one line, then one plain line per check. Colour only marks a real problem. */
export function CheckList({ verdict, checks, market }: { verdict: Verdict; checks: Check[]; market: string }) {
  return (
    <div className="space-y-4">
      <p className="font-body text-xl font-semibold">
        {VERDICT[verdict]} <span className="font-normal text-muted-foreground">For {market}.</span>
      </p>
      <ul className="space-y-3" aria-label="Photo checks">
        {checks.map((c) => {
          const { Icon, label, className } = ICON[c.status];
          return (
            <li key={c.id} className="flex items-start gap-3 font-body text-sm">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} strokeWidth={1.75} aria-label={label} />
              <span className={c.status === 'fail' ? 'text-destructive' : 'text-foreground'}>{c.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
