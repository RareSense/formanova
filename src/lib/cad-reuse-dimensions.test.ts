import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.hoisted(() => vi.fn());
vi.mock('@/lib/generation-history-api', () => ({ listMyWorkflows: mockList }));

import { findReusedDimensions } from './cad-reuse-dimensions';

const run = (over: Record<string, unknown>) => ({
  workflow_id: 'w', name: 'ring_cad_nurbs_v1', status: 'completed', created_at: '2026-10-01T00:00:00Z',
  source_type: 'image_to_cad', client_flow: 'image', prompt: 'US 7', reference_image_keys: [], ...over,
});

beforeEach(() => mockList.mockReset());

describe('findReusedDimensions', () => {
  it('finds the run that used the image, by asset id or by content hash', async () => {
    mockList.mockResolvedValue([run({ prompt: 'US 7, band 2 mm', reference_image_keys: ['asset-a'] })]);
    expect(await findReusedDimensions({ assetIds: ['asset-a'] })).toBe('US 7, band 2 mm');
    mockList.mockResolvedValue([run({ prompt: 'US 6', reference_image_keys: ['f'.repeat(64)] })]);
    expect(await findReusedDimensions({ assetIds: ['other'], sha256s: ['f'.repeat(64)] })).toBe('US 6');
  });

  it('takes the newest matching run', async () => {
    mockList.mockResolvedValue([
      run({ prompt: 'old', created_at: '2026-09-01T00:00:00Z', reference_image_keys: ['a'] }),
      run({ prompt: 'new', created_at: '2026-10-02T00:00:00Z', reference_image_keys: ['a'] }),
    ]);
    expect(await findReusedDimensions({ assetIds: ['a'] })).toBe('new');
  });

  it('only reads CAD from Image runs that finished with dimensions', async () => {
    mockList.mockResolvedValue([
      run({ prompt: 'inspiration words', client_flow: 'inspiration', reference_image_keys: ['a'] }),
      run({ prompt: 'failed', status: 'failed', reference_image_keys: ['a'] }),
      run({ prompt: null, reference_image_keys: ['a'] }),
    ]);
    expect(await findReusedDimensions({ assetIds: ['a'] })).toBeNull();
  });

  it('runs from before client_flow count as CAD from Image', async () => {
    mockList.mockResolvedValue([run({ prompt: 'US 8', client_flow: null, reference_image_keys: ['a'] })]);
    expect(await findReusedDimensions({ assetIds: ['a'] })).toBe('US 8');
  });

  it('returns null when no run used the image, and asks nothing with no keys', async () => {
    mockList.mockResolvedValue([run({ reference_image_keys: ['x'] })]);
    expect(await findReusedDimensions({ assetIds: ['a'] })).toBeNull();
    mockList.mockClear();
    expect(await findReusedDimensions({ assetIds: [] })).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });
});
