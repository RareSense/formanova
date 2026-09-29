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
