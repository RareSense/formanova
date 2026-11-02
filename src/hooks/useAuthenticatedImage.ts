import { useState, useEffect } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { azureUriToUrl } from "@/lib/azure-utils";

export interface AuthenticatedImageState {
  src: string | null;
  /** The artifact fetch failed (non-2xx or network); the caller can stop showing a spinner. */
  failed: boolean;
}

/**
 * A renderable src for an image url, plus whether loading it failed.
 *
 * - If the URL contains "/artifacts/", fetches with Bearer token and
 *   returns a temporary blob URL. Revokes the blob URL on cleanup.
 * - All other URLs (static assets, external CDN, null) are returned as-is.
 *
 * The "/artifacts/" check covers artifact paths such as /api/artifacts/<sha256>
 * without env-specific logic.
 */
export function useAuthenticatedImageState(url: string | null | undefined): AuthenticatedImageState {
  const [state, setState] = useState<AuthenticatedImageState>({ src: null, failed: false });

  useEffect(() => {
    const resolvedUrl = azureUriToUrl(url);

    if (!resolvedUrl) {
      setState({ src: null, failed: false });
      return;
    }

    // Pass through when URL is not an artifacts path
    if (!resolvedUrl.includes("/artifacts/")) {
      setState({ src: resolvedUrl, failed: false });
      return;
    }

    // Clear immediately: when the url swaps (e.g. an upscaled result replacing
    // the original), the old blob URL is revoked by the previous cleanup, so
    // keeping it in state renders a stale/dead image while the new one loads.
    setState({ src: null, failed: false });

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
          setState({ src: objectUrl, failed: false });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

/** The src alone (null while loading or after a failure), for existing callers. */
export function useAuthenticatedImage(url: string | null | undefined): string | null {
  return useAuthenticatedImageState(url).src;
}
