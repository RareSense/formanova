import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CadStatusNotice } from '@/lib/cad-status-copy';
import { cn } from '@/lib/utils';

interface CadStatusDialogProps {
  notice: CadStatusNotice | null;
  onClose: () => void;
}

const toneStyles = {
  success: {
    Icon: CheckCircle2,
    icon: 'text-emerald-500',
    border: 'border-emerald-500/45',
    button: 'bg-emerald-600 text-white hover:bg-emerald-500',
  },
  warning: {
    Icon: AlertTriangle,
    icon: 'text-amber-500',
    border: 'border-amber-500/45',
    button: 'bg-amber-500 text-black hover:bg-amber-400',
  },
  // Same look as the Studio's "AI is overwhelmed" overlay: theme colours only,
  // so it matches every theme instead of shouting red. It is a temporary
  // capacity notice, not the user's mistake.
  error: {
    Icon: AlertTriangle,
    icon: 'text-muted-foreground',
    border: 'border-border',
    button: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
} as const;

/** Accessible centered result dialog. Radix supplies X, outside-click and Escape closing. */
export default function CadStatusDialog({ notice, onClose }: CadStatusDialogProps) {
  const tone = notice ? toneStyles[notice.tone] : toneStyles.error;
  const Icon = tone.Icon;

  return (
    <Dialog open={Boolean(notice)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn('w-[calc(100vw-2rem)] max-w-sm gap-0 rounded-none border-2 p-0 shadow-2xl sm:rounded-none', tone.border)}>
        {notice && (
          <div className="px-6 py-7 text-center sm:px-8 sm:py-8">
            <Icon className={cn('mx-auto mb-4 h-9 w-9', tone.icon)} aria-hidden="true" />
            <DialogTitle className="font-display text-2xl uppercase tracking-[0.12em] text-foreground">
              {notice.title}
            </DialogTitle>
            <DialogDescription className="mt-3 text-center text-sm leading-6 text-muted-foreground">
              {notice.message}
            </DialogDescription>
            <DialogClose asChild>
              <button
                type="button"
                className={cn('mt-6 min-h-11 w-full px-6 text-xs font-bold uppercase tracking-[0.15em] transition-colors', tone.button)}
              >
                Close
              </button>
            </DialogClose>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
