/**
 * cad-to-catalog-run.ts
 *
 * Starts one Catalog from CAD workflow run and waits for its result. No React
 * here, so the start/poll/parse rules are testable on their own (AI_RULES 5, 10).
 *
 *   start   POST /api/run/state/<workflow>
 *   status  GET  /api/status/{id}   runtime.state; completed | failed | budget_exhausted are terminal
 *   result  GET  /api/result/{id}   fetched once, after status is terminal
 *   up to 3 transient 404s while the run registers, up to 5 status errors,
 *   cancelled through the caller's AbortSignal.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';
import type { ArtifactRef } from '@/lib/ring-cad-nurbs-api';
import {
  CATALOG_FALLBACK_PRICES,
  CATALOG_FASTLOAD_WORKFLOW,
  CATALOG_PLACE_WORKFLOW,
  CATALOG_RHINO_MESH_WORKFLOW,
  CATALOG_SAVE_WORKFLOW,
  FASTLOAD_POLL_TIMEOUT_MS,
  PLACE_POLL_INTERVAL_MS,
  PLACE_POLL_TIMEOUT_MS,
  SAVE_POLL_INTERVAL_MS,
  SAVE_POLL_TIMEOUT_MS,
  buildCadFileBody,
  buildPlaceBody,
  buildSaveBody,
  parseFailure,
  parseFastloadResult,
  parsePlaceResult,
  parseRhinoMeshResult,
  parseSaveResult,
  type CatalogPriceKind,
  type CatalogResolution,
  type PlaceParams,
  type SavedPicture,
  type SavedResult,
  type StartBody,
} from '@/lib/cad-to-catalog-api';

/** A run that ended without its result. `message` is safe to show the customer. */
export class CatalogRunError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false) {
    super(message);
    this.name = 'CatalogRunError';
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

export async function startCatalogRun(workflow: string, body: StartBody, signal?: AbortSignal): Promise<string> {
  const res = await authenticatedFetch(`/api/run/state/${workflow}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.status === 402) throw new CatalogRunError('Not enough credits for this picture.', 402);
    if (res.status === 413) throw new CatalogRunError('This file is too large to send.', 413);
    const detail = (err as Record<string, unknown>).error ?? (err as Record<string, unknown>).detail;
    throw new CatalogRunError(typeof detail === 'string' && detail ? detail : `Couldn't start (${res.status})`, res.status, res.status >= 500);
  }
  const data = (await res.json()) as { workflow_id?: string };
  if (!data.workflow_id) throw new CatalogRunError("Couldn't start (no run id)");
  return data.workflow_id;
}

/** Waits for a run; resolves with the parsed result, or null when the caller cancelled. */
export async function waitForCatalogRun<T>(
  workflowId: string,
  parse: (data: unknown) => T | null,
  { intervalMs, timeoutMs, signal }: { intervalMs: number; timeoutMs: number; signal?: AbortSignal },
): Promise<T | null> {
  let data: unknown;
  try {
    const polled = await pollWorkflow<unknown>({
      mode: 'status-then-result',
      fetchStatus: () => authenticatedFetch(`/api/status/${workflowId}`, { signal }),
      fetchResult: () => authenticatedFetch(`/api/result/${workflowId}`, { signal }),
      resolveState: (statusData) => {
        const s = statusData as { runtime?: { state?: string }; state?: string };
        return (s.runtime?.state || s.state || 'unknown').toLowerCase();
      },
      parseResult: (d) => d,
      intervalMs,
      timeoutMs,
      max404s: 3,
      maxPollErrors: 5,
      maxResultRetries: 2,
      signal,
    });
    if (polled.status === 'cancelled') return null;
    data = polled.result;
  } catch (err) {
    if (signal?.aborted) return null;
    const timedOut = err instanceof Error && /timed? ?out/i.test(err.message);
    throw new CatalogRunError(timedOut ? 'This is taking too long. Please try again.' : "We couldn't finish that. Please try again.", null, true);
  }
  const parsed = parse(data);
  if (parsed === null) {
    const f = parseFailure(data);
    throw new CatalogRunError(f.userMessage, null, f.retryable);
  }
  return parsed;
}

/** A transparent render placed in a background photo by AI. */
export async function placeOnBackground(params: PlaceParams, signal?: AbortSignal): Promise<{ workflowId: string; image: ArtifactRef } | null> {
  const workflowId = await startCatalogRun(CATALOG_PLACE_WORKFLOW, buildPlaceBody(params), signal);
  const image = await waitForCatalogRun(workflowId, parsePlaceResult, { intervalMs: PLACE_POLL_INTERVAL_MS, timeoutMs: PLACE_POLL_TIMEOUT_MS, signal });
  return image ? { workflowId, image } : null;
}

/** Keeps browser-drawn pictures with a run, so they are in Generations (charged at `resolution`). */
export async function savePictures(piece: string, category: string, pictures: SavedPicture[], signal?: AbortSignal, resolution?: CatalogResolution): Promise<SavedResult[] | null> {
  const workflowId = await startCatalogRun(CATALOG_SAVE_WORKFLOW, buildSaveBody(piece, category, pictures, resolution), signal);
  return waitForCatalogRun(workflowId, parseSaveResult, { intervalMs: SAVE_POLL_INTERVAL_MS, timeoutMs: SAVE_POLL_TIMEOUT_MS, signal });
}

const PRICE_WORKFLOW: Record<CatalogPriceKind, string> = { place: CATALOG_PLACE_WORKFLOW, save: CATALOG_SAVE_WORKFLOW };

/** Credits for one picture: the backend's estimate for that workflow at that resolution, else the fallback. */
export async function picturePrice(kind: CatalogPriceKind, resolution: CatalogResolution, signal?: AbortSignal): Promise<number> {
  try {
    const res = await authenticatedFetch('/api/credits/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_name: PRICE_WORKFLOW[kind], num_variations: 1, pricing_context: { resolution } }),
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { projected_max_hold?: number; estimated_credits?: number };
      const cost = data.projected_max_hold ?? data.estimated_credits;
      if (typeof cost === 'number' && cost > 0) return cost;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  return CATALOG_FALLBACK_PRICES[kind][resolution];
}

async function fetchBytes(ref: ArtifactRef, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await authenticatedFetch(ref.url, { signal });
  if (!res.ok) throw new CatalogRunError(`Couldn't download the prepared file (${res.status})`, res.status, true);
  return res.arrayBuffer();
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** A heavy .3dm split on the server: the skeleton .3dm and the packed meshes (unzipped). */
export async function fastloadFile(data: ArrayBuffer, signal?: AbortSignal): Promise<{ skeleton: ArrayBuffer; packed: ArrayBuffer }> {
  const body = buildCadFileBody(await blobToDataUrl(new Blob([data], { type: 'application/octet-stream' })));
  const workflowId = await startCatalogRun(CATALOG_FASTLOAD_WORKFLOW, body, signal);
  const res = await waitForCatalogRun(workflowId, parseFastloadResult, { intervalMs: SAVE_POLL_INTERVAL_MS, timeoutMs: FASTLOAD_POLL_TIMEOUT_MS, signal });
  if (!res) throw new CatalogRunError('cancelled');
  const [skeleton, meshes] = await Promise.all([fetchBytes(res.skeleton, signal), fetchBytes(res.meshes, signal)]);
  return { skeleton, packed: await gunzip(meshes) };
}

/** Display meshes for surfaces saved without them, made by Rhino on the server. */
export async function rhinoMeshFile(data: ArrayBuffer, signal?: AbortSignal): Promise<ArrayBuffer> {
  const body = buildCadFileBody(await blobToDataUrl(new Blob([data], { type: 'application/octet-stream' })));
  const workflowId = await startCatalogRun(CATALOG_RHINO_MESH_WORKFLOW, body, signal);
  const res = await waitForCatalogRun(workflowId, parseRhinoMeshResult, { intervalMs: SAVE_POLL_INTERVAL_MS, timeoutMs: FASTLOAD_POLL_TIMEOUT_MS, signal });
  if (!res) throw new CatalogRunError('cancelled');
  return fetchBytes(res, signal);
}
