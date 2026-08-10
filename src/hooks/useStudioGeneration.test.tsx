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
  startFixShot: vi.fn(),
  getJewelryDescription: vi.fn(),
  // Real base-name logic (pure helpers) so gate assertions see the actual names.
  generateWorkflowFor: (isProductShot: boolean) =>
    isProductShot ? 'Product_shot_pipeline' : 'jewelry_photoshoots_generator',
  fixWorkflowFor: (isProductShot: boolean) =>
    isProductShot ? 'fix_product_shot' : 'fix_model_shot',
  // Effort-aware generate resolver: low → unsuffixed; high → higher-tier names
  // (on-model splits 4K, PDP is one name across tiers). Mirrors photoshoot-api.
  workflowFor: (isProductShot: boolean, resolution: string, effort: string = 'low') => {
    if (effort === 'high') {
      if (isProductShot) return 'Product_shot_pipeline_higher_tier';
      return resolution === '4K'
        ? 'jewelry_photoshoots_generator_higher_tier_4k'
        : 'jewelry_photoshoots_generator_higher_tier';
    }
    return isProductShot ? 'Product_shot_pipeline' : 'jewelry_photoshoots_generator';
  },
  buildJewelryRequestFields: (opts: {
    effort: string;
    coverUrl: string;
    coverAssetId: string | null;
    supporting: Array<{ url: string | null; assetId: string | null }>;
  }) => {
    if (opts.effort !== 'high') {
      return opts.coverAssetId ? { input_jewelry_asset_id: opts.coverAssetId } : {};
    }
    const urls = [opts.coverUrl, ...opts.supporting.map((s) => s.url)].filter(Boolean);
    const ids = [opts.coverAssetId, ...opts.supporting.map((s) => s.assetId)].filter(Boolean);
    return { tier: 'high', jewelry_image_urls: urls, input_jewelry_asset_ids: ids };
  },
}));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/microservices-api', () => ({
  uploadToAzure: vi.fn(),
  bulkUploadJewelry: vi.fn(),
  MAX_BULK_JEWELRY_FILES: 3,
}));
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
  trackAIFixSubmitted: vi.fn(),
  consumeFirstGeneration: vi.fn().mockReturnValue(false),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { startPhotoshoot, startFixShot } from '@/lib/photoshoot-api';
import { bulkUploadJewelry } from '@/lib/microservices-api';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { trackGenerationComplete } from '@/lib/posthog-events';
import { useStudioGeneration } from './useStudioGeneration';

const mockStartPhotoshoot = vi.mocked(startPhotoshoot);
const mockStartFixShot = vi.mocked(startFixShot);
const mockBulkUploadJewelry = vi.mocked(bulkUploadJewelry);
const mockMarkGenerationStarted = vi.mocked(markGenerationStarted);

// ── Context helpers ────────────────────────────────────────────────────────

