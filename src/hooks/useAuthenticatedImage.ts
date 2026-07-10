import { useState, useEffect } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { azureUriToUrl } from "@/lib/azure-utils";

/**
 * Returns a renderable URL for an image src.
 *
 * - If the URL contains "/artifacts/", fetches with Bearer token and
 *   returns a temporary blob URL. Revokes the blob URL on cleanup.
 * - All other URLs (static assets, external CDN, null) are returned as-is.
 *
 * The "/artifacts/" check covers artifact paths such as /api/artifacts/<sha256>
 * without env-specific logic.
 */
export function useAuthenticatedImage(url: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolvedUrl = azureUriToUrl(url);

    if (!resolvedUrl) {
      setBlobUrl(null);
      return;
    }

    // Pass through when URL is not an artifacts path
    if (!resolvedUrl.includes("/artifacts/")) {
      setBlobUrl(resolvedUrl);
      return;
    }

    // Clear immediately: when the url swaps (e.g. an upscaled result replacing
    // the original), the old blob URL is revoked by the previous cleanup, so
    // keeping it in state renders a stale/dead image while the new one loads.
    setBlobUrl(null);

    let objectUrl: string | null = null;
    let cancelled = false;

    authenticatedFetch(resolvedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return blobUrl;
}
