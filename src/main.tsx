import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { reloadPreservingSession } from "./lib/reload-utils";
import PostHogErrorBoundary from "./components/PostHogErrorBoundary";
import { getStoredUser } from "./lib/auth-api";
import { getHostRedirectDecision } from "./lib/host-redirect-policy";
import posthog from 'posthog-js';
import { analytics } from '@heycatch/sdk';
import { isHeyCatchHost, dropAdminEvents } from './lib/heycatch-config';

// requestIdleCallback / cancelIdleCallback polyfill for Safari
if (typeof window !== 'undefined' && !('requestIdleCallback' in window)) {
  (window as any).requestIdleCallback = (cb: Function) => setTimeout(cb, 1);
  (window as any).cancelIdleCallback = (id: number) => clearTimeout(id);
}

// ── Global chunk-load error handlers ──────────────────────────────
function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message || '';
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      error.name === 'ChunkLoadError'
    );
  }
  return false;
}

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    if (posthog.__loaded) posthog.captureException(event.reason);

    // During active generation, suppress — ChunkErrorBoundary handles the UI
    if ((window as any).__generationInProgress) {
      event.preventDefault();
      return;
    }

    const alreadyAttempted = sessionStorage.getItem('chunk_reload_attempted');
    if (!alreadyAttempted) {
      sessionStorage.setItem('chunk_reload_attempted', '1');
      reloadPreservingSession();
    }
  }
});

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error)) {
    if (posthog.__loaded) posthog.captureException(event.error);

    // During active generation, suppress — ChunkErrorBoundary handles the UI
    if ((window as any).__generationInProgress) {
      event.preventDefault();
      return;
    }

    const alreadyAttempted = sessionStorage.getItem('chunk_reload_attempted');
    if (!alreadyAttempted) {
      sessionStorage.setItem('chunk_reload_attempted', '1');
      reloadPreservingSession();
    }
  }
});

// ── Domain redirect ───────────────────────────────────────────────
const hostRedirect = typeof window !== 'undefined'
  ? getHostRedirectDecision({
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      publicSiteUrl: import.meta.env.VITE_PUBLIC_SITE_URL,
      allowedHosts: import.meta.env.VITE_ALLOWED_HOSTS,
    })
  : { shouldRedirect: false, redirectUrl: null };

if (hostRedirect.shouldRedirect && hostRedirect.redirectUrl) {
  window.location.replace(hostRedirect.redirectUrl);
} else {
  const rootEl = document.getElementById("root")!;
  const root = createRoot(rootEl);

  // ── PostHog: eager init with identity bootstrap ────────────────────
  // posthog-js is already in the static import chain (via posthog-events.ts →
  // AuthContext → App). Initialising eagerly costs no extra bandwidth.
  // The bootstrap option sets the user identity atomically at init time,
  // eliminating the race condition where identifyUser() fired before PostHog
  // was ready — which caused returning users to appear as anonymous UUIDs.
  //
  // DO NOT revert to lazy/deferred init. The bundle was already downloaded
  // eagerly; only init() was deferred, which just caused the bug.
  //
  // NOTE: getStoredUser is already imported at line 5 — do not add a duplicate.
  // NOTE: distinctId lowercase — PostHog SDK is case-sensitive; distinctID silently no-ops.
  const storedUser = getStoredUser();
  const posthogApiHost = import.meta.env.VITE_POSTHOG_API_HOST || 'https://relay.formanova.ai';
  posthog.init('phc_aN8qVaPxHbJIwdyuQfQkPdyrx9qDcytx1XUHSZfwvwC', {
    api_host: posthogApiHost,
    ui_host: 'https://us.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: true,
    enable_heatmaps: true,
    // Owner, 2026-11-06: recordings show everything typed, so we can see exactly where people get stuck.
    // Passwords stay hidden. Card details are typed on Stripe's own page, never here.
    session_recording: { maskAllInputs: false, maskInputOptions: { password: true } },
    bootstrap: storedUser
      ? { distinctID: storedUser.id, isIdentifiedID: true }
      : undefined,
    before_send: (event) => {
      const msg = (event as any)?.properties?.$exception_message || '';
      // Browser extensions (1Password, LastPass, etc.) inject into form inputs and
      // fire async updates on DOM nodes React has already removed. Pure noise.
      if (msg.includes('Object Not Found Matching Id')) return null;
      return event;
    },
  });

  // HeyCatch analytics, beside PostHog: visitors sent on to the canonical host above
  // aren't counted twice. Live site only, and nothing from /admin. Still module scope,
  // so every page and the short links (/a-/z, /0-/9) are covered. The key is
  // publishable. Identity is set in AuthContext. Setup guide: https://heycatch.ai/agents.md
  if (isHeyCatchHost(window.location.hostname)) {
    analytics.init({
      projectKey: 'hck_pk_Q-WHio9VKg259Dyk3y7MTusq00DEXmQw',
      install: { framework: 'vite-react', agent: 'claude-code' },
      beforeSend: dropAdminEvents,
    });
  }

  root.render(
    <PostHogErrorBoundary>
      <App />
    </PostHogErrorBoundary>
  );
}
