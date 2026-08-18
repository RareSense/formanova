import * as THREE from 'three';
import { azureUriToUrl } from '@/lib/azure-utils';

// ── LRU GLB Cache ────────────────────────────────────────────────────
const MAX_CACHE = 20;

interface CachedModel {
  scene: THREE.Group;
  lastUsed: number;
}

export const glbCache = new Map<string, CachedModel>();
export const glbLoading = new Map<string, Promise<THREE.Group>>();
export const glbErrors = new Set<string>();

export function getCachedScene(url: string): THREE.Group | null {
  const entry = glbCache.get(url);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.scene.clone(true);
  }
  return null;
}

export function cacheScene(url: string, scene: THREE.Group) {
  if (glbCache.size >= MAX_CACHE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, val] of glbCache) {
      if (val.lastUsed < oldestTime) {
        oldestTime = val.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const evicted = glbCache.get(oldestKey);
      if (evicted) disposeScene(evicted.scene);
      glbCache.delete(oldestKey);
    }
  }
  glbCache.set(url, { scene: scene.clone(true), lastUsed: Date.now() });
}

// ── GLB fetch with retry ────────────────────────────────────────────
// 5xx responses (e.g. a transient 503 from blob storage/CDN) are retried with
// backoff; 4xx responses (404/403 - genuinely missing/forbidden) fail immediately.
// Without this, one transient blip permanently marks the URL as errored via
// glbErrors, since that cache has no expiry.
const GLB_FETCH_MAX_ATTEMPTS = 3;
const GLB_FETCH_RETRY_DELAY_MS = 400;

/**
 * Resolves whatever reference a caller passed into something fetchable.
 *
 * Callers hand us the raw `artifact.uri` from the pipeline, which is normally
 * `azure://…`. That scheme cannot be fetched, so every such card failed to load.
 * Route it through azureUriToUrl (the repo's single source of truth), which maps
 * content-addressed artifacts onto the same-origin auth-gated /api/artifacts
 * proxy and leaves ordinary http(s) URLs alone.
 *
 * Returns '' when the reference cannot be resolved, so the caller shows the
 * error state instead of issuing a request that can never succeed.
 */
export function resolveGlbUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const resolved = azureUriToUrl(rawUrl);
  if (!resolved || resolved.startsWith('azure://')) return '';
  return resolved;
}

/** Same-origin proxy paths are auth-gated; public blob URLs are not. */
export function glbUrlNeedsAuth(url: string): boolean {
  return url.includes('/artifacts/') || url.startsWith('/api/');
}

export async function fetchGlbArrayBuffer(
  url: string,
  fetchFn: (url: string) => Promise<Response>,
  attempt = 0,
): Promise<ArrayBuffer> {
  const resp = await fetchFn(url);
  if (!resp.ok) {
    const isTransient = resp.status >= 500 && resp.status < 600;
    if (isTransient && attempt < GLB_FETCH_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, GLB_FETCH_RETRY_DELAY_MS * (attempt + 1)));
      return fetchGlbArrayBuffer(url, fetchFn, attempt + 1);
    }
    throw new Error(`Failed to fetch GLB: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

export function disposeScene(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}
