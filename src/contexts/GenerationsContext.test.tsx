import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GenerationsContextProvider, GenerationsContext, useGenerations, buildCadRestorePath, type TrackedGeneration } from './GenerationsContext';
import { resolveRestoreEntry } from '@/lib/cad-analytics';

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
vi.mock('@/lib/posthog-events', () => ({ trackCadGenerationCompleted: vi.fn() }));
vi.mock('@/lib/generation-enrichment', () => ({
  extractPhotoThumbnail: vi.fn(),
  extractProductShotThumbnail: vi.fn(),
}));

import { pollWorkflow } from '@/lib/poll-workflow';
import { markGenerationCompleted, markGenerationFailed } from '@/lib/generation-lifecycle';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import { extractPhotoThumbnail, extractProductShotThumbnail } from '@/lib/generation-enrichment';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { trackCadGenerationCompleted } from '@/lib/posthog-events';

const mockTrackCadCompleted = vi.mocked(trackCadGenerationCompleted);
const mockPollWorkflow = vi.mocked(pollWorkflow);
const mockMarkCompleted = vi.mocked(markGenerationCompleted);
const mockMarkFailed = vi.mocked(markGenerationFailed);
const mockGetWorkflowDetails = vi.mocked(getWorkflowDetails);
const mockExtractPhotoThumbnail = vi.mocked(extractPhotoThumbnail);
const mockExtractProductShotThumbnail = vi.mocked(extractProductShotThumbnail);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter><GenerationsContextProvider>{children}</GenerationsContextProvider></MemoryRouter>;
}

describe('buildCadRestorePath', () => {
  // Attribution for CAD restores works by inversion: we mark every link we
  // generate, so an unmarked arrival is external (overwhelmingly the completion
  // email). These tests are the guard on that inference -- if the marker ever
  // stops being written, email arrivals silently vanish into the internal
  // buckets and nobody notices until the funnel is queried.
  const paramsOf = (path: string) => new URLSearchParams(path.split('?')[1]);

  it('writes the src marker for every internal entry point', () => {
    for (const src of ['history', 'toast', 'header'] as const) {
      expect(paramsOf(buildCadRestorePath('wf-1', null, '/text-to-cad', src)).get('src')).toBe(src);
    }
  });

  it('keeps the existing workflow_id and glb parameters intact', () => {
    const params = paramsOf(buildCadRestorePath('wf-1', 'https://blob/x.glb', '/image-to-cad', 'history'));
    expect(params.get('workflow_id')).toBe('wf-1');
    expect(params.get('glb')).toBe('https://blob/x.glb');
  });

  it('omits glb when there is none, and still marks the link', () => {
    const params = paramsOf(buildCadRestorePath('wf-1', null, '/image-to-cad', 'toast'));
    expect(params.has('glb')).toBe(false);
    expect(params.get('src')).toBe('toast');
  });

  it('routes to the page the run was started from', () => {
    expect(buildCadRestorePath('wf-1', null, '/text-to-cad', 'header')).toContain('/text-to-cad?');
    expect(buildCadRestorePath('wf-1', null, '/image-to-cad', 'header')).toContain('/image-to-cad?');
  });

  it('produces a path resolveRestoreEntry reads back as the same entry', () => {
    // The two halves are written in different files; this asserts they agree.
    const path = buildCadRestorePath('wf-1', null, '/text-to-cad', 'history');
    expect(resolveRestoreEntry(paramsOf(path))).toBe('history');
  });
});