function makeContextValue(overrides: Partial<GenerationsContextValue> = {}): GenerationsContextValue {
  const base: GenerationsContextValue = {
    generations: [],
    trackGeneration: vi.fn(),
    trackCadGeneration: vi.fn(),
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
    effort: 'low' as const,
    supportingItems: [],
    jewelryFile: null,
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

  it('High effort with supporting files bulk-uploads the set and sends cover-first arrays', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-bulk', status_url: '', result_url: '' });
    mockBulkUploadJewelry.mockResolvedValue({
      jewelry: [
        { asset_id: 'id-a', uri: 'azure://a', sha256: 'sa' },
        { asset_id: 'id-b', uri: 'azure://b', sha256: 'sb' },
      ],
      model: [],
      background: [],
      input_group_id: 'grp-1',
    });

    const cover = new File(['c'], 'cover.png', { type: 'image/png' });
    const support = new File(['s'], 'support.png', { type: 'image/png' });

    const { result } = renderHook(
      () => useStudioGeneration({ ...baseOptions(), effort: 'high' as const, jewelryFile: cover, supportingItems: [{ file: support }] }),
      { wrapper: wrapper(ctx) },
    );

    await act(async () => { await result.current.handleGenerate(); });

    expect(mockBulkUploadJewelry).toHaveBeenCalledTimes(1);
    const startArg = mockStartPhotoshoot.mock.calls[0][0] as Record<string, unknown>;
    expect(startArg.jewelry_image_urls).toEqual(['azure://a', 'azure://b']);
    expect(startArg.input_jewelry_asset_ids).toEqual(['id-a', 'id-b']);
  });

  it('High effort with an all-vault set reuses member urls/ids and uploads nothing', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-vault', status_url: '', result_url: '' });

    // Cover came from the vault (no jewelryFile); supporting angles are vault
    // members too. Nothing should be bulk-uploaded; the run gets the existing
    // cover-first urls/ids as-is.
    const { result } = renderHook(
      () => useStudioGeneration({
        ...baseOptions(),
        effort: 'high' as const,
        jewelryFile: null,
        jewelryUploadedUrl: 'azure://cover',
        jewelryAssetId: 'id-cover',
        supportingItems: [
          { url: 'azure://m2', assetId: 'id-m2' },
          { url: 'azure://m3', assetId: 'id-m3' },
        ],
      }),
      { wrapper: wrapper(ctx) },
    );

    await act(async () => { await result.current.handleGenerate(); });

    expect(mockBulkUploadJewelry).not.toHaveBeenCalled();
    const startArg = mockStartPhotoshoot.mock.calls[0][0] as Record<string, unknown>;
    expect(startArg.jewelry_image_urls).toEqual(['azure://cover', 'azure://m2', 'azure://m3']);
    expect(startArg.input_jewelry_asset_ids).toEqual(['id-cover', 'id-m2', 'id-m3']);
  });

  it('High effort mixing a vault cover with a fresh supporting file uploads only the fresh one', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-mixed', status_url: '', result_url: '' });
    mockBulkUploadJewelry.mockResolvedValue({
      jewelry: [{ asset_id: 'id-fresh', uri: 'azure://fresh', sha256: 'sf' }],
      model: [],
      background: [],
      input_group_id: 'grp-mixed',
    });

    const support = new File(['s'], 'support.png', { type: 'image/png' });

    const { result } = renderHook(
      () => useStudioGeneration({
        ...baseOptions(),
        effort: 'high' as const,
        jewelryFile: null,
        jewelryUploadedUrl: 'azure://cover',
        jewelryAssetId: 'id-cover',
        supportingItems: [{ file: support }],
      }),
      { wrapper: wrapper(ctx) },
    );

    await act(async () => { await result.current.handleGenerate(); });

    expect(mockBulkUploadJewelry).toHaveBeenCalledTimes(1);
    const startArg = mockStartPhotoshoot.mock.calls[0][0] as Record<string, unknown>;
    expect(startArg.jewelry_image_urls).toEqual(['azure://cover', 'azure://fresh']);
    expect(startArg.input_jewelry_asset_ids).toEqual(['id-cover', 'id-fresh']);
  });

  it('passes the resolution tier as pricingContext.image_size to the credit gate', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-gate-1k', status_url: '', result_url: '' });

    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });
    await act(async () => { await result.current.handleGenerate(); });

    expect(mockCheckCredits).toHaveBeenCalledWith(
      'jewelry_photoshoots_generator',
      1,
      { pricingContext: { image_size: '1K' } },
    );
  });

  it('gates a 4K request on the BASE workflow name with the tier in pricingContext (Step 5)', async () => {
    const ctx = makeContextValue();
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-gate-4k', status_url: '', result_url: '' });

    const { result } = renderHook(
      () => useStudioGeneration({ ...baseOptions(), resolution: '4K' as const, generationCost: 20 }),
      { wrapper: wrapper(ctx) },
    );
    await act(async () => { await result.current.handleGenerate(); });

    // No _4k suffix anymore — base name, tier carried by pricingContext/image_size.
    expect(mockCheckCredits).toHaveBeenCalledWith(
      'jewelry_photoshoots_generator',
      1,
      { pricingContext: { image_size: '4K' } },
    );
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
      trackCadGeneration: vi.fn(),
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
      trackCadGeneration: vi.fn(),
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

  it('restoreAsyncResult adopts carried jewelry/model inputs (upscale re-anchor to source generation)', () => {
    const ctx = makeContextValue();
    const { result } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    // Simulate the toast/header re-anchoring a finished upscale back to its parent
    // generation: workflowId is the ORIGINAL, images are the UPSCALED output, and the
    // original jewelry/model inputs are carried through so feedback stays correct.
    act(() => {
      result.current.restoreAsyncResult('wf-original', ['https://example.com/upscaled.jpg'], {
        aspectRatio: '3:4',
        resolution: '1K',
        generationCost: 10,
        jewelryUrl: 'https://example.com/original-jewelry.jpg',
        modelUrl: 'https://example.com/original-model.jpg',
      });
    });

    expect(result.current.workflowId).toBe('wf-original');
    expect(result.current.resultImages).toEqual(['https://example.com/upscaled.jpg']);
    expect(result.current.generationInputUrls?.jewelryUrl).toBe('https://example.com/original-jewelry.jpg');
    expect(result.current.generationInputUrls?.modelUrl).toBe('https://example.com/original-model.jpg');
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
      // Exposed for the input previews (spinner / fix / feedback). Low effort:
      // single-entry jewelry set, effort 'low', reference = the model url.
      jewelryUrls: ['https://example.com/jewelry.jpg'],
      effort: 'low',
      referenceModelUrl: 'https://example.com/model.jpg',
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

  it('keeps workflow-specific state when later generations complete before an earlier 4K workflow', async () => {
    const modelA = { id: 'model-a', url: 'https://example.com/model-a.jpg', name: 'Model A', label: 'Model A', metadata: {} };
    const modelB = { id: 'model-b', url: 'https://example.com/model-b.jpg', name: 'Model B', label: 'Model B', metadata: {} };
    const modelC = { id: 'model-c', url: 'https://example.com/model-c.jpg', name: 'Model C', label: 'Model C', metadata: {} };
    const modelD = { id: 'model-d', url: 'https://example.com/model-d.jpg', name: 'Model D', label: 'Model D', metadata: {} };

    mockStartPhotoshoot
      .mockResolvedValueOnce({ workflow_id: 'wf1', status_url: '', result_url: '' })
      .mockResolvedValueOnce({ workflow_id: 'wf2', status_url: '', result_url: '' })
      .mockResolvedValueOnce({ workflow_id: 'wf3', status_url: '', result_url: '' })
      .mockResolvedValueOnce({ workflow_id: 'wf4', status_url: '', result_url: '' });

    let ctxGenerations: TrackedGeneration[] = [];
    const mockClearGeneration = vi.fn((workflowId: string) => {
      ctxGenerations = ctxGenerations.filter(g => g.workflowId !== workflowId);
    });
    const ctx = makeContextValue({
      get generations() { return ctxGenerations; },
      trackGeneration: vi.fn(),
      clearGeneration: mockClearGeneration,
    });

    let options = {
      ...baseOptions(),
      selectedModel: modelA,
      activeModelUrl: modelA.url,
      resolution: '4K' as '1K' | '2K' | '4K',
      generationCost: 25,
    };
    const { result, rerender } = renderHook(() => useStudioGeneration(options), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf1');
    expect(result.current.generationInputUrls).toEqual({
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model-a.jpg',
      aspectRatio: '3:4',
      resolution: '4K',
      generationCost: 25,
      jewelryUrls: ['https://example.com/jewelry.jpg'],
      effort: 'low',
      referenceModelUrl: 'https://example.com/model-a.jpg',
    });

    act(() => { result.current.handleKeepBrowsing(); });

    options = {
      ...baseOptions(),
      selectedModel: modelB,
      activeModelUrl: modelB.url,
      resolution: '1K' as '1K' | '2K' | '4K',
      generationCost: 10,
    };
    rerender();
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf2');

    act(() => { result.current.handleKeepBrowsing(); });

    options = {
      ...baseOptions(),
      selectedModel: modelC,
      activeModelUrl: modelC.url,
      resolution: '2K' as '1K' | '2K' | '4K',
      generationCost: 15,
    };
    rerender();
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf3');

    act(() => { result.current.handleKeepBrowsing(); });

    options = {
      ...baseOptions(),
      selectedModel: modelD,
      activeModelUrl: modelD.url,
      resolution: '1K' as '1K' | '2K' | '4K',
      generationCost: 10,
    };
    rerender();
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.workflowId).toBe('wf4');

    ctxGenerations = [{
      workflowId: 'wf4',
      status: 'completed',
      progress: 100,
      generationStep: 'Done',
      resultImages: ['https://example.com/result-wf4.jpg'],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model-d.jpg',
      isProductShot: false,
      jewelryType: 'ring',
      startedAt: Date.now() - 40_000,
      aspectRatio: '3:4',
      resolution: '1K',
      generationCost: 10,
    }];
    act(() => { rerender(); });

    await waitFor(() => {
      expect(result.current.resultImages).toEqual(['https://example.com/result-wf4.jpg']);
    });
    expect(result.current.workflowId).toBe('wf4');

    act(() => {
      result.current.restoreAsyncResult('wf1', ['https://example.com/result-wf1.jpg'], {
        aspectRatio: '3:4',
        resolution: '4K',
        generationCost: 25,
      });
    });

    expect(result.current.workflowId).toBe('wf1');
    expect(result.current.resultImages).toEqual(['https://example.com/result-wf1.jpg']);
    expect(result.current.generationInputUrls).toEqual({
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model-a.jpg',
      aspectRatio: '3:4',
      resolution: '4K',
      generationCost: 25,
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
      trackCadGeneration: vi.fn(),
    clearGeneration: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });
    ctxGenerations = [completedGeneration];
    act(() => { rerender(); });

    await waitFor(() => expect(mockClearStudioSession).toHaveBeenCalled());
  });

  it('forwards the completed result asset id as fix sourceAssetId and estimate pricingContext', async () => {
    const ASSET_ID = 'a1b2c3d4-0000-1111-2222-333344445555';
    mockStartPhotoshoot.mockResolvedValue({ workflow_id: 'wf-fixsrc', status_url: '', result_url: '' });
    mockStartFixShot.mockResolvedValue({ workflow_id: 'wf-fixsrc-2', status_url: '', result_url: '' });

    const completedGeneration: TrackedGeneration = {
      workflowId: 'wf-fixsrc', status: 'completed', progress: 100,
      generationStep: 'Done', resultImages: ['https://example.com/result.jpg'],
      jewelryUrl: 'https://example.com/jewelry.jpg',
      modelUrl: 'https://example.com/model.jpg',
      isProductShot: false, jewelryType: 'ring', startedAt: Date.now() - 30000,
      aspectRatio: '3:4', resolution: '1K', generationCost: 10,
      outputAssetId: ASSET_ID,
    };

    let ctxGenerations: TrackedGeneration[] = [];
    const ctx = makeContextValue({
      get generations() { return ctxGenerations; },
      trackGeneration: vi.fn(),
      trackCadGeneration: vi.fn(),
    clearGeneration: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useStudioGeneration(baseOptions()), { wrapper: wrapper(ctx) });

    await act(async () => { await result.current.handleGenerate(); });
    ctxGenerations = [completedGeneration];
    act(() => { rerender(); });

    // Completion effect must have captured the asset id.
    await waitFor(() => expect(result.current.resultImages).toEqual(['https://example.com/result.jpg']));

    await act(async () => { await result.current.handleAIFix('make it brighter'); });

    expect(mockStartFixShot).toHaveBeenCalledWith(
      expect.objectContaining({ sourceAssetId: ASSET_ID, isProductShot: false }),
    );
    expect(mockCheckCredits).toHaveBeenCalledWith(
      'fix_model_shot',
      1,
      { pricingContext: { source_asset_id: ASSET_ID } },
    );
  });
});
