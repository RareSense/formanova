/**
 * Tells the user when their generated ring contains parts that are not closed
 * solids.
 *
 * This is the single most consequential thing the pipeline can say about a
 * file. A closed solid is watertight and has an inside; an open surface does
 * not, and a caster or printer cannot make it. The backend has always reported
 * it as `not_all_solid`, and the value was parsed correctly, but nothing ever
 * rendered it, so the first time anyone found out was at their manufacturer.
 *
 * It sits with the download rather than at the top of the page on purpose: the
 * moment that matters is the one where the file is about to leave the app and
 * go to someone who will try to make it.
 */

import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

const EXPLANATION =
  'Some parts of this design are not closed solids, so they may not cast or '
  + '3D print as they are. The file is still yours to download. Check with your '
  + 'manufacturer before casting.';

export interface CadSolidityNoticeProps {
  /** Undefined for older runs that never reported solidity; those stay silent. */
  notAllSolid?: boolean;
  className?: string;
}

export function CadSolidityNotice({ notAllSolid, className }: CadSolidityNoticeProps) {
  // Silence is the right output for a good file. A badge that is always
  // present and sometimes means "fine" is a badge people stop reading.
  if (!notAllSolid) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      title={EXPLANATION}
      className={cn(
        // Explicit hsl(... / alpha) rather than Tailwind's /50 modifier: the
        // token is defined as hsl(var(--formanova-warning)) with no
        // <alpha-value> placeholder, so the modifier does not compile and the
        // border and background would silently not render.
        'flex items-center gap-1.5 border border-[hsl(var(--formanova-warning)/0.5)]',
        'bg-[hsl(var(--formanova-warning)/0.12)] text-[hsl(var(--formanova-warning))]',
        'px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em]',
        'backdrop-blur-sm',
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span>Not all parts are solid</span>
    </div>
  );
}
