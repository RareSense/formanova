import { Button } from '@/components/ui/button';

/** Sticky drawer footer with the gold primary CTA; respects the iOS safe area. */
export function IntakeFooter({
  label, disabled, onClick, children,
}: { label: string; disabled: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background px-4 md:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {children}
      <Button
        disabled={disabled}
        onClick={onClick}
        className="h-11 w-full px-6 font-display text-lg uppercase tracking-wide text-primary-foreground bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] hover:opacity-90"
      >
        {label}
      </Button>
    </div>
  );
}
