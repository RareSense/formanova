/**
 * Fetch + open one 3D file for the admin "Inputs -> Outputs" preview, reusing the CAD to
 * Catalog viewer (CatalogEngine: GLB / glTF, 3DM through rhino3dm, STL; orbit, zoom and pan).
 * The engine is imported on demand, so the admin page does not ship three.js until a preview
 * actually mounts.
 *
 * Token rule: only a same-origin path (the /api/artifacts proxy) is fetched with the admin's
 * token. Any other (already trusted, see url-safety.ts) host gets a plain request with no
 * credentials and no referrer, so the token never leaves the origin.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface OpenedModel {
  dispose(): void;
}

const sameOrigin = (url: string) => url.startsWith('/') && !url.startsWith('//');

export async function fetchModelBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = sameOrigin(url)
    ? await authenticatedFetch(url, { signal })
    : await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.arrayBuffer();
  if (!data.byteLength) throw new Error('empty file');
  return data;
}

/** Opens the bytes in a new viewer inside `host`. The caller disposes it on unmount. */
export async function openModel(host: HTMLElement, data: ArrayBuffer, fileName: string): Promise<OpenedModel> {
  const { CatalogEngine } = await import('@/components/cad-to-catalog/engine/engine');
  const engine = new CatalogEngine(host);
  try {
    await engine.open(new File([data], fileName), new Map());
  } catch (error) {
    engine.dispose();
    throw error;
  }
  return engine;
}
