/**
 * Frontend rollout gates for CAD tools that are still allowlisted.
 * This is a UI-only gate - not a security boundary.
 */

/**
 * TEMPORARY: hides every user-facing CAD entry point (header nav link,
 * dashboard tile, and the /studio-cad, /text-to-cad, /image-to-cad routes
 * themselves - CADGate redirects those to /dashboard while this is true).
 *
 * Owner: uswa. Reason: production CAD backend is being updated and may be
 * unstable for a while; hiding the entry points avoids sending users into a
 * broken flow mid-update. Nothing else changes - no CAD code, route, or
 * component is modified or deleted, so re-enabling is exact.
 *
 * Removal condition: flip back to `false` (or delete this flag and its call
 * sites in Header.tsx, Dashboard.tsx, and CADGate.tsx) when told to restore
 * CAD - grep `CAD_USER_FACING_HIDDEN` for every call site.
 */
export const CAD_USER_FACING_HIDDEN = true;

function getAllowlist(envKey: string): string[] {
  const rawValue = import.meta.env[envKey];
  if (!rawValue || typeof rawValue !== 'string') return [];

  return rawValue
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowlistedEmail(email: string | undefined | null, envKey: string): boolean {
  if (!email) return false;
  return getAllowlist(envKey).includes(email.trim().toLowerCase());
}

/**
 * GLB rename UI in the Text-to-CAD history card — controlled by VITE_CAD_RENAME_ENABLED.
 * Set to "true" to show the pencil/rename; anything else (or absent) keeps it hidden.
 */
export const CAD_RENAME_ENABLED = import.meta.env.VITE_CAD_RENAME_ENABLED === 'true';

/**
 * Users allowed to see the weight estimation + STL export tools.
 */
export function isWeightStlEnabled(email: string | undefined | null): boolean {
  return isAllowlistedEmail(email, 'VITE_WEIGHT_STL_ALLOWLIST_EMAILS');
}

/**
 * Alternate two-column upload layout — enabled for all users.
 */
/**
 * Users allowed to see the "Upload CAD File" button on the initial prompt screen.
 */
export function isCadUploadEnabled(email: string | undefined | null): boolean {
  return isAllowlistedEmail(email, 'VITE_CAD_UPLOAD_ALLOWLIST_EMAILS');
}

/**
 * Image to 3D shipped publicly — the flag was removed per its own removal
 * condition and the history section renders for everyone.
 * VITE_IMAGE_TO_CAD_ALLOWLIST_EMAILS is no longer read and can be dropped
 * from .env files.
 */

/**
 * "What best describes you?" onboarding screen — enabled for all users.
 */
/**
 * Asset metadata (category label, inline model rename) — enabled for all users.
 */
/**
 * "View Guide" button on the My Products panel in the upload step.
 */
/**
 * "Show all" toggle in the jewelry vault picker — bypasses intended_use filter.
 */
/**
 * Onboarding welcome screen — input quality guidelines + Terms of Service gate.
 */
/**
 * Authenticated image fetching via blob URLs for /artifacts/ paths.
 */
/**
 * "Not satisfied?" feedback widget on the result screen.
 */
/**
 * In-studio onboarding popup (multi-step) + model guide button on the model canvas.
 */
/**
 * Pre-selection screen at /studio — choose Model Shot or Product Shot.
 */
/**
 * Product shot upload guide modal — shown once before the user's first product shot.
 */
/**
 * Bottom-left test menu (upload guide, product shot guide, role picker).
 */
