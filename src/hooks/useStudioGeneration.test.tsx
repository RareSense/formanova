import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GenerationsContext } from '@/contexts/GenerationsContext';
import type { TrackedGeneration, GenerationsContextValue } from '@/contexts/GenerationsContext';

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('@/lib/photoshoot-api', () => ({
  startPhotoshoot: vi.fn(),
  startPdpShot: vi.fn(),
}));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/microservices-api', () => ({ uploadToAzure: vi.fn() }));
vi.mock('@/lib/image-compression', () => ({
  compressImageBlob: vi.fn().mockResolvedValue({ blob: new Blob() }),
  imageSourceToBlob: vi.fn().mockResolvedValue(new Blob()),
}));
vi.mock('@/lib/generation-lifecycle', () => ({
  markGenerationStarted: vi.fn(),
  markGenerationCompleted: vi.fn(),
  markGenerationFailed: vi.fn(),
}));
vi.mock('@/lib/posthog-events', () => ({
  trackPaywallHit: vi.fn(),
  trackGenerationComplete: vi.fn(),
  consumeFirstGeneration: vi.fn().mockReturnValue(false),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { startPhotoshoot } from '@/lib/photoshoot-api';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { trackGenerationComplete } from '@/lib/posthog-events';
import { useStudioGeneration } from './useStudioGeneration';

const mockStartPhotoshoot = vi.mocked(startPhotoshoot);
const mockMarkGenerationStarted = vi.mocked(markGenerationStarted);

// ── Context helpers ────────────────────────────────────────────────────────

function makeContextValue(overrides: Partial<GenerationsContextValue> = {}): GenerationsContextValue {
  const base: GenerationsContextValue = {
    generations: [],
    trackGeneration: vi.fn(),
    clearGeneration: vi.fn(),
  };
  // Use Object.defineProperties so that getters on overrides are preserved
  // (a plain spread `{ ...overrides }` would call the getter once and copy the value).
  Object.defineProperties(base, Object.getOwnPropertyDescriptors(overrides));
  return base;
}

function wrapper(ctxValue: GenerationsContextValue) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <GenerationsContext.Provider value={ctxValue}>
        {children}
      </GenerationsContext.Provider>
    </MemoryRouter>
  );
}

// ── Shared hook options ────────────────────────────────────────────────────

const mockSetCurrentStep = vi.fn();
const mockCheckCredits = vi.fn().mockResolvedValue(true);
const mockRefreshCredits = vi.fn();
const mockClearStudioSession = vi.fn();
const mockClearValidation = vi.fn();
const mockSetJewelryAssetId = vi.fn();

function baseOptions() {
  return {
    isProductShot: false,
    effectiveJewelryType: 'rings',
    jewelryImage: 'data:image/jpeg;base64,abc',
    activeModelUrl: 'https://example.com/model.jpg',
    jewelryUploadedUrl: 'https://example.com/jewelry.jpg',
    jewelryAssetId: null,
    selectedModel: { id: 'model-1', url: 'https://example.com/model.jpg', name: 'Model 1', label: 'Model 1', metadata: {} },
    customModelImage: null,
    modelAssetId: null,
    aspectRatio: '3:4',
    resolution: '1K' as const,
    generationCost: 10,
    checkCredits: mockCheckCredits,
    toast: vi.fn(),
    setCurrentStep: mockSetCurrentStep,
    setJewelryAssetId: mockSetJewelryAssetId,
    clearStudioSession: mockClearStudioSession,
  };
}

describe('useStudioGeneration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls trackGeneration with workflowId after startPhotoshoot resolves', async () => {
    const mockTrackGeneration = vi.fn();
    const ctx = makeContextValue({ trackGeneration: mockTrackGeneration });

    mockStartPhotoshoot.mockResolvedValue({
      workflow_id: 'wf-test-1',
      status_url: '/api/status/wf-test-1',
      result_url: '/api/result/wf-test-1',
    });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });

    expect(mockTrackGeneration).toHaveBeenCalledWith({
      workflowId: 'wf-test-1',
      isProductShot: false,
      jewelryType: 'ring',
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    });
    expect(mockMarkGenerationStarted).toHaveBeenCalledWith('wf-test-1');
    expect(mockSetCurrentStep).toHaveBeenCalledWith('generating');
  });

  it('transitions to results step when generation completes in Context', async () => {
    const mockClearGeneration = vi.fn();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-test-2', status_url: '', result_url: '' });

    const completedGeneration: TrackedGeneration = {
      workflowId: 'wf-test-2', status: 'completed', progress: 100,
      generationStep: 'Done', resultImages: ['https://example.com/result.jpg'],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 30000,
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    };

    // Start with no generations, then simulate completion
    let ctxGenerations: TrackedGeneration[] = [];
    const ctx = makeContextValue({
      get generations() { return ctxGenerations; },
      trackGeneration: vi.fn(),
      clearGeneration: mockClearGeneration,
    });

    const { result, rerender } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    // Submit to set workflowId in hook state
    await act(async () => { await result.current.handleGenerate(); });

    // Simulate Context completing the generation
    ctxGenerations = [completedGeneration];
    act(() => { rerender(); });

    await waitFor(() => {
      expect(mockSetCurrentStep).toHaveBeenCalledWith('results');
    });
    expect(result.current.resultImages).toEqual(['https://example.com/result.jpg']);
    expect(mockClearGeneration).toHaveBeenCalledWith('wf-test-2');
    expect(mockClearStudioSession).toHaveBeenCalled();
    expect(trackGenerationComplete).toHaveBeenCalled();
  });

  it('sets generationError when generation fails in Context', async () => {
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-test-3', status_url: '', result_url: '' });

    const failedGeneration: TrackedGeneration = {
      workflowId: 'wf-test-3', status: 'failed', progress: 0,
      generationStep: '', resultImages: [],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now(),
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    };

    let ctxGenerations: TrackedGeneration[] = [];
    const ctx = makeContextValue({
      get generations() { return ctxGenerations; },
      trackGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });

    ctxGenerations = [failedGeneration];
    act(() => { rerender(); });

    await waitFor(() => {
      expect(result.current.generationError).toBe('unavailable');
    });
  });

  it('resumeGeneration restores workflowId, sets generating step, and tracks via Context', async () => {
    const runningGeneration: TrackedGeneration = {
      workflowId: 'wf-resume-1', status: 'running', progress: 40,
      generationStep: 'Processing', resultImages: [],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 5000,
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    };

    const ctx = makeContextValue({
      generations: [runningGeneration],
      trackGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    // Before resume: hook has no workflowId, isGenerating=false
    expect(result.current.workflowId).toBeNull();
    expect(result.current.isGenerating).toBe(false);

    act(() => { result.current.resumeGeneration('wf-resume-1'); });

    // After resume: workflowId matches, hook sees the running generation via Context
    expect(result.current.workflowId).toBe('wf-resume-1');
    expect(mockSetCurrentStep).toHaveBeenCalledWith('generating');
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.generationProgress).toBe(40);
  });

  it('restoreAsyncResult sets workflowId and resultImages together', () => {
    const ctx = makeContextValue();
    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    expect(result.current.workflowId).toBeNull();
    expect(result.current.resultImages).toEqual([]);

    act(() => {
      result.current.restoreAsyncResult('wf-async-1', ['https://example.com/result-async.jpg']);
    });

    expect(result.current.workflowId).toBe('wf-async-1');
    expect(result.current.resultImages).toEqual(['https://example.com/result-async.jpg']);
  });

  it('restoreAsyncResult stores workflow-specific generation metadata', () => {
    const ctx = makeContextValue();
    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    act(() => {
      result.current.restoreAsyncResult('wf-async-2', ['https://example.com/result-async-2.jpg'], {
        aspectRatio: '1:1',
        resolution: '4K',
        generationCost: 40,
      });
    });

    expect(result.current.generationInputUrls?.aspectRatio).toBe('1:1');
    expect(result.current.generationInputUrls?.resolution).toBe('4K');
    expect(result.current.generationInputUrls?.generationCost).toBe(40);
  });

  it('captures generationInputUrls from the URLs actually sent to startPhotoshoot', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-inputs', status_url: '', result_url: '' });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    expect(result.current.generationInputUrls).toBeNull();

    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.generationInputUrls).toEqual({
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    });
  });

  it('preserves gen1 input URLs when gen2 starts before gen1 completes (keep browsing + switch model)', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot
      .mockResolvedValueOnce({ workflow_id: 'wf-gen1', status_url: '', result_url: '' })
      .mockResolvedValueOnce({ workflow_id: 'wf-gen2', status_url: '', result_url: '' });

    const modelA = { id: 'model-a', url: 'https://example.com/model-a.jpg', name: 'Model A', label: 'Model A', metadata: {} };
    const modelB = { id: 'model-b', url: 'https://example.com/model-b.jpg', name: 'Model B', label: 'Model B', metadata: {} };

    let options = { ...baseOptions(), selectedModel: modelA, activeModelUrl: modelA.url };
    const { result, rerender } = renderHook(() => useStudioGeneration(options), { wrapper: wrapper(ctx) });

    // Gen1 with Model A
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf-gen1');
    expect(result.current.generationInputUrls?.modelUrl).toBe('https://example.com/model-a.jpg');

    // Keep browsing + switch to Model B (no resetGeneration)
    options = { ...baseOptions(), selectedModel: modelB, activeModelUrl: modelB.url };
    act(() => { rerender(); });

    // Gen2 with Model B
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf-gen2');
    expect(result.current.generationInputUrls?.modelUrl).toBe('https://example.com/model-b.jpg');

    // User clicks toast for Gen1 — restores Gen1
    act(() => { result.current.restoreAsyncResult('wf-gen1', ['https://example.com/result-gen1.jpg']); });

    expect(result.current.workflowId).toBe('wf-gen1');
    expect(result.current.generationInputUrls?.modelUrl).toBe('https://example.com/model-a.jpg');
    expect(result.current.generationInputUrls?.jewelryUrl).toBe('https://example.com/jewelry.jpg');
  });

  it('clears generationInputUrls on resetGeneration', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-reset', status_url: '', result_url: '' });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.generationInputUrls).not.toBeNull();

    act(() => { result.current.resetGeneration(); });
    expect(result.current.generationInputUrls).toBeNull();
  });

  it('calls clearStudioSession on generation completion', async () => {
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-test-4', status_url: '', result_url: '' });

    const completedGeneration: TrackedGeneration = {
      workflowId: 'wf-test-4', status: 'completed', progress: 100,
      generationStep: '', resultImages: ['https://example.com/r.jpg'],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 10000,
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    };

    let ctxGenerations: TrackedGeneration[] = [];
    const ctx = makeContextValue({
      get generations() { return ctxGenerations; },
      trackGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });
    ctxGenerations = [completedGeneration];
    act(() => { rerender(); });

    await waitFor(() => expect(mockClearStudioSession).toHaveBeenCalled());
  });
});