describe('GenerationsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it('prefers the generate step output over an input image CAS ref from an earlier prepare step', async () => {
    // Regression for the prepare->generate CAS handoff change: prepare steps now emit
    // input images as {uri: "azure://..."} too, which must not be picked up as the result.
    const resultData = {
      analyze_jewelry_pdp: [{ description: 'a gold ring' }],
      prepare_jewelry_request_pdp_higher_tier: [
        { jewelry_images: [{ uri: 'azure://container/input/jewelry1.jpg', sha256: 'abc' }] },
      ],
      generate_jewelry_image_pdp_higher_tier: [
        { output_url: 'azure://container/output/real-result.jpg' },
      ],
    };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-cas-input-leak', isProductShot: true, jewelryType: 'ring', jewelryUrl: 'https://example.com/jewelry.jpg', modelUrl: 'https://example.com/model.jpg', aspectRatio: '1:1', resolution: '1K', generationCost: 8 });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-cas-input-leak');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://cdn.example.com/container/output/real-result.jpg']);
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

describe('GenerationsContext - Image to 3D runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPollWorkflow.mockReturnValue(new Promise(() => {}));
  });

  const CAD_RESULT = {
    ok: true,
    status: 'completed',
    validation_status: 'applied',
    threedm_artifact: { uri: 'azure://a/r.3dm', url: 'https://s/r.3dm', type: '', bytes: 1, sha256: '' },
    glb_artifact: { uri: 'azure://a/r.glb', url: 'https://s/r.glb', type: '', bytes: 1, sha256: '' },
  };

  it('tracks a cad run tagged with kind so it never mixes with photoshoots', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-1' }); });

    expect(result.current.generations).toHaveLength(1);
    expect(result.current.generations[0].kind).toBe('cad');
    expect(result.current.generations[0].status).toBe('running');
    // Photoshoot-shaped fields carry inert defaults, never bogus values.
    expect(result.current.generations[0].resultImages).toEqual([]);
  });

  it('defaults the cad poll ceiling to the 90 minute spec limit', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-1' }); });
    expect(result.current.generations[0].timeoutMs).toBe(90 * 60 * 1000);
  });

  it('stores the glb and 3dm urls on completion', async () => {
    mockPollWorkflow.mockResolvedValue({ status: 'completed', result: CAD_RESULT } as never);
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-1' }); });

    await waitFor(() => expect(result.current.generations[0].status).toBe('completed'));
    expect(result.current.generations[0].glbUrl).toBe('https://s/r.glb');
    expect(result.current.generations[0].threedmUrl).toBe('https://s/r.3dm');
    expect(mockMarkCompleted).toHaveBeenCalledWith('cad-1', expect.any(Number));
  });

  // ── cad_generation_completed lives here, not on the CAD page ─────────────
  //
  // It used to be emitted from useImageToCADWorkflow's effect, which bails out
  // on hasNavigatedAway and does not run at all once the page unmounts. Any run
  // finishing after the user pressed Keep Creating, navigated away or closed
  // the tab was therefore never counted. These tests are the guard on the fix:
  // if the emit ever moves back to a page, they fail.

  const CAD_ANALYTICS = {
    source: 'image-to-cad' as const,
    category: 'ring' as const,
    prompt_length: 42,
    reference_image_count: 3,
    llm_tier: 'fable-5',
    is_first_ever: true,
  };

  it('emits cad_generation_completed when the run settles with no CAD page mounted', async () => {
    mockPollWorkflow.mockResolvedValue({ status: 'completed', result: CAD_RESULT } as never);
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackCadGeneration({ workflowId: 'cad-1', cadRoute: '/image-to-cad', analytics: CAD_ANALYTICS });
    });

    await waitFor(() => expect(mockTrackCadCompleted).toHaveBeenCalledTimes(1));
    expect(mockTrackCadCompleted).toHaveBeenCalledWith(expect.objectContaining({
      source: 'image-to-cad',
      category: 'ring',
      prompt_length: 42,
      reference_image_count: 3,
      llm_tier: 'fable-5',
      is_first_ever: true,
      duration_ms: expect.any(Number),
      // The join key. Without it a completion can only be matched to its start
      // by person and timing, which is guesswork across sessions.
      workflow_id: 'cad-1',
    }));
  });

  it('emits the completion exactly once when a stale tab reconciles', async () => {
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse({ runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(jsonResponse(CAD_RESULT));
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackCadGeneration({ workflowId: 'cad-stale-1', cadRoute: '/text-to-cad', analytics: CAD_ANALYTICS });
    });
    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(mockTrackCadCompleted).toHaveBeenCalledTimes(1));
  });

  it('still reports a source for a run persisted before the analytics bundle existed', async () => {
    // A row written by the previous build carries cadRoute but no analytics.
    // The route is enough to name the tool, so the event keeps its most
    // important property instead of being dropped or guessed at.
    localStorage.setItem('formanova_running_cad_v1', JSON.stringify([
      { workflowId: 'cad-legacy', startedAt: Date.now(), cadRoute: '/text-to-cad', timeoutMs: 60_000 },
    ]));
    mockPollWorkflow.mockResolvedValue({ status: 'completed', result: CAD_RESULT } as never);
    renderHook(() => useGenerations(), { wrapper });

    await waitFor(() => expect(mockTrackCadCompleted).toHaveBeenCalledTimes(1));
    const props = mockTrackCadCompleted.mock.calls[0][0];
    expect(props.source).toBe('text-to-cad');
    // Never asserted as 0: this layer cannot see the prompt of a run it did
    // not start, and a fabricated 0 would read as a real empty prompt.
    expect(props.prompt_length).toBeUndefined();
  });

  it('carries the analytics bundle across a refresh so completion keeps its properties', async () => {
    const first = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      first.result.current.trackCadGeneration({ workflowId: 'cad-refresh', cadRoute: '/image-to-cad', analytics: CAD_ANALYTICS });
    });
    await waitFor(() => {
      expect(localStorage.getItem('formanova_running_cad_v1')).toContain('cad-refresh');
    });
    first.unmount();

    const second = renderHook(() => useGenerations(), { wrapper });
    expect(second.result.current.generations[0].cadAnalytics).toEqual(CAD_ANALYTICS);
  });

  it('persists a running CAD id and restores it after provider remount', async () => {
    const first = renderHook(() => useGenerations(), { wrapper });
    act(() => { first.result.current.trackCadGeneration({ workflowId: 'cad-persisted', cadRoute: '/text-to-cad' }); });

    await waitFor(() => {
      expect(localStorage.getItem('formanova_running_cad_v1')).toContain('cad-persisted');
    });
    first.unmount();

    const second = renderHook(() => useGenerations(), { wrapper });
    expect(second.result.current.generations[0]).toMatchObject({
      workflowId: 'cad-persisted',
      kind: 'cad',
      status: 'running',
      cadRoute: '/text-to-cad',
    });
  });

  it('reconciles a stale running tab when the backend is already completed', async () => {
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse({ runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(jsonResponse(CAD_RESULT));
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-stale' }); });

    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(result.current.generations[0].status).toBe('completed'));
    expect(result.current.generations[0].glbUrl).toBe('https://s/r.glb');
    expect(result.current.generations[0].threedmUrl).toBe('https://s/r.3dm');
  });

  it('marks a failed cad run failed rather than completed', async () => {
    mockPollWorkflow.mockResolvedValue({
      status: 'completed',
      result: { ok: false, status: 'failed', phase: 'cad_export', user_message: 'Could not build.' },
    } as never);
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-1' }); });

    await waitFor(() => expect(result.current.generations[0].status).toBe('failed'));
    expect(mockMarkFailed).toHaveBeenCalled();
  });

  it('runs cad and photoshoot generations side by side', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackCadGeneration({ workflowId: 'cad-1' });
      result.current.trackGeneration({
        workflowId: 'photo-1', isProductShot: false, jewelryType: 'rings',
        jewelryUrl: 'j', modelUrl: 'm', aspectRatio: '3:4',
        resolution: '1K' as never, generationCost: 10,
      });
    });

    expect(result.current.generations).toHaveLength(2);
    expect(result.current.generations.filter(g => g.kind === 'cad')).toHaveLength(1);
    // Photoshoot rows stay untagged, preserving their existing meaning.
    expect(result.current.generations.find(g => g.workflowId === 'photo-1')!.kind).toBeUndefined();
  });

  it('aborts a cad poll when the generation is cleared', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-1' }); });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalled());
    const signal = mockPollWorkflow.mock.calls[0][0].signal as AbortSignal;

    act(() => { result.current.clearGeneration('cad-1'); });
    expect(signal.aborted).toBe(true);
    expect(result.current.generations).toHaveLength(0);
  });
});
