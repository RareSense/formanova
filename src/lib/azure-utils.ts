/**
 * Shared Azure blob storage utilities.
 * Convert azure://container/path URIs to public blob URLs.
 */

function getAzureBlobBaseUrl(): string {
  const rawBaseUrl = import.meta.env.VITE_AZURE_BLOB_BASE_URL;
  if (!rawBaseUrl || typeof rawBaseUrl !== 'string') return '';

  const trimmedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmedBaseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return trimmedBaseUrl;
  } catch {
    return '';
  }
}

// A content-addressed artifact key: a 64-char sha256 path segment (optionally with
// a file extension), at the end of the path or before a / ? #. Anchoring to a full
// segment avoids matching hex that happens to appear inside a SAS token/query.
const ARTIFACT_SHA_RE = /\/([a-f0-9]{64})(?:\.[a-z0-9]+)?(?=[/?#]|$)/i;

/**
 * Resolve any image reference to the ONE correct URL form.
 *
 * Result/fix/upscale images are content-addressed, so the sha256 appears in their
 * blob path. Whenever we can find it, return the SAME-ORIGIN artifact proxy
 * (`/api/artifacts/<sha>`): it is auth-gated, downloadable (no cross-origin CORS
 * block), and works for private blobs. This is the single source of truth — do not
 * hand-build blob URLs elsewhere; always route through here (see azure-utils.test).
 *
 * Only non-content-addressed assets (e.g. preset model images, which have plain
 * filenames) fall back to the configured blob base URL. `azure://` without a sha
 * resolves the same way it always did. Returns '' for invalid input.
 */
export function azureUriToUrl(uri: string | undefined | null): string {
  if (!uri || typeof uri !== 'string') return '';

  const sha = uri.match(ARTIFACT_SHA_RE)?.[1];
  if (sha) return `/api/artifacts/${sha.toLowerCase()}`;

  if (uri.startsWith('azure://')) {
    const baseUrl = getAzureBlobBaseUrl();
    if (!baseUrl) return '';

    const path = uri.replace('azure://', '').replace(/^\/+/, '');
    if (!path) return '';

    return `${baseUrl}/${path}`;
  }
  return uri;
}
