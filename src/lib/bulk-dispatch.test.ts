import { describe, expect, it, vi } from 'vitest';
import { resolvePiece, runPool, startShot, type DispatchDeps } from './bulk-dispatch';
import type { PlannedShot } from './bulk-plan';
import type { ShotAngle, ShotAssignee } from './shot-list';

const file = (n: string) => new File(['x'], n, { type: 'image/jpeg' });
const local = (id: string): ShotAngle => ({ id, previewUrl: `blob:${id}`, file: file(`${id}.jpg`) });
const past = (id: string): ShotAngle => ({ id, previewUrl: `/api/artifacts/${id}`, url: `/api/artifacts/${id}`, assetId: `00000000-0000-4000-8000-00000000000${id.slice(-1)}` });
const meta = { category: 'ring', intended_use: 'on_model' as const };

function deps(): DispatchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    uploadSingle: vi.fn(async (f: File) => { calls.push(`single:${f.name}`); return { url: `sas://${f.name}`, assetId: `id-${f.name}` }; }),
    uploadGroup: vi.fn(async (fs: File[]) => { calls.push(`group:${fs.map((f) => f.name).join(',')}`); return fs.map((f) => ({ url: `azure://${f.name}`, assetId: `id-${f.name}` })); }),
    startModelShot: vi.fn(async () => ({ workflow_id: 'wf-m', status_url: '', result_url: '' })),
    startProductShot: vi.fn(async () => ({ workflow_id: 'wf-p', status_url: '', result_url: '' })),
  };
}

const shot = (angles: ShotAngle[], assignee: ShotAssignee, tier: 'low' | 'high'): PlannedShot =>
  ({ key: `r1::${assignee.id}`, rowId: 'r1', pieceNumber: 1, angles, assignee, tier });
const preset: ShotAssignee = { id: 'preset:p1', kind: 'model', name: 'P1', imageUrl: '/api/artifacts/p1', source: 'preset', refId: 'p1' };
const mine: ShotAssignee = { id: 'asset:a9', kind: 'scene', name: 'Mine', imageUrl: '/api/artifacts/a9', source: 'user', refId: 'a9' };
const ctx = { kind: 'model' as const, category: 'ring', aspectRatio: '3:4', resolution: '2K', batchId: 'b1' };

describe('resolvePiece', () => {
  it('uploads a single-angle piece with the single upload', async () => {
    const d = deps();
    const { inputs, uploads } = await resolvePiece([local('a1')], meta, d);
    expect(d.calls).toEqual(['single:a1.jpg']);
    expect(inputs.urls).toEqual(['sas://a1.jpg']);
    expect(uploads).toEqual([{ angleId: 'a1', url: 'sas://a1.jpg', assetId: 'id-a1.jpg' }]);
  });

  it('uploads new angles of a multi-angle piece in one grouped call and keeps list order', async () => {
    const d = deps();
    const { inputs } = await resolvePiece([local('a1'), past('p2'), local('a3')], meta, d);
    expect(d.calls).toEqual(['group:a1.jpg,a3.jpg']);
    expect(inputs.urls).toEqual(['azure://a1.jpg', '/api/artifacts/p2', 'azure://a3.jpg']);
    expect(inputs.assetIds).toHaveLength(3);
  });

  it('reuses already uploaded angles without uploading again', async () => {
    const d = deps();
    const { inputs, uploads } = await resolvePiece([past('p1'), past('p2')], meta, d);
    expect(d.calls).toEqual([]);
    expect(uploads).toEqual([]);
    expect(inputs.urls).toEqual(['/api/artifacts/p1', '/api/artifacts/p2']);
  });

  it('drops asset ids when any angle lacks one, so arrays stay aligned', async () => {
    const d = deps();
    const noId: ShotAngle = { id: 'x', previewUrl: 'u', url: 'u' };
    const { inputs } = await resolvePiece([past('p1'), noId], meta, d);
    expect(inputs.assetIds).toEqual([]);
  });
});

describe('startShot', () => {
  it('standard on-model shot: single jewelry url, preset model id, idempotent key', async () => {
    const d = deps();
    await startShot(shot([past('p1')], preset, 'low'), { urls: ['u1'], assetIds: ['00000000-0000-4000-8000-000000000001'] }, ctx, d);
    expect(d.startModelShot).toHaveBeenCalledWith(expect.objectContaining({
      jewelry_image_url: 'u1', model_image_url: '/api/artifacts/p1', input_preset_model_id: 'p1',
      input_jewelry_asset_id: '00000000-0000-4000-8000-000000000001',
      idempotency_key: 'bulk-b1-r1::preset:p1', aspect_ratio: '3:4', resolution: '2K', category: 'ring',
    }));
    const req = vi.mocked(d.startModelShot).mock.calls[0][0];
    expect(req.tier).toBeUndefined();
    expect(req.jewelry_image_urls).toBeUndefined();
  });

  it('high precision product shot: all angles, tier high, user scene asset id', async () => {
    const d = deps();
    await startShot(shot([past('p1'), past('p2')], mine, 'high'), { urls: ['u1', 'u2'], assetIds: ['i1', 'i2'] }, { ...ctx, kind: 'scene' }, d);
    expect(d.startProductShot).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'high', jewelry_image_urls: ['u1', 'u2'], input_jewelry_asset_ids: ['i1', 'i2'],
      inspiration_image_url: '/api/artifacts/a9', input_inspiration_asset_id: 'a9',
    }));
    expect(d.startModelShot).not.toHaveBeenCalled();
  });
});

describe('runPool', () => {
  it('never exceeds the limit and runs everything', async () => {
    let live = 0; let peak = 0; const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      live += 1; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n); live -= 1;
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
