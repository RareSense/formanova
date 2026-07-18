// Single owner of the "where to send the user after they buy credits" path.
//
// When a generation is blocked by insufficient credits, the studio stores its
// current path here (door-in) and navigates the user to the credits page. After
// they purchase, checkout reads this value as the success redirect (door-out) so
// they land back in the studio and resume — the studio session is already
// persisted separately, so their setup is restored.

const KEY = 'formanova_post_purchase_return';

/** Remember where to return to after a purchase (called by the studio on redirect). */
export function savePostPurchaseReturn(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* sessionStorage unavailable / quota — non-fatal */
  }
}

/** Read the stored return path, or `fallback` if none was set. Does not clear it. */
export function getPostPurchaseReturn(fallback = '/credits'): string {
  try {
    return sessionStorage.getItem(KEY) || fallback;
  } catch {
    return fallback;
  }
}

/** Clear the stored return path once it has been consumed by checkout. */
export function clearPostPurchaseReturn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
