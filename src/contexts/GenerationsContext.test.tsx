import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GenerationsContextProvider, GenerationsContext, useGenerations, type TrackedGeneration } from './GenerationsContext';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/poll-workflow', () => ({ pollWorkflow: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/contexts/CreditsContext', () => ({ useCredits: () => ({ refreshCredits: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/generation-lifecycle', () => ({
  markGenerationCompleted: vi.fn(),
  markGenerationFailed: vi.fn(),
}));
vi.mock('@/lib/azure-utils', () => ({ azureUriToUrl: (v: string) => v.replace('azure://', 'https://cdn.example.com/') }));
vi.mock('@/lib/generation-history-api', () => ({ getWorkflowDetails: vi.fn() }));
vi.mock('@/lib/generation-enrichment', () => ({
  extractPhotoThumbnail: vi.fn(),
  extractProductShotThumbnail: vi.fn(),
}));

import { pollWorkflow } from '@/lib/poll-workflow';
import { markGenerationCompleted, markGenerationFailed } from '@/lib/generation-lifecycle';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import { extractPhotoThumbnail, extractProductShotThumbnail } from '@/lib/generation-enrichment';

const mockPollWorkflow = vi.mocked(pollWorkflow);
const mockMarkCompleted = vi.mocked(markGenerationCompleted);
const mockMarkFailed = vi.mocked(markGenerationFailed);
const mockGetWorkflowDetails = vi.mocked(getWorkflowDetails);
const mockExtractPhotoThumbnail = vi.mocked(extractPhotoThumbnail);
const mockExtractProductShotThumbnail = vi.mocked(extractProductShotThumbnail);

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter><GenerationsContextProvider>{children}</GenerationsContextProvider></MemoryRouter>;
}

