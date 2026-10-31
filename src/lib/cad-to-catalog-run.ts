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
  CATALOG_SHOT_WORKFLOW,
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
  parseSaveResult,
  priceFromPolicy,
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
  const workflowId = await startCatalogRun(CATALOG_SHOT_WORKFLOW, buildPlaceBody(params), signal);
  const image = await waitForCatalogRun(workflowId, parsePlaceResult, { intervalMs: PLACE_POLL_INTERVAL_MS, timeoutMs: PLACE_POLL_TIMEOUT_MS, signal });
  return image ? { workflowId, image } : null;
}

/** Keeps browser-drawn pictures with a run, so they are in Generations (charged at `resolution`). */
export async function savePictures(piece: string, category: string, pictures: SavedPicture[], signal?: AbortSignal, resolution?: CatalogResolution): Promise<SavedResult[] | null> {
  const workflowId = await startCatalogRun(CATALOG_SHOT_WORKFLOW, buildSaveBody(piece, category, pictures, resolution), signal);
  return waitForCatalogRun(workflowId, parseSaveResult, { intervalMs: SAVE_POLL_INTERVAL_MS, timeoutMs: SAVE_POLL_TIMEOUT_MS, signal });
}

/**
 * Credits for one picture at this resolution, from the workflow's price list. Not
 * /credits/estimate: that adds up both of the workflow's steps, though each picture runs one.
 */
export async function picturePrice(resolution: CatalogResolution, signal?: AbortSignal): Promise<number> {
  try {
    const res = await authenticatedFetch(`/api/credits/policy/${CATALOG_SHOT_WORKFLOW}`, { signal });
    if (res.ok) {
      const price = priceFromPolicy(await res.json(), resolution);
      if (price !== null) return price;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  return CATALOG_FALLBACK_PRICES[resolution];
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

/**
 * A heavy .3dm split on the server: the skeleton .3dm and the packed meshes (unzipped).
 * onStage names each step for the user: uploading, preparing, loading.
 */
export async function fastloadFile(data: ArrayBuffer, signal?: AbortSignal, onStage?: (text: string) => void): Promise<{ skeleton: ArrayBuffer; packed: ArrayBuffer }> {
  onStage?.(`Uploading ${Math.round(data.byteLength / 1e6)} MB…`);
  const body = buildCadFileBody(await blobToDataUrl(new Blob([data], { type: 'application/octet-stream' })));
  const workflowId = await startCatalogRun(CATALOG_FASTLOAD_WORKFLOW, body, signal);
  onStage?.('Preparing…');
  const res = await waitForCatalogRun(workflowId, parseFastloadResult, { intervalMs: SAVE_POLL_INTERVAL_MS, timeoutMs: FASTLOAD_POLL_TIMEOUT_MS, signal });
  if (!res) throw new CatalogRunError('cancelled');
  onStage?.('Loading…');
  const [skeleton, meshes] = await Promise.all([fetchBytes(res.skeleton, signal), fetchBytes(res.meshes, signal)]);
  return { skeleton, packed: await gunzip(meshes) };
}
