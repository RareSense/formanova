/**
 * TEMPORARY - Shopify app-review tester callout.
 *
 * Shows test-store credentials above the Shopify connect/export buttons.
 * Renders for every user, but only when VITE_SHOPIFY_TESTER_STORE_EMAIL and
 * VITE_SHOPIFY_TESTER_STORE_PASSWORD are set at build time (review env only).
 *
 * Removal instructions: docs/SHOPIFY_TESTER_CALLOUT_REMOVAL.md
 */
import { useRef, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

import { cn } from '@/lib/utils';

// Development test-store credentials come from env so nothing sensitive
// lives in the repo. Set both in .env or the callout will not render.
const TESTER_STORE_EMAIL = import.meta.env.VITE_SHOPIFY_TESTER_STORE_EMAIL as string | undefined;
const TESTER_STORE_PASSWORD = import.meta.env.VITE_SHOPIFY_TESTER_STORE_PASSWORD as string | undefined;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-2 border border-border bg-muted/20 px-2.5 py-1.5">
      <span className="w-16 shrink-0 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-[#008060]" />
          : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function TesterCallout() {
  return (
    <div className="relative mb-3 w-full border border-foreground bg-background p-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground">
        For Shopify app testers
      </p>

      <p className="mt-2 font-display text-lg uppercase leading-none tracking-wide text-foreground">
        Before clicking this button
      </p>

      <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground">
        Log in to Shopify with the development test-store credentials below in
        the same browser. Otherwise, the connection will not work.
      </p>

      <div className="mt-3 space-y-1.5">
        <CopyField label="Email" value={TESTER_STORE_EMAIL!} />
        <CopyField label="Password" value={TESTER_STORE_PASSWORD!} />
      </div>

      {/* Arrow pointing down at the button below */}
      <span
        aria-hidden="true"
        className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-foreground bg-background"
      />
    </div>
  );
}

/**
 * Wraps a Shopify connect/export button. When the credential env vars are set
 * it renders the callout directly above the button, pointing at it, for every
 * user. The callout stays visible until the button is clicked. When the vars
 * are absent (production) it renders children untouched.
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
      className={cn('w-full', className)}
      onClickCapture={(e) => {
        // Copy clicks inside the callout should not dismiss it
        if (calloutRef.current?.contains(e.target as Node)) return;
        setDismissed(true);
      }}
    >
      {!dismissed && (
        <div ref={calloutRef}>
          <TesterCallout />
        </div>
      )}
      {children}
    </div>
  );
}
