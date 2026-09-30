import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const checkCredits = vi.fn();
vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCredits }) }));
vi.mock('@/contexts/GenerationsContext', () => ({
  useGenerations: () => ({ generations: [], trackCadGeneration: vi.fn() }),
}));
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
vi.mock('@/lib/cad-reference-upload', () => ({ buildReferenceInputs: vi.fn(async () => []) }));
vi.mock('@/lib/posthog-events', () => ({
  trackPaywallHit: vi.fn(),
  trackCadGenerationStarted: vi.fn(),
  trackCadGenerationFailed: vi.fn(),
  trackCadImproveRequested: vi.fn(),
  trackCadResultRestored: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useImageToCADWorkflow } from '@/hooks/useImageToCADWorkflow';

const mockFetch = vi.mocked(authenticatedFetch);
const startCalls = () => mockFetch.mock.calls.filter(([url]) => String(url).startsWith('/api/run/state/'));

function renderWorkflow() {
  return renderHook(() => useImageToCADWorkflow({
    model: 'test',
    prompt: 'an oval bangle',
    referenceImages: [],
    cadRoute: '/text-to-cad',
    onWorkspaceActivate: vi.fn(),
  }));
}

describe('useImageToCADWorkflow start', () => {
  beforeEach(() => {
    checkCredits.mockReset();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-1' }) } as Response);
  });

  it('starts one run when Generate is pressed again while the credit check is still answering', async () => {
    // A slow credit check is exactly when a second press used to start (and charge) a second run.
    let answer: (approved: boolean) => void = () => {};
    checkCredits.mockReturnValue(new Promise<boolean>((resolve) => { answer = resolve; }));
    const { result } = renderWorkflow();

    let first: Promise<void>, second: Promise<void>;
    await act(async () => {
      first = result.current.simulateGeneration();
      second = result.current.simulateGeneration();
    });
    await act(async () => {
      answer(true);
      await Promise.all([first, second]);
    });

    expect(checkCredits).toHaveBeenCalledTimes(1);
    expect(startCalls()).toHaveLength(1);
  });

  it('lets the next press through after a declined credit check, so the button never sticks', async () => {
    checkCredits.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = renderWorkflow();

    await act(async () => { await result.current.simulateGeneration(); });
    expect(startCalls()).toHaveLength(0);

    await act(async () => { await result.current.simulateGeneration(); });
    expect(checkCredits).toHaveBeenCalledTimes(2);
    expect(startCalls()).toHaveLength(1);
  });
});

describe('useImageToCADWorkflow viewing copy', () => {
  const ring = {
    set_id: 'set-1',
    versions: [
      { asset_id: 'v1', position: 0, glb_url: '/v1.glb', viewer_threedm_url: '/v1.viewer.3dm' },
      { asset_id: 'v2', position: 1, glb_url: '/v2.glb', viewer_threedm_url: '/v2.viewer.3dm' },
    ],
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as Response);
  });

  it('follows the version on screen', async () => {
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('state-v2', '/v2.glb', { ring, selectedVersionId: 'v2' });
    });
    expect(result.current.viewerThreedmUrl).toBe('/v2.viewer.3dm');

    act(() => result.current.selectVersion('v1'));
    expect(result.current.viewerThreedmUrl).toBe('/v1.viewer.3dm');
  });

  it('is withheld when the viewer shows a different model than the version', async () => {
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('state-x', '/other.glb', { ring, selectedVersionId: 'v2' });
    });
    expect(result.current.viewerThreedmUrl).toBeNull();
  });
});
