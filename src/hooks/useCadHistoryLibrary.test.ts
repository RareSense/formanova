import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListMyWorkflows = vi.hoisted(() => vi.fn());
vi.mock('@/lib/generation-history-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/generation-history-api')>('@/lib/generation-history-api');
  return { ...actual, listMyWorkflows: mockListMyWorkflows };
});

import { useCadHistoryLibrary } from './useCadHistoryLibrary';
import type { WorkflowSummary } from '@/lib/generation-history-api';

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

beforeEach(() => {
  mockListMyWorkflows.mockReset();
});

describe('useCadHistoryLibrary', () => {
  it('reports no history when there are zero matching, prompt-bearing text_to_cad runs', async () => {
    mockListMyWorkflows.mockResolvedValue([
      wf({ workflow_id: 'a', source_type: 'text_to_cad', prompt: null }),
      wf({ workflow_id: 'b', source_type: 'image_to_cad', prompt: 'ignored, wrong source type' }),
    ]);

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasHistory).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it('sorts prompt history newest first and filters by search text', async () => {
    mockListMyWorkflows.mockResolvedValue([
      wf({ workflow_id: 'old', created_at: '2026-08-01T00:00:00Z', prompt: 'Twisted vine ring' }),
      wf({ workflow_id: 'new', created_at: '2026-08-15T00:00:00Z', prompt: 'Halo diamond ring' }),
    ]);

    const { result } = renderHook(() => useCadHistoryLibrary('text_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasHistory).toBe(true);
    expect(result.current.items.map((i) => i.workflowId)).toEqual(['new', 'old']);

    act(() => result.current.setSearch('twisted'));
    expect(result.current.items.map((i) => i.workflowId)).toEqual(['old']);
  });

  it('is not searchable for image_to_cad and ignores incomplete/imageless runs', async () => {
    mockListMyWorkflows.mockResolvedValue([
      wf({ workflow_id: 'running', status: 'running', source_type: 'image_to_cad', reference_image_urls: ['/api/artifacts/a'] }),
      wf({ workflow_id: 'no-images', status: 'completed', source_type: 'image_to_cad', reference_image_urls: [] }),
      wf({ workflow_id: 'good', status: 'completed', source_type: 'image_to_cad', reference_image_urls: ['/api/artifacts/b'] }),
    ]);

    const { result } = renderHook(() => useCadHistoryLibrary('image_to_cad'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSearchable).toBe(false);
    expect(result.current.items.map((i) => i.workflowId)).toEqual(['good']);
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
