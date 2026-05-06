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
    validationResult: null,
    checkCredits: mockCheckCredits,
    refreshCredits: mockRefreshCredits,
    toast: vi.fn(),
    setCurrentStep: mockSetCurrentStep,
    setJewelryAssetId: mockSetJewelryAssetId,
    clearStudioSession: mockClearStudioSession,
    clearValidation: mockClearValidation,
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
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 30000,
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
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now(),
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
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 5000,
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

  it('captures generationInputUrls from the URLs actually sent to startPhotoshoot', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-inputs', status_url: '', result_url: '' });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    expect(result.current.generationInputUrls).toBeNull();

    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.generationInputUrls).toEqual({
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
    });
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
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 10000,
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
