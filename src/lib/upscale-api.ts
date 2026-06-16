/**
 * Upscale API client
 * POST /run/state/upscale_image
 *
 * Post-generation upscaling: takes a finished generation and enlarges it by an
 * integer multiplier (x2..x9). Output size = input x factor, computed by the
 * service; aspect ratio is always preserved and the output long edge is capped
 * at 16K. Price depends on the INPUT generation's tier and the factor.
 *
 * The user picks a MULTIPLIER, never a target resolution.
 *
 * Polling is reused from GenerationsContext (status -> result), so this module
 * only owns the start call, the factor menu math, and the per-factor estimate.
 *
 * Backend contract (confirmed):
 * - POST /run/state/upscale_image -> 202 { workflow_id, status_url, result_url,
 *   projected_cost, authorized_budget }
 * - `image.uri` = the generation's artifact URI; accepts `azure://...` OR its SAS
 *   `https://...` URL. We send the result image URL as-is (the same URL we render).
 * - `image_size` = input tier (1k/2k/4k), lowercase, NOT the output size.
 * - `factor` = integer 2..9.
 * - Errors: 401 bad/missing JWT, 402 insufficient credits, 422 invalid
 *   (e.g. target <= source — prevented client-side by computeUpscaleFactors).
 */

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import type { PhotoshootStartResponse } from '@/lib/photoshoot-api';

const API_BASE = '/api';

/** Output is capped at 16K on the long edge. */
export const UPSCALE_MAX_LONG_EDGE = 16384;
/** Hard ceiling on the multiplier regardless of image size. */
export const UPSCALE_MAX_FACTOR = 9;
/** Lowest multiplier offered. */
export const UPSCALE_MIN_FACTOR = 2;

/**
 * Upscale jobs can be very slow on CPU (high factors much longer than a normal
 * generation), so the shared poller is given a longer ceiling for these runs.
 */
export const UPSCALE_POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Which multipliers to offer for a given source image.
 *
 *   maxFactor = min(9, floor(16384 / longestSide))
 *   show factors 2 .. maxFactor
 *
 * Uses the ACTUAL long edge in pixels (not the tier label) because aspect ratio
 * changes the long edge — e.g. a 2K image at 3:4 is 2400px tall, so it maxes at
 * x6, not x8. Returns [] when the image is already at/over the cap.
 */
export function computeUpscaleFactors(longestSide: number): number[] {
  if (!Number.isFinite(longestSide) || longestSide <= 0) return [];
  const maxFactor = Math.min(
    UPSCALE_MAX_FACTOR,
    Math.floor(UPSCALE_MAX_LONG_EDGE / longestSide),
  );
  if (maxFactor < UPSCALE_MIN_FACTOR) return [];
  const factors: number[] = [];
  for (let f = UPSCALE_MIN_FACTOR; f <= maxFactor; f++) factors.push(f);
  return factors;
}

/**
 * Normalize a Resolution tier to the form the estimate/run endpoints expect.
 * The backend is case-insensitive; we send lowercase to match the spec examples.
 */
export function tierForUpscale(resolution: Resolution): string {
  return resolution.toLowerCase();
}

// ─── Per-factor price estimate ──────────────────────────────────────────────

export interface UpscaleEstimateRequest {
  /** The generation's tier — the INPUT, never the output size. Drives billing. */
  resolution: Resolution;
  /** The multiplier, an integer. */
  factor: number;
}

/**
 * Backend price for a single factor. Uses the same grid as the real charge, so
 * the preview can never disagree with the bill. Returns null if the estimate
 * fails or is non-positive (caller decides how to render that).
 */
export async function estimateUpscaleCost(
  { resolution, factor }: UpscaleEstimateRequest,
): Promise<number | null> {
  try {
    const res = await authenticatedFetch(`${API_BASE}/credits/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name: 'upscale_image',
        num_variations: 1,
        pricing_context: { image_size: tierForUpscale(resolution), factor: Math.trunc(factor) },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cost = data.projected_max_hold ?? data.estimated_credits;
    return cost && cost > 0 ? cost : null;
  } catch {
    return null;
  }
}

// ─── Start upscale ──────────────────────────────────────────────────────────

export interface UpscaleStartRequest {
  /** The generation's image to enlarge. Sent as image.uri. */
  imageUri: string;
  /** Integer multiplier 2..9 the user picked. */
  factor: number;
  /** The generation's tier ('1K' | '2K' | '4K') — drives billing, NOT the output size. */
  resolution: Resolution;
  idempotency_key?: string;
}

export async function startUpscale(
  request: UpscaleStartRequest,
): Promise<PhotoshootStartResponse> {
  if (!request.imageUri || typeof request.imageUri !== 'string') {
    throw new Error('A valid image URI must be provided.');
  }

  const factor = Math.trunc(request.factor);
  if (!Number.isFinite(factor) || factor < UPSCALE_MIN_FACTOR || factor > UPSCALE_MAX_FACTOR) {
    throw new Error(
      `Upscale factor must be an integer between ${UPSCALE_MIN_FACTOR} and ${UPSCALE_MAX_FACTOR}.`,
    );
  }

  const res = await authenticatedFetch(`${API_BASE}/run/state/upscale_image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: {
        image: { uri: request.imageUri },
        factor,                                     // integer, never a string
        image_size: tierForUpscale(request.resolution),
        ...(request.idempotency_key ? { idempotency_key: request.idempotency_key } : {}),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start upscale: ${res.status} — ${text.substring(0, 200)}`);
  }

  return res.json();
}
