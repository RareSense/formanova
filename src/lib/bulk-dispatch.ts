/**
 * Bulk Studio dispatch: upload each piece once, then start one run per
 * (piece x model/scene) through the existing startPhotoshoot / startPdpShot.
 * The page registers every started run with GenerationsContext (which owns
 * polling); nothing here polls.
 *
 * Upload rules mirror useStudioGeneration:
 * - 1 angle  -> uploadToAzure (single jewelry_photo), standard tier
 * - 2-3      -> one grouped bulkUploadJewelry call, tier 'high' with
 *               jewelry_image_urls[] in Shot List order (no cover hierarchy)
 * Angles that already carry a url (Past Jewelry, or uploaded by an earlier
 * batch) are reused as-is.
 */
import {
  buildJewelryRequestFields, startPdpShot, startPhotoshoot, type JewelryRequestFields,
} from './photoshoot-api';
import { bulkUploadJewelry, uploadToAzure } from './microservices-api';
import { compressImageBlob } from './image-compression';
import type { AssigneeKind, ShotAngle } from './shot-list';
import type { PlannedShot } from './bulk-plan';

export interface UploadMeta { category: string; intended_use: 'on_model' | 'pdp' }
export interface Uploaded { url: string; assetId?: string }

export interface DispatchDeps {
  uploadSingle: (file: File, meta: UploadMeta) => Promise<Uploaded>;
  uploadGroup: (files: File[], meta: UploadMeta) => Promise<Uploaded[]>;
  startModelShot: typeof startPhotoshoot;
  startProductShot: typeof startPdpShot;
}

async function toJpeg(file: File): Promise<Blob> {
  return (await compressImageBlob(file)).blob;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export const defaultDispatchDeps: DispatchDeps = {
  uploadSingle: async (file, meta) => {
    const res = await uploadToAzure(await blobToDataUrl(await toJpeg(file)), 'image/jpeg', 'jewelry_photo', { ...meta });
    return { url: res.sas_url || res.https_url, assetId: res.asset_id ?? undefined };
  },
  uploadGroup: async (files, meta) => {
    const jpegs = await Promise.all(files.map(async (f) => new File([await toJpeg(f)], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })));
    const res = await bulkUploadJewelry(jpegs, meta);
    return res.jewelry.map((j) => ({ url: j.uri, assetId: j.asset_id }));
  },
  startModelShot: startPhotoshoot,
  startProductShot: startPdpShot,
};

export interface PieceInputs { urls: string[]; assetIds: string[] }

/** Resolve a piece's angle URLs, uploading local files. Returns new uploads for the reducer. */
export async function resolvePiece(
  angles: ShotAngle[], meta: UploadMeta, deps: DispatchDeps,
): Promise<{ inputs: PieceInputs; uploads: { angleId: string; url: string; assetId?: string }[] }> {
  const pending = angles.filter((a) => !a.url && a.file);
  const uploads: { angleId: string; url: string; assetId?: string }[] = [];
  if (pending.length === 1 && angles.length === 1) {
    const up = await deps.uploadSingle(pending[0].file!, meta);
    uploads.push({ angleId: pending[0].id, ...up });
  } else if (pending.length) {
    const ups = await deps.uploadGroup(pending.map((a) => a.file!), meta);
    if (ups.length !== pending.length) throw new Error('Upload returned an unexpected number of images');
    pending.forEach((a, i) => uploads.push({ angleId: a.id, ...ups[i] }));
  }
  const byId = new Map(uploads.map((u) => [u.angleId, u]));
  const resolved = angles.map((a) => (byId.get(a.id) ?? (a.url ? { url: a.url, assetId: a.assetId } : null)));
  if (resolved.some((r) => !r)) throw new Error('A photo of this piece is missing');
  const urls = resolved.map((r) => r!.url);
  const ids = resolved.map((r) => r!.assetId).filter((x): x is string => !!x);
  // Keep url/id arrays index-aligned: send ids only when every angle has one.
  return { inputs: { urls, assetIds: ids.length === urls.length ? ids : [] }, uploads };
}

export function jewelryFieldsFor(shot: PlannedShot, inputs: PieceInputs): JewelryRequestFields {
  if (shot.tier === 'high') {
    return {
      tier: 'high',
      jewelry_image_urls: inputs.urls,
      ...(inputs.assetIds.length ? { input_jewelry_asset_ids: inputs.assetIds } : {}),
    };
  }
  return buildJewelryRequestFields({ effort: 'low', coverUrl: inputs.urls[0], coverAssetId: inputs.assetIds[0] ?? null, supporting: [] });
}

export interface StartContext {
  kind: AssigneeKind;
  category: string;
  aspectRatio: string;
  resolution: string;
  batchId: string;
}

export async function startShot(
  shot: PlannedShot, inputs: PieceInputs, ctx: StartContext, deps: DispatchDeps,
): Promise<string> {
  const common = {
    jewelry_image_url: inputs.urls[0],
    category: ctx.category,
    idempotency_key: `bulk-${ctx.batchId}-${shot.key}`,
    aspect_ratio: ctx.aspectRatio,
    resolution: ctx.resolution,
    ...jewelryFieldsFor(shot, inputs),
  };
  const a = shot.assignee;
  const res = ctx.kind === 'scene'
    ? await deps.startProductShot({
        ...common,
        inspiration_image_url: a.imageUrl,
        ...(a.source === 'preset' ? { input_preset_inspiration_id: a.refId } : { input_inspiration_asset_id: a.refId }),
      })
    : await deps.startModelShot({
        ...common,
        model_image_url: a.imageUrl,
        ...(a.source === 'preset' ? { input_preset_model_id: a.refId } : { input_model_asset_id: a.refId }),
      });
  return res.workflow_id;
}

/** Run `fn` over items with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
