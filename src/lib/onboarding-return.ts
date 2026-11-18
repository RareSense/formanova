// Where to send someone after onboarding: back to the page they were heading
// to when the onboarding redirect caught them, or the studio as before.

export const ONBOARDING_DEFAULT_RETURN = '/studio';

// Never return to these: auth and onboarding would loop, and the payment
// result pages would re-run their one-time work on a second visit.
const BLOCKED_PATHS = [
  '/onboarding',
  '/onboarding-welcome',
  '/login',
  '/oauth-callback',
  '/success',
  '/payment-success',
  '/cancel',
];

/** A safe in-app path from router state, or the studio. Never throws. */
export function onboardingReturnPath(from: unknown): string {
  if (typeof from !== 'string') return ONBOARDING_DEFAULT_RETURN;
  // In-app paths only: "//host" and "/\host" would leave the site.
  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return ONBOARDING_DEFAULT_RETURN;
  const path = from.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (BLOCKED_PATHS.some((b) => path === b || path.startsWith(`${b}/`))) return ONBOARDING_DEFAULT_RETURN;
  return from;
}
