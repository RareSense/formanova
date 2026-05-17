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

import { pollWorkflow } from '@/lib/poll-workflow';
import { markGenerationCompleted, markGenerationFailed } from '@/lib/generation-lifecycle';

const mockPollWorkflow = vi.mocked(pollWorkflow);
const mockMarkCompleted = vi.mocked(markGenerationCompleted);
const mockMarkFailed = vi.mocked(markGenerationFailed);

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter><GenerationsContextProvider>{children}</GenerationsContextProvider></MemoryRouter>;
}

describe('GenerationsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: never resolves (long-running generation)
    mockPollWorkflow.mockReturnValue(new Promise(() => {}));
  });

  it('starts with empty generations array', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    expect(result.current.generations).toEqual([]);
  });

  it('appends a running generation when trackGeneration is called', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-1', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-1', resultUrl: '/api/result/wf-1' });
    });
    expect(result.current.generations).toHaveLength(1);
    expect(result.current.generations[0]).toMatchObject({ workflowId: 'wf-1', status: 'running' });
  });

  it('starts pollWorkflow when a generation is tracked', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-2', isProductShot: false, jewelryType: 'necklace', statusUrl: '/api/status/wf-2', resultUrl: '/api/result/wf-2' });
    });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalledOnce());
    expect(mockPollWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'status-then-result',
      intervalMs: 3000,
      timeoutMs: 720_000,
    }));
  });

  it('allows concurrent generations (unbounded queue)', () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-a', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-a', resultUrl: '/api/result/wf-a' });
      result.current.trackGeneration({ workflowId: 'wf-b', isProductShot: true, jewelryType: 'necklace', statusUrl: '/api/status/wf-b', resultUrl: '/api/result/wf-b' });
    });
    expect(result.current.generations).toHaveLength(2);
  });

  it('transitions to completed and populates resultImages when poll resolves', async () => {
    const resultData = { output: [{ output_url: 'https://example.com/image.jpg' }] };
    mockPollWorkflow.mockResolvedValueOnce({ status: 'completed', result: resultData });

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-3', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-3', resultUrl: '/api/result/wf-3' });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-3');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toContain('https://example.com/image.jpg');
    });
    expect(mockMarkCompleted).toHaveBeenCalledWith('wf-3', expect.any(Number));
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
      result.current.trackGeneration({ workflowId: 'wf-dup', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-dup', resultUrl: '/api/result/wf-dup' });
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
      result.current.trackGeneration({ workflowId: 'wf-one-only', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-one-only', resultUrl: '/api/result/wf-one-only' });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-one-only');
      expect(gen?.status).toBe('completed');
      expect(gen?.resultImages).toEqual(['https://example.com/first.jpg']);
    });
  });

  it('transitions to failed when poll rejects', async () => {
    mockPollWorkflow.mockRejectedValueOnce(new Error('timeout'));

    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-4', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-4', resultUrl: '/api/result/wf-4' });
    });

    await waitFor(() => {
      const gen = result.current.generations.find(g => g.workflowId === 'wf-4');
      expect(gen?.status).toBe('failed');
    });
    expect(mockMarkFailed).toHaveBeenCalledWith('wf-4', expect.any(String), expect.any(Number));
  });

  it('removes generation and aborts poll when clearGeneration is called', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({ workflowId: 'wf-5', isProductShot: false, jewelryType: 'ring', statusUrl: '/api/status/wf-5', resultUrl: '/api/result/wf-5' });
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

  it('polls /api/status|result/{workflowId} constructed urls', async () => {
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => {
      result.current.trackGeneration({
        workflowId: 'wf-6',
        isProductShot: false,
        jewelryType: 'ring',
        statusUrl: '/api/status/wf-6',
        resultUrl: '/api/result/wf-6',
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
