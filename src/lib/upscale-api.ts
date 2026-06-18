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

/**
 * Measured upscale runtime in SECONDS, keyed by [source tier][factor]. Used only
 * to set expectations while a job runs. Source: backend timing runs. Factors not
 * listed fall through to generic copy.
 */
const UPSCALE_ETA_SECONDS: Record<string, Record<number, number>> = {
  '1k': { 2: 12.4, 3: 9.9, 4: 108, 5: 114, 6: 114, 7: 114, 8: 114, 9: 108 },
  '2k': { 2: 31, 3: 28.2, 4: 306, 5: 306, 6: 312 },
  '4k': { 2: 102, 3: 96 },
};

/**
 * Friendly upper-bound ETA copy for the in-progress overlay, e.g. "under a
 * minute" or "up to 6 minutes". We pad the measured time by ~20% and round the
 * minutes up so the quote always sits a little ABOVE reality (never under-
 * promise). Returns null when the (tier, factor) pair is unknown.
 */
export function upscaleEtaLabel(resolution: Resolution, factor: number): string | null {
  const seconds = UPSCALE_ETA_SECONDS[tierForUpscale(resolution)]?.[Math.trunc(factor)];
  if (seconds == null) return null;
  const padded = seconds * 1.2;
  if (padded < 55) return 'under a minute';
  const minutes = Math.ceil(padded / 60);
  return `up to ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/**
 * Fallback credit price keyed by [source tier][factor]. Used when the live
 * estimate endpoint is unavailable, so the menu shows a real number instead of
 * "Unavailable". Mirrors the backend pricing grid.
 */
const UPSCALE_FALLBACK_PRICE: Record<string, Record<number, number>> = {
  '1k': { 2: 6, 3: 8, 4: 12, 5: 20, 6: 26, 7: 40, 8: 52, 9: 60 },
  '2k': { 2: 6, 3: 20, 4: 46, 5: 70, 6: 86 },
  '4k': { 2: 40, 3: 80 },
};

/** Fallback price for a (tier, factor) pair, or null if not in the grid. */
export function fallbackUpscalePrice(resolution: Resolution, factor: number): number | null {
  return UPSCALE_FALLBACK_PRICE[tierForUpscale(resolution)]?.[Math.trunc(factor)] ?? null;
}

/**
 * Highest factor the backend pricing policy allows for a source tier. The
 * policy only prices 1k up to x9, 2k up to x6, and 4k up to x3 - so we must not
 * OFFER factors above this even when the 16K physical cap would permit them
 * (e.g. a 4096px 4K image fits x4 physically but x4 is unpriced). Derived from
 * the price grid so it can never drift from what we can actually bill.
 */
export function maxUpscaleFactorForTier(resolution: Resolution): number {
  const grid = UPSCALE_FALLBACK_PRICE[tierForUpscale(resolution)];
  if (!grid) return UPSCALE_MAX_FACTOR;
  return Math.max(...Object.keys(grid).map(Number));
}

/**
 * Map an image's actual long edge to the billing tier the upscale policy prices
 * ('1K' | '2K' | '4K'), or null when it is already larger than 4K (no priced
 * tier - the caller should hide the upscale control). Uses midpoints between the
 * canonical 1024 / 2048 / 4096 long edges.
 */
export function inferResolutionTier(longestSide: number): Resolution | null {
  if (!Number.isFinite(longestSide) || longestSide <= 0) return null;
  if (longestSide <= 1536) return '1K';
  if (longestSide <= 3072) return '2K';
  if (longestSide <= 5120) return '4K';
  return null;
}

/**
 * Human-facing resolution badge derived from the ACTUAL long edge in pixels:
 * "1K", "2K", "4K", "6K", "8K", ... It rounds to the nearest 1024 so an upscaled
 * image reports its new tier automatically (e.g. x3 of a 2K image -> "6K").
 * Returns null for non-positive input so callers can hide the badge until the
 * real pixel size is known.
 */
export function resolutionTierLabel(longestSide: number): string | null {
  if (!Number.isFinite(longestSide) || longestSide <= 0) return null;
  return `${Math.max(1, Math.round(longestSide / 1024))}K`;
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
    if (!res.ok) return fallbackUpscalePrice(resolution, factor);
    const data = await res.json();
    const cost = data.projected_max_hold ?? data.estimated_credits;
    return cost && cost > 0 ? cost : fallbackUpscalePrice(resolution, factor);
  } catch {
    return fallbackUpscalePrice(resolution, factor);
  }
}

// Estimates are stable per (tier, factor) for the session, so cache successful
// lookups. Failures are NOT cached so the caller can retry (and show that one
// option as temporarily unavailable in the meantime).
const estimateCache = new Map<string, number>();

/** Session cache key for an estimate. Exported for cache-aware tests. */
export function upscaleEstimateKey(resolution: Resolution, factor: number): string {
  return `${tierForUpscale(resolution)}:${Math.trunc(factor)}`;
}

export async function estimateUpscaleCostCached(
  req: UpscaleEstimateRequest,
): Promise<number | null> {
  const key = upscaleEstimateKey(req.resolution, req.factor);
  const hit = estimateCache.get(key);
  if (hit !== undefined) return hit;
  const cost = await estimateUpscaleCost(req);
  if (cost != null) estimateCache.set(key, cost);
  return cost;
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
