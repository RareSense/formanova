import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCredits: vi.fn() }) }));
vi.mock('@/contexts/GenerationsContext', () => ({
  useGenerations: () => ({ generations: [], trackCadGeneration: vi.fn() }),
}));
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
vi.mock('@/lib/posthog-events', () => ({
  trackPaywallHit: vi.fn(),
  trackCadGenerationStarted: vi.fn(),
  trackCadGenerationFailed: vi.fn(),
  trackCadImproveRequested: vi.fn(),
  trackCadResultRestored: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
const fetchCadRunInputs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cad-result-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cad-result-api')>('@/lib/cad-result-api');
  return { ...actual, fetchCadRunInputs };
});

import { useImageToCADWorkflow } from '@/hooks/useImageToCADWorkflow';

function renderWorkflow() {
  return renderHook(() => useImageToCADWorkflow({
    model: 'test', prompt: '', referenceImages: [], cadRoute: '/image-to-cad', onWorkspaceActivate: vi.fn(),
  }));
}

const ring = { set_id: 'set-1', versions: [{ asset_id: 'v1', position: 0, glb_url: '/m.glb' }] };

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => fetchCadRunInputs.mockReset());

describe('useImageToCADWorkflow restoring a run\'s inputs', () => {
  it('fills the photos and prompt from the run when nothing was seeded', async () => {
    fetchCadRunInputs.mockResolvedValue({ referenceImageUrls: ['/run.webp'], prompt: 'US 7' });
    const { result } = renderWorkflow();
    await act(async () => { await result.current.restoreCompletedWorkflow('wf-1', '/m.glb'); });
    await flush();
    expect(result.current.restoredReferenceUrls).toEqual(['/run.webp']);
    expect(result.current.restoredPrompt).toBe('US 7');
  });

  it('never wipes seeded photos and prompt with an empty lookup', async () => {
    fetchCadRunInputs.mockResolvedValue({ referenceImageUrls: [], prompt: null });
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('wf-1', '/m.glb', { ring, referenceImageUrls: ['/seed.webp'], prompt: 'seeded' });
    });
    await flush();
    expect(result.current.restoredReferenceUrls).toEqual(['/seed.webp']);
    expect(result.current.restoredPrompt).toBe('seeded');
  });

  it('prefers the seed over the lookup when both have values', async () => {
    fetchCadRunInputs.mockResolvedValue({ referenceImageUrls: ['/own.webp'], prompt: 'own' });
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('wf-1', '/m.glb', { ring, referenceImageUrls: ['/seed.webp'], prompt: 'seeded' });
    });
    await flush();
    expect(result.current.restoredReferenceUrls).toEqual(['/seed.webp']);
    expect(result.current.restoredPrompt).toBe('seeded');
  });

  it('drops a slow lookup for a run that is no longer the one on screen', async () => {
    let answerFirst!: (v: { referenceImageUrls: string[]; prompt: string | null }) => void;
    fetchCadRunInputs
      .mockReturnValueOnce(new Promise((r) => { answerFirst = r; }))
      .mockResolvedValueOnce({ referenceImageUrls: ['/b.webp'], prompt: 'B' });
    const { result } = renderWorkflow();
    await act(async () => { await result.current.restoreCompletedWorkflow('wf-a', '/a.glb'); });
    await act(async () => { await result.current.restoreCompletedWorkflow('wf-b', '/b.glb'); });
    await flush();
    await act(async () => { answerFirst({ referenceImageUrls: ['/a.webp'], prompt: 'A' }); });
    await flush();
    expect(result.current.restoredPrompt).toBe('B');
    expect(result.current.restoredReferenceUrls).toEqual(['/b.webp']);
  });

  it('counts each restore, so the page can tell a restore from a re-render', async () => {
    fetchCadRunInputs.mockResolvedValue({ referenceImageUrls: [], prompt: null });
    const { result } = renderWorkflow();
    expect(result.current.restoreCount).toBe(0);
    await act(async () => { await result.current.restoreCompletedWorkflow('wf-1', '/m.glb'); });
    expect(result.current.restoreCount).toBe(1);
    await act(async () => { await result.current.restoreCompletedWorkflow('wf-1', '/m.glb'); });
    expect(result.current.restoreCount).toBe(2);
  });
});
