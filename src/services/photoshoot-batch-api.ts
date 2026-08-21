import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  startPhotoshoot,
  startPdpShot,
  type PhotoshootResultResponse,
  type PhotoshootStartResponse,
  type PhotoshootStatusResponse,
} from '@/lib/photoshoot-api';
/**
 * Declared here because StudioPairingStep, which used to export it, no longer
 * exists. The shape below is exactly what this file reads from an assignment.
 */
export interface AssetModelAssignment {
  url: string;
  /** Display name for the chosen model. Carried by callers, not sent upstream. */
  label?: string;
  modelAssetId?: string | null;
  presetModelId?: string | null;
}

export interface PhotoshootBatchAsset {
  thumbnailUrl: string;
  assetId: string;
}

export interface PhotoshootBatchJob {
  asset: PhotoshootBatchAsset;
  assignment: AssetModelAssignment;
  isProductShot: boolean;
  category: string;
}

export const STATUS_ENDPOINT = (workflowId: string) => `/api/status/${workflowId}`;
export const RESULT_ENDPOINT = (workflowId: string) => `/api/result/${workflowId}`;
const TRANSIENT_POLL_STATUSES = new Set([404, 502, 503, 504]);

function buildIdempotencyKey(assetId: string) {
  return `${Date.now()}-bulk-${assetId}`;
}

export async function submitPhotoshootBatchJob(
  job: PhotoshootBatchJob,
): Promise<PhotoshootStartResponse> {
  const { asset, assignment, isProductShot, category } = job;
  const idempotencyKey = buildIdempotencyKey(asset.assetId);

  if (isProductShot) {
    return startPdpShot({
      jewelry_image_url: asset.thumbnailUrl,
      inspiration_image_url: assignment.url,
      category,
      idempotency_key: idempotencyKey,
      input_jewelry_asset_id: asset.assetId,
      ...(assignment.presetModelId
        ? { input_preset_inspiration_id: assignment.presetModelId }
        : assignment.modelAssetId
        ? { input_inspiration_asset_id: assignment.modelAssetId }
        : {}),
    });
  }

  return startPhotoshoot({
    jewelry_image_url: asset.thumbnailUrl,
    model_image_url: assignment.url,
    category,
    idempotency_key: idempotencyKey,
    input_jewelry_asset_id: asset.assetId,
    ...(assignment.modelAssetId ? { input_model_asset_id: assignment.modelAssetId } : {}),
    ...(assignment.presetModelId && !assignment.modelAssetId
      ? { input_preset_model_id: assignment.presetModelId }
      : {}),
  });
}

export async function submitPhotoshootBatchJobs(jobs: PhotoshootBatchJob[]) {
  return Promise.allSettled(
    jobs.map(async (job) => ({
      job,
      response: await submitPhotoshootBatchJob(job),
    })),
  );
}

export async function fetchPhotoshootBatchStatus(
  workflowId: string,
): Promise<PhotoshootStatusResponse | null> {
  const res = await authenticatedFetch(STATUS_ENDPOINT(workflowId));
  if (!res.ok) {
    if (TRANSIENT_POLL_STATUSES.has(res.status)) return null;
    throw new Error(`Unrecoverable status poll error ${res.status} for workflow ${workflowId}`);
  }
  return res.json();
}

export async function fetchPhotoshootBatchResult(
  workflowId: string,
): Promise<PhotoshootResultResponse | null> {
  const res = await authenticatedFetch(RESULT_ENDPOINT(workflowId));
  if (!res.ok) {
    if (TRANSIENT_POLL_STATUSES.has(res.status)) return null;
    throw new Error(`Unrecoverable result poll error ${res.status} for workflow ${workflowId}`);
  }
  return res.json();
}
