/**
 * GenerateBlockedHint
 *
 * One quiet line under the "Generate Photoshoot" button that says why it is
 * greyed out, so a disabled button never looks broken. Renders nothing when the
 * button is usable, or while it already shows a spinner (checking / uploading).
 */
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBlockedReason, type GenerateBlockedState } from '@/lib/generate-blocked-reason';

interface GenerateBlockedHintProps extends GenerateBlockedState {
  id: string;
  className?: string;
}

export function GenerateBlockedHint({ id, className, ...state }: GenerateBlockedHintProps) {
  const reason = generateBlockedReason(state);
  if (!reason) return null;
  return (
    <p
      id={id}
      role="status"
      className={cn(
        'flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground animate-in fade-in duration-300',
        className,
      )}
    >
      <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
      {reason}
    </p>
  );
}
