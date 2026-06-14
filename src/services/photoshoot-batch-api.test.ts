import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedFetch = vi.fn();
const startPhotoshoot = vi.fn();
const startPdpShot = vi.fn();

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
}));

vi.mock('@/lib/photoshoot-api', () => ({
  startPhotoshoot: (...args: unknown[]) => startPhotoshoot(...args),
  startPdpShot: (...args: unknown[]) => startPdpShot(...args),
}));

import {
  fetchPhotoshootBatchResult,
  fetchPhotoshootBatchStatus,
  submitPhotoshootBatchJob,
} from './photoshoot-batch-api';

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as Response;
}

describe('photoshoot-batch-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits model-shot jobs through startPhotoshoot', async () => {
    startPhotoshoot.mockResolvedValue({ workflow_id: 'wf-1' });

    await submitPhotoshootBatchJob({
      asset: { thumbnailUrl: 'jewelry', assetId: 'asset-1' },
      assignment: { url: 'model', label: 'Model A', presetModelId: 'preset-1' },
      isProductShot: false,
      category: 'ring',
    });

    expect(startPhotoshoot).toHaveBeenCalledWith(expect.objectContaining({
      jewelry_image_url: 'jewelry',
      model_image_url: 'model',
      input_preset_model_id: 'preset-1',
    }));
  });

  it('submits product-shot jobs through startPdpShot', async () => {
    startPdpShot.mockResolvedValue({ workflow_id: 'wf-2' });

    await submitPhotoshootBatchJob({
      asset: { thumbnailUrl: 'jewelry', assetId: 'asset-2' },
      assignment: { url: 'inspo', label: 'Inspo', modelAssetId: 'model-2' },
      isProductShot: true,
      category: 'necklace',
    });

    expect(startPdpShot).toHaveBeenCalledWith(expect.objectContaining({
      jewelry_image_url: 'jewelry',
      inspiration_image_url: 'inspo',
      input_inspiration_asset_id: 'model-2',
    }));
  });

  it('treats transient poll statuses as retryable nulls', async () => {
    authenticatedFetch.mockResolvedValueOnce(errorResponse(404));
    authenticatedFetch.mockResolvedValueOnce(errorResponse(503));

    await expect(fetchPhotoshootBatchStatus('wf-3')).resolves.toBeNull();
    await expect(fetchPhotoshootBatchResult('wf-3')).resolves.toBeNull();
  });

  it('throws on unrecoverable poll errors', async () => {
    authenticatedFetch.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchPhotoshootBatchStatus('wf-4')).rejects.toThrow('Unrecoverable status poll error 500');
  });

  it('returns parsed status and result payloads on success', async () => {
    authenticatedFetch
      .mockResolvedValueOnce(okResponse({ progress: { completed_nodes: 1 } }))
      .mockResolvedValueOnce(okResponse({ output: [{ output_url: 'https://example.com/image.jpg' }] }));

    await expect(fetchPhotoshootBatchStatus('wf-5')).resolves.toEqual({ progress: { completed_nodes: 1 } });
    await expect(fetchPhotoshootBatchResult('wf-5')).resolves.toEqual({
      output: [{ output_url: 'https://example.com/image.jpg' }],
    });
  });
});
