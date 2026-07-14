/**
 * TEMPORARY - Shopify app-review tester callout.
 *
 * Floating card beside the Shopify connect/export buttons showing the
 * test-store credentials. Renders for every user, but only when
 * VITE_SHOPIFY_TESTER_STORE_EMAIL and VITE_SHOPIFY_TESTER_STORE_PASSWORD
 * are set at build time (review env only).
 *
 * Removal instructions: docs/SHOPIFY_TESTER_CALLOUT_REMOVAL.md
 */
import { useRef, useState, type ReactNode } from 'react';
import { Copy, Check, KeyRound, Mail, X } from 'lucide-react';

import { cn } from '@/lib/utils';

// Development test-store credentials come from env so nothing sensitive
// lives in the repo. Set both in .env or the callout will not render.
const TESTER_STORE_EMAIL = import.meta.env.VITE_SHOPIFY_TESTER_STORE_EMAIL as string | undefined;
const TESTER_STORE_PASSWORD = import.meta.env.VITE_SHOPIFY_TESTER_STORE_PASSWORD as string | undefined;

function CopyField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="shrink-0 text-xs font-semibold text-foreground">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-left text-xs text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-primary" />
          : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function TesterCallout({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className={cn(
        // Mobile / narrow: in-flow card above the button, arrow pointing down.
        'relative z-40 mb-3 w-full rounded-xl border border-border bg-background p-4 text-left shadow-xl',
        // md+: floats to the right of the button, arrow pointing left at it.
        'md:absolute md:left-full md:top-1/2 md:mb-0 md:ml-4 md:w-72 md:-translate-y-1/2'
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss tester notice"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="pr-7 font-mono text-[8px] uppercase tracking-[0.3em] text-primary">
        For Shopify app testers
      </p>

      <p className="mt-2 pr-4 font-display text-xl uppercase leading-none tracking-wide text-foreground">
        Before clicking this button
      </p>

      <p className="mt-2.5 text-xs font-semibold leading-relaxed text-foreground">
        Log in to Shopify with these development test-store credentials in the
        same browser. Otherwise, the connection will not work.
      </p>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <CopyField icon={Mail} label="Email" value={TESTER_STORE_EMAIL!} />
        <CopyField icon={KeyRound} label="Password" value={TESTER_STORE_PASSWORD!} />
      </div>

      {/* Arrow pointing down at the button (mobile placement) */}
      <span
        aria-hidden="true"
        className="absolute -bottom-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-b border-r border-border bg-background md:hidden"
      />
      {/* Arrow pointing left at the button (desktop placement) */}
      <span
        aria-hidden="true"
        className="absolute -left-[7px] top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-b border-l border-border bg-background md:block"
      />
    </div>
  );
}

/**
 * Wraps a Shopify connect/export button. When the credential env vars are set
 * it renders the callout pointing at the button (beside it on desktop, above
 * it on smaller screens) for every user. The callout stays visible until the
 * button is clicked or the notice is dismissed. When the vars are absent
 * (production) it renders children untouched.
 */
export function ShopifyTesterCalloutAnchor({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const calloutRef = useRef<HTMLDivElement>(null);

  // Shown to every user whenever the credential env vars are set. The vars
  // are only set on the environment used for Shopify app review, never on
  // production, so regular users never see this.
  if (!TESTER_STORE_EMAIL || !TESTER_STORE_PASSWORD) return <>{children}</>;

  return (
    <div
      className={cn('relative w-full', className)}
      onClickCapture={(e) => {
        // Copy clicks inside the callout should not dismiss it
        if (calloutRef.current?.contains(e.target as Node)) return;
        setDismissed(true);
      }}
    >
      {!dismissed && (
        <div ref={calloutRef}>
          <TesterCallout onDismiss={() => setDismissed(true)} />
        </div>
      )}
      {children}
    </div>
  );
}
