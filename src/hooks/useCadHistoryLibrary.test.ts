import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListMyWorkflows = vi.hoisted(() => vi.fn());
vi.mock('@/lib/generation-history-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/generation-history-api')>('@/lib/generation-history-api');
  return { ...actual, listMyWorkflows: mockListMyWorkflows };
});

const mockFetchUserAssets = vi.hoisted(() => vi.fn());
vi.mock('@/lib/assets-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/assets-api')>('@/lib/assets-api');
  return { ...actual, fetchUserAssets: mockFetchUserAssets };
});

import { useCadHistoryLibrary } from './useCadHistoryLibrary';
import type { WorkflowSummary } from '@/lib/generation-history-api';
import type { UserAsset } from '@/lib/assets-api';

function wf(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    workflow_id: 'wf-1',
    name: 'ring_cad_nurbs_v1',
    status: 'completed',
    created_at: '2026-08-10T00:00:00Z',
    finished_at: null,
    source_type: 'text_to_cad',
    ...overrides,
  };
}

function asset(overrides: Partial<UserAsset> & { id: string }): UserAsset {
  return {
    asset_type: 'cad_reference',
    created_at: '2026-08-10T00:00:00Z',
    thumbnail_url: `/api/artifacts/${overrides.id}`,
    name: null,
    ...overrides,
  } as UserAsset;
}

function assetPage(items: UserAsset[], total = items.length) {
  return { items, total, page: 0, page_size: 10 };
}

beforeEach(() => {
  mockListMyWorkflows.mockReset();
  mockFetchUserAssets.mockReset();
  mockFetchUserAssets.mockResolvedValue(assetPage([]));
});

describe('useCadHistoryLibrary — prompts (text_to_cad)', () => {
  it('reports no history when there are zero matching, prompt-bearing runs', async () => {
    mockListMyWorkflows.mockResolvedValue([
      wf({ workflow_id: 'a', source_type: 'text_to_cad', prompt: null }),
      wf({ workflow_id: 'b', source_type: 'image_to_cad', prompt: 'ignored, wrong source type' }),
    ]);

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasHistory).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it('sorts newest first and filters in memory by search text', async () => {
    mockListMyWorkflows.mockResolvedValue([
      wf({ workflow_id: 'old', created_at: '2026-08-01T00:00:00Z', prompt: 'Twisted vine ring' }),
      wf({ workflow_id: 'new', created_at: '2026-08-15T00:00:00Z', prompt: 'Halo diamond ring' }),
    ]);

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((i) => i.id)).toEqual(['new', 'old']);

    act(() => result.current.setSearch('twisted'));
    expect(result.current.items.map((i) => i.id)).toEqual(['old']);
    // Prompts never hit the asset vault.
    expect(mockFetchUserAssets).not.toHaveBeenCalled();
  });

  it('paginates in pages of 10', async () => {
    mockListMyWorkflows.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => wf({ workflow_id: `wf-${i}`, prompt: `Prompt ${i}`, created_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z` })),
    );

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalCount).toBe(15);
    expect(result.current.items).toHaveLength(10);
    expect(result.current.totalPages).toBe(2);

    act(() => result.current.setPage(1));
    expect(result.current.items).toHaveLength(5);
  });

  it('surfaces a fetch failure as an error with an empty, non-loading result', async () => {
    mockListMyWorkflows.mockRejectedValue(new Error('Failed to list workflows: 500'));

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to list workflows: 500');
    expect(result.current.hasHistory).toBe(false);
  });
});

describe('useCadHistoryLibrary — images (image_to_cad)', () => {
  it('reads the cad_reference vault, not generation history', async () => {
    mockFetchUserAssets.mockResolvedValue(assetPage([
      asset({ id: 'asset-a', name: 'Signet band', set_ids: ['set-1'] }),
      asset({ id: 'asset-b', set_ids: ['set-1'] }),
    ]));

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchUserAssets).toHaveBeenCalledWith(
      'cad_reference', 0, 10, undefined, undefined, undefined, undefined,
    );
    expect(mockListMyWorkflows).not.toHaveBeenCalled();

    // Grouped into one entry per set, like Photo Studio's vault cards.
    expect(result.current.items.map((i) => i.id)).toEqual(['set-1']);
    const [entry] = result.current.items;
    expect(entry.referenceImageUrls).toEqual(['/api/artifacts/asset-a', '/api/artifacts/asset-b']);
    expect(entry.assetIds).toEqual(['asset-a', 'asset-b']);
    // Rename targets the cover, and the cover carries the displayed name.
    expect(entry.assetId).toBe('asset-a');
    expect(entry.name).toBe('Signet band');
  });

  it('is searchable, and sends the term to the server rather than filtering locally', async () => {
    mockFetchUserAssets.mockResolvedValue(assetPage([asset({ id: 'asset-a' })]));

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSearchable).toBe(true);

    act(() => result.current.setSearch('signet'));

    await waitFor(() => expect(mockFetchUserAssets).toHaveBeenLastCalledWith(
      'cad_reference', 0, 10, undefined, undefined, undefined, 'signet',
    ));
  });

  it('keeps the panel mounted while a search returns nothing, so the box stays usable', async () => {
    mockFetchUserAssets.mockResolvedValue(assetPage([]));

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // No assets and no search term: genuinely empty, caller shows the examples.
    expect(result.current.hasHistory).toBe(false);

    act(() => result.current.setSearch('nothing matches this'));
    await waitFor(() => expect(result.current.hasHistory).toBe(true));
  });

  it('pages on the server, using the reported total rather than the page length', async () => {
    mockFetchUserAssets.mockResolvedValue(assetPage([asset({ id: 'a' })], 25));

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalCount).toBe(25);
    expect(result.current.totalPages).toBe(3);

    act(() => result.current.setPage(2));
    await waitFor(() => expect(mockFetchUserAssets).toHaveBeenLastCalledWith(
      'cad_reference', 2, 10, undefined, undefined, undefined, undefined,
    ));
  });

  it('surfaces a vault fetch failure', async () => {
    mockFetchUserAssets.mockRejectedValue(new Error('HTTP 404'));

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('HTTP 404');
    expect(result.current.hasHistory).toBe(false);
  });
});