describe('GenerationsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: never resolves (long-running generation)
    mockPollWorkflow.mockReturnValue(new Promise(() => {}));
    mockGetWorkflowDetails.mockResolvedValue({ summary: { id: 'wf', name: '', status: 'completed', created_at: '', finished_at: null }, steps: [] });
    mockExtractPhotoThumbnail.mockReturnValue(null);
    mockExtractProductShotThumbnail.mockReturnValue(null);
  });

  it('starts with empty generations array', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    expect(result.current.generations).toEqual([]);
  });

  it('appends a running generation when trackGeneration is called', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({
        workflowId: 'wf-1',
        isProductShot: false,
        jewelryType: 'ring',
        jewelryUrl: 'https://example.com/jewelry.jpg',
        modelUrl: 'https://example.com/model.jpg',
        aspectRatio: '3:4',
        resolution: '1K',
        generationCost: 10,
      });
    });
    expect(result.current.generations).toHaveLength(1);
    expect(result.current.generations[0]).toMatchObject({ workflowId: 'wf-1', status: 'running' });
  });

  it('starts pollWorkflow when a generation is tracked', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({
        workflowId: 'wf-2',
        isProductShot: false,
        jewelryType: 'necklace',
        jewelryUrl: 'https://example.com/jewelry.jpg',
        modelUrl: 'https://example.com/model.jpg',
        aspectRatio: '3:4',
        resolution: '1K',
        generationCost: 10,
      });
    });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalledOnce());
    expect(mockPollWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'status-then-result',
      intervalMs: 3000,
      timeoutMs: 720_000,
      maxPollErrors: 1,
      maxResultRetries: 100,
      resultRetryDelayMs: 3000,
    }));
  });

  it('allows concurrent generations (unbounded queue)', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-a', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry-a.jpg', modelUrl: 'https://example.com/model-a.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
      result.current.trackGeneration({ workflowId: 'wf-b', isProductShot: true, jewelryType: 'necklace', jewelryUrl: 'https://example.com/jewelry-b.jpg', modelUrl: 'https://example.com/model-b.jpg', aspectRatio: '1:1', resolution: '2K', generationCost: 20 });
    });
    expect(result.current.generations).toHaveLength(2);
  });

  it('transitions to completed and populates resultImages when poll resolves', async () => {
    const resultData = { output: [{ output_url: 'https://example.com/image.jpg' }] };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-3', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-3');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toContain('https://example.com/image.jpg');
    });
    expect(mockMarkCompleted).toHaveBeenCalledWith('wf-3', expect.any(Number));
  });

  it('populates outputAssetId from the top-level /result scalar on completion', async () => {
    const resultData = {
      output_asset_id: 'a1b2c3d4-0000-1111-2222-333344445555',
      output: [{ output_url: 'https://example.com/image.jpg' }],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-asset', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-asset');
      expect(gen?.status).toBe('completed');
      expect(gen?.outputAssetId).toBe('a1b2c3d4-0000-1111-2222-333344445555');
    });
  });

  it('sets outputAssetId to null when the /result payload omits it (old items)', async () => {
    const resultData = { output: [{ output_url: 'https://example.com/image.jpg' }] };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-noasset', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-noasset');
      expect(gen?.status).toBe('completed');
      expect(gen?.outputAssetId).toBeNull();
    });
  });

  it('dedupes identical result image urls before rendering', async () => {
    const resultData = {
      output: [
        { output_url: 'https://example.com/image.jpg' },
        { result_url: 'https://example.com/image.jpg' },
      ],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-dup', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-dup');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://example.com/image.jpg']);
    });
  });

  it('renders only one final image even when the payload contains multiple image entries', async () => {
    const resultData = {
      output: [
        { output_url: 'https://example.com/first.jpg' },
        { output_url: 'https://example.com/second.jpg' },
      ],
      extra: [
        { image_url: 'https://example.com/third.jpg' },
      ],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-one-only', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-one-only');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://example.com/first.jpg']);
    });
  });

  it('treats a nested output image object as a successful result', async () => {
    const resultData = {
      output: [
        {
          output_image: {
            uri: 'azure://container/path/nested.png',
          },
        },
      ],
      generate: [
        { action: 'error' },
      ],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-nested', isProductShot: true, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '1:1', resolution: '2K', generationCost: 20 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-nested');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://cdn.example.com/container/path/nested.png']);
    });
  });

  it('keeps scanning later keys when earlier arrays have no direct image fields', async () => {
    const resultData = {
      generate: [
        { status: 'ok', detail: 'finished without direct output_url' },
      ],
      result: [
        {
          nested: {
            image_b64: 'abc123',
            mime_type: 'image/png',
          },
        },
      ],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-late-key', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '4K', generationCost: 25 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-late-key');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['data:image/png;base64,abc123']);
    });
  });

  it('transitions to failed when poll rejects', async () => {
    mockPollWorkflow.mockRejectedValueOnce(new Error('timeout'));

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-4', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-4');
      expect(gen?.status).toBe('failed');
    });
    expect(mockMarkFailed).toHaveBeenCalledWith('wf-4', expect.any(String), expect.any(Number));
  });

  it('uses history details fallback when /api/result payload says failed but a final image exists in workflow details', async () => {
    const resultData = {
      generate_image: [{ action: 'error', error: 'Activity task failed', status: 'failed' }],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });
    mockExtractPhotoThumbnail.mockReturnValueOnce('https://example.com/history-image.jpg');

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-history-fallback', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '4K', generationCost: 25 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-history-fallback');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://example.com/history-image.jpg']);
    });
    expect(mockGetWorkflowDetails).toHaveBeenCalledWith('wf-history-fallback');
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it('uses history details fallback when result fetch exhausts but workflow details already contain the final image', async () => {
    mockPollWorkflow.mockRejectedValueOnce(new Error('Result fetch exhausted all retries'));
    mockExtractProductShotThumbnail.mockReturnValueOnce('https://example.com/product-history-image.jpg');

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-history-reject', isProductShot: true, jewelryType: 'necklace', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '1:1', resolution: '4K', generationCost: 25 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-history-reject');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://example.com/product-history-image.jpg']);
    });
    expect(mockGetWorkflowDetails).toHaveBeenCalledWith('wf-history-reject');
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it('removes generation and aborts poll when clearGeneration is called', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-5', isProductShot: false, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '3:4', resolution: '1K', generationCost: 10 });
    });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalledOnce());

    act(() => {
      result.current.clearGeneration('wf-5');
    });
    expect(result.current.generations.find(g => g.workflowId === 'wf-5')).toBeUndefined();
    // Verify AbortController was triggered by checking poll was called with a signal
    const callArgs = mockPollWorkflow.mock.calls[0][0];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    expect(callArgs.signal.aborted).toBe(true);
  });

  it('polls /api/status|result/{workflowId} by workflowId', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({
        workflowId: 'wf-6',
        isProductShot: false,
        jewelryType: 'ring',
        jewelryUrl: 'https://example.com/jewelry.jpg',
        modelUrl: 'https://example.com/model.jpg',
        aspectRatio: '3:4',
        resolution: '1K',
        generationCost: 10,
      });
    });

    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalledOnce());
    const callArgs = mockPollWorkflow.mock.calls[0][0];
    await callArgs.fetchStatus?.();
    await callArgs.fetchResult();

    const { authenticatedFetch } = await import('@/lib/authenticated-fetch');
    const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(1, '/api/status/wf-6');
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(2, '/api/result/wf-6');
  });
});
