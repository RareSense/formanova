/**
 * Saving and opening one of a version's files through its short-lived signed
 * link (GET /api/cad/versions/{id}/downloads/{kind}). Shared by the download
 * menu and the left panel's Tech spec section, so both go the same way.
 */
import { toast } from 'sonner';

import { AuthExpiredError } from '@/lib/authenticated-fetch';
import type { CadSource } from '@/lib/cad-analytics';
import { CadDownloadUnavailableError, fetchVersionDownloadLink, type CadDownloadKind } from '@/lib/cad-versions-api';
import { trackDownloadClicked } from '@/lib/posthog-events';

function linkFailed(err: unknown) {
  if (err instanceof AuthExpiredError) return;
  toast.error(err instanceof CadDownloadUnavailableError
    ? "That file isn't available for this model."
    : "Couldn't get the download link. Try again.");
}

/** Saves the file under its own name; the link already makes the browser download it. */
export async function saveVersionFile(assetId: string, kind: CadDownloadKind, source?: CadSource) {
  try {
    const link = await fetchVersionDownloadLink(assetId, kind);
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.download = link.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    trackDownloadClicked({ file_name: link.filename, file_type: kind, context: source, source });
  } catch (err) {
    linkFailed(err);
  }
}

/**
 * Opens the file in a new tab. The tab is opened on the click itself, before
 * the link is fetched, so popup blockers allow it; it is cut off from this
 * page, then sent to the link, or closed if there is none.
 */
export async function openVersionFile(assetId: string, kind: CadDownloadKind) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const link = await fetchVersionDownloadLink(assetId, kind);
    if (tab) tab.location.href = link.url;
    else window.open(link.url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    tab?.close();
    linkFailed(err);
  }
}
