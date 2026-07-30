import { cn } from '@/lib/utils';

export const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors';

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-foreground">
      {label}{required && <span className="ml-1 text-destructive">*</span>}
    </label>
  );
}

/** Input with a muted trailing icon, as in the bespoke mockup. */
export function IconInput({
  icon: Icon,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <input
        {...props}
        className={cn(INPUT_CLASS, 'pr-11', error && 'border-destructive focus:border-destructive', className)}
      />
      <Icon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
    </div>
  );
}
