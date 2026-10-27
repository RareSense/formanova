/**
 * supervised-delivery.ts
 *
 * Where a supervised run's delivered model lives, read from the admin run detail itself:
 *   1. supervision.delivery.final: a sent replacement's files (glb_artifact / threedm_artifact);
 *   2. download_urls: the admin's verified uploads, the files a replacement is made from.
 * Both are served by the artifact proxy, by sha256. (A replacement's /result points at the user's
 * own model list, which an admin cannot read, so it is never used for one.)
 */
import { azureUriToUrl } from '@/lib/azure-utils';
import type { SupervisedRunDetail } from '@/lib/supervised-runs-api';

/** A proxy URL for an artifact ref: by its sha256 (how the backend serves uploads), else by its uri. */
function refUrl(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const { sha256, uri } = ref as { sha256?: unknown; uri?: unknown };
  if (typeof sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sha256)) return `/api/artifacts/${sha256.toLowerCase()}`;
  return typeof uri === 'string' && uri.startsWith('azure://') ? azureUriToUrl(uri) || null : null;
}

function downloadUrl(urls: Record<string, string> | undefined, role: string): string | null {
  const url = urls?.[role];
  return url ? azureUriToUrl(url) || url : null;
}

/** The delivered (or about-to-be-delivered) files a run's own detail already carries. */
export function deliveredFiles(detail: SupervisedRunDetail): { glb: string | null; threedm: string | null } {
  const final = (detail.supervision.delivery as { final?: Record<string, unknown> } | null)?.final;
  return {
    glb: refUrl(final?.glb_artifact) ?? downloadUrl(detail.download_urls, 'glb'),
    threedm: refUrl(final?.threedm_artifact) ?? downloadUrl(detail.download_urls, 'threedm'),
  };
}
