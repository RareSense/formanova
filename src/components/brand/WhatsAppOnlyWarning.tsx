import { cn } from '@/lib/utils';

interface Props {
  isDark: boolean;
  onContinueAnyway: () => void;
  onGoBack: () => void;
}

/** Shown once at submit time if WhatsApp is the only online channel provided. */
export function WhatsAppOnlyWarning({ isDark, onContinueAnyway, onGoBack }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md border border-border bg-background p-6">
        <h3 className="font-display text-xl text-foreground">Just WhatsApp?</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Add a website, store, or social link too. It helps us understand your brand better and give you a more bespoke experience.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onContinueAnyway}
            className={cn(
              'w-full py-3 text-sm font-medium transition-colors sm:w-auto sm:px-6',
              isDark
                ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
                : 'bg-foreground text-background hover:opacity-90',
            )}
          >
            Continue anyway
          </button>
          <button
            type="button"
            onClick={onGoBack}
            className="w-full border border-border py-3 text-sm font-medium text-foreground transition-colors hover:border-foreground sm:w-auto sm:px-6"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
