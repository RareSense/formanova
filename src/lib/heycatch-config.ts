import type { HeyCatchCapturedEvent } from '@heycatch/sdk';

// Only the live site counts. Staging, local dev and preview hosts would otherwise
// show up in HeyCatch as real visitors.
const LIVE_HOST = 'formanova.ai';

export function isHeyCatchHost(hostname: string): boolean {
  return hostname.toLowerCase() === LIVE_HOST;
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function eventPath(event: HeyCatchCapturedEvent): string {
  const url = event.properties?.$current_url;
  if (typeof url === 'string') {
    try {
      return new URL(url).pathname;
    } catch {
      // fall through to the current page
    }
  }
  return window.location.pathname;
}

// Admin pages list other customers' emails, and clicked text is captured, so
// nothing from /admin goes to HeyCatch. Staff activity isn't visitor data anyway.
export function dropAdminEvents(event: HeyCatchCapturedEvent | null): HeyCatchCapturedEvent | null {
  if (!event) return event;
  return isAdminPath(eventPath(event)) ? null : event;
}
