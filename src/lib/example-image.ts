/**
 * Loads a bundled example picture (a Vite asset URL) as a File, so it goes
 * through the same path as a picture the customer uploaded.
 *
 * Throws when the picture can't be loaded: a failed request (offline, a stale
 * asset after a deploy) or a reply that is not an image (an HTML error page),
 * so callers can say so instead of silently doing nothing.
 */
export async function loadExampleImage(src: string, fileName: string): Promise<File> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Example picture failed to load (${res.status})`);
  const blob = await res.blob();
  if (blob.type && !blob.type.startsWith("image/")) throw new Error(`Example picture is not an image (${blob.type})`);
  return new File([blob], fileName, { type: blob.type || "image/webp" });
}

/**
 * Brings the upload canvas into view when less than half of it is on screen.
 * On phones the examples sit below the canvas, so a picture added from them
 * would otherwise land out of sight and look like nothing happened.
 */
export function revealElement(el: Element | null | undefined) {
  if (!el || typeof el.getBoundingClientRect !== "function") return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
  if (visible < Math.min(r.height, vh) / 2) el.scrollIntoView?.({ behavior: "smooth", block: "center" });
}
