/**
 * TEMPORARY - Shopify app-review tester callout.
 *
 * Shows test-store credentials above the Shopify connect/export buttons,
 * only for the app-review tester account (VITE_SHOPIFY_TESTER_EMAILS).
 *
 * Removal instructions: docs/SHOPIFY_TESTER_CALLOUT_REMOVAL.md
 */
import { useRef, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

import { cn } from '@/lib/utils';

// Fill these in with the development test-store credentials.
const TESTER_STORE_EMAIL = 'REPLACE_WITH_TEST_STORE_EMAIL';
const TESTER_STORE_PASSWORD = 'REPLACE_WITH_TEST_STORE_PASSWORD';

// Reads the logged-in user's email from the same localStorage key AuthContext
// uses, so this temporary component needs no provider wiring.
function getStoredUserEmail(): string | null {
  try {
    const raw = localStorage.getItem('formanova_auth_user');
    if (!raw) return null;
    const email = JSON.parse(raw)?.email;
    return typeof email === 'string' ? email : null;
  } catch {
    return null;
  }
}

function isShopifyReviewTester(email: string | undefined | null): boolean {
  if (!email) return false;
  const raw = import.meta.env.VITE_SHOPIFY_TESTER_EMAILS;
  if (!raw || typeof raw !== 'string') return false;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

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
        <CopyField label="Email" value={TESTER_STORE_EMAIL} />
        <CopyField label="Password" value={TESTER_STORE_PASSWORD} />
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
 * Wraps a Shopify connect/export button. For the app-review tester account it
 * renders the credentials callout directly above the button, pointing at it.
 * The callout stays visible until the button is clicked. For everyone else it
 * renders children untouched.
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

  if (!isShopifyReviewTester(getStoredUserEmail())) return <>{children}</>;

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
