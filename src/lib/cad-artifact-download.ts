import { authenticatedFetch } from '@/lib/authenticated-fetch';

export type CadArtifactKind = 'glb' | '3dm';

interface CadArtifactUrls {
  glb_url?: string | null;
  threedm_url?: string | null;
}

export function selectCadArtifactUrl(
  kind: CadArtifactKind,
  fresh: CadArtifactUrls | null | undefined,
  fallback: CadArtifactUrls,
): string | null {
  if (kind === '3dm') return fresh?.threedm_url ?? fallback.threedm_url ?? null;
  return fresh?.glb_url ?? fallback.glb_url ?? null;
}

export async function isExpectedCadArtifact(blob: Blob, kind: CadArtifactKind): Promise<boolean> {
  if (blob.size === 0) return false;

  const prefix = blob.slice(0, Math.min(blob.size, 32));
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not inspect downloaded file.'));
    reader.readAsArrayBuffer(prefix);
  });
  const header = new Uint8Array(buffer);
  if (kind === 'glb') {
    if (header.length < 12) return false;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    return header[0] === 0x67
      && header[1] === 0x6c
      && header[2] === 0x54
      && header[3] === 0x46
      && view.getUint32(4, true) === 2
      && view.getUint32(8, true) === blob.size;
  }

  if (blob.size < 32 || header.length < 32) return false;
  const text = new TextDecoder('ascii').decode(header);
  // Bytes 24-31 are an 8-char right-justified, space-padded version number
  // (openNURBS GetFirst32BytesOf3dmFile). Older Rhino files write 1-digit
  // versions (e.g. "4"); don't require exactly 2.
  const version = text.slice(23).trim();
  return text.startsWith('3D Geometry File Format') && /^\d{1,8}$/.test(version);
}

/**
 * Pulls the expected sha256 out of a hash-addressed artifact URL.
 *
 * The backend serves artifacts at `/api/artifacts/<sha256>`, and that path
 * segment is the same value it reports in the artifact's `sha256` field. So
 * the URL alone tells us what the bytes should hash to, with no extra
 * plumbing and no dependency on the size/hash surviving the trip through
 * GenerationsContext (which today drops them, see useImageToCADWorkflow).
 *
 * Returns null for anything not hash addressed, such as signed blob URLs.
 * Those are not verifiable, and treating them as if they were would fail every
 * download from them against a check that can never pass.
 */
export function expectedSha256FromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const segment = path.slice(path.lastIndexOf('/') + 1);
  return /^[0-9a-f]{64}$/i.test(segment) ? segment.toLowerCase() : null;
}

/**
 * Verifies downloaded bytes against the hash the URL advertises.
 *
 * Returns true when there is nothing to check against, either because the URL
 * is not hash addressed or because WebCrypto is unavailable (non-secure
 * context, or jsdom). A missing verifier must not block a download that is
 * probably fine; this is a guard against silent corruption, not an access
 * control.
 */
export async function matchesExpectedSha256(blob: Blob, expected: string | null): Promise<boolean> {
  if (!expected) return true;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return true;

  const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
  const actual = Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return actual === expected;
}

export async function downloadCadArtifact(
  url: string,
  filename: string,
  kind: CadArtifactKind,
): Promise<void> {
  const parsed = new URL(url, window.location.origin);
  const needsAuth = parsed.origin === window.location.origin
    && (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/artifacts/'));
  const response = await (needsAuth ? authenticatedFetch(url) : fetch(url));
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  const blob = await response.blob();
  if (!(await isExpectedCadArtifact(blob, kind))) {
    throw new Error(`The server did not return a valid ${kind.toUpperCase()} file.`);
  }
  // Catches a truncated or corrupted transfer. This matters most for .3dm,
  // which carries no internal length field, so a short read is otherwise
  // indistinguishable from a complete file and only fails later, in Rhino.
  if (!(await matchesExpectedSha256(blob, expectedSha256FromUrl(url)))) {
    throw new Error(`The downloaded ${kind.toUpperCase()} file was incomplete. Please try again.`);
  }

  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
