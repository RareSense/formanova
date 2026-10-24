import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const checkCredits = vi.fn();
vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCredits }) }));
const generationsState = vi.hoisted(() => ({ generations: [] as unknown[] }));
const trackCadGenerationMock = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/GenerationsContext', () => ({
  useGenerations: () => ({ generations: generationsState.generations, trackCadGeneration: trackCadGenerationMock }),
}));
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
const buildReferenceInputs = vi.hoisted(() => vi.fn(async (_files: File[]) => [] as unknown[]));
vi.mock('@/lib/cad-reference-upload', () => ({ buildReferenceInputs }));
vi.mock('@/lib/posthog-events', () => ({
  trackPaywallHit: vi.fn(),
  trackCadGenerationStarted: vi.fn(),
  trackCadGenerationFailed: vi.fn(),
  trackCadImproveRequested: vi.fn(),
  trackCadResultRestored: vi.fn(),
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }));

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

    let first: Promise<boolean>, second: Promise<boolean>;
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

  it('a failed credit check is reported and resolves false instead of rejecting silently', async () => {
    toastError.mockReset();
    checkCredits.mockRejectedValueOnce(new Error('Balance fetch failed (500)'));
    const { result } = renderWorkflow();
    let started: boolean | undefined;
    await act(async () => { started = await result.current.simulateGeneration(); });
    expect(started).toBe(false);
    expect(toastError).toHaveBeenCalledWith("We couldn't check your credits. Please try again.");
    expect(startCalls()).toHaveLength(0);
    expect(result.current.isStarting).toBe(false);
  });

  it('is Starting from the press until the start settles', async () => {
    let answer: (approved: boolean) => void = () => {};
    checkCredits.mockReturnValue(new Promise<boolean>((resolve) => { answer = resolve; }));
    const { result } = renderWorkflow();
    let run: Promise<boolean> = Promise.resolve(false);
    act(() => { run = result.current.simulateGeneration(); });
    expect(result.current.isStarting).toBe(true);
    await act(async () => { answer(true); await run; });
    expect(result.current.isStarting).toBe(false);
    expect(startCalls()).toHaveLength(1);
  });

  it('sends the pictures handed to it (the approved design), not the stale reference set', async () => {
    checkCredits.mockResolvedValue(true);
    buildReferenceInputs.mockClear();
    const { result } = renderWorkflow(); // referenceImages: []
    const design = new File(['x'], 'edited-design.png', { type: 'image/png' });
    let started: boolean | undefined;
    await act(async () => { started = await result.current.simulateGeneration([design]); });
    expect(started).toBe(true);
    expect(buildReferenceInputs).toHaveBeenCalledWith([design]);
    expect(startCalls()).toHaveLength(1);
  });

  it('ignores a click event passed as the argument', async () => {
    checkCredits.mockResolvedValue(true);
    buildReferenceInputs.mockClear();
    const { result } = renderWorkflow();
    await act(async () => { await result.current.simulateGeneration({ type: 'click' } as unknown); });
    expect(buildReferenceInputs).toHaveBeenCalledWith([]);
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

describe('useImageToCADWorkflow version files', () => {
  const downloads = [{ kind: 'casting_stl' as const, filename: 'c.stl', bytes: 1 }];
  const ring = {
    set_id: 'set-1',
    versions: [
      { asset_id: 'v1', position: 0, glb_url: '/v1.glb' },
      { asset_id: 'v2', position: 1, glb_url: '/v2.glb', downloads },
    ],
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as Response);
  });

  it('are the files of the version on screen, and only while the viewer shows it', async () => {
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('state-v2', '/v2.glb', { ring, selectedVersionId: 'v2' });
    });
    expect(result.current.versionDownloads).toMatchObject({ assetId: 'v2', downloads });

    act(() => result.current.selectVersion('v1'));
    expect(result.current.versionDownloads).toBeNull();
  });

  it('are withheld when the viewer shows a different model than the version', async () => {
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('state-x', '/other.glb', { ring, selectedVersionId: 'v2' });
    });
    expect(result.current.versionDownloads).toBeNull();
  });
});

describe('useImageToCADWorkflow supervised runs', () => {
  beforeEach(() => {
    checkCredits.mockReset();
    mockFetch.mockReset();
    generationsState.generations = [];
    trackCadGenerationMock.mockReset();
  });

  it('opens a waiting run as still in progress, not as a failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: { message: 'workflow is waiting for human input', pending_human_tasks: [] } }),
    } as Response);
    const { result } = renderWorkflow();
    let restored: boolean | undefined;
    await act(async () => { restored = await result.current.restoreCompletedWorkflow('state-q', null); });

    expect(restored).toBe(true);
    expect(result.current.generationFailed).toBe(false);
    expect(result.current.statusNotice?.title).toBe('Still in progress');
  });

  it('hands a supervised start to the tracker and shows it as queued, with no popup', async () => {
    checkCredits.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-1', supervised: true }) } as Response);
    const { result, rerender } = renderWorkflow();
    await act(async () => { await result.current.simulateGeneration(); });

    expect(trackCadGenerationMock).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'state-1', supervised: true }));
    expect(result.current.statusNotice).toBeNull();

    generationsState.generations = [{
      kind: 'cad', workflowId: 'state-1', status: 'running', generationStep: 'Analyzing your design...', supervised: true,
    }];
    rerender();
    expect(result.current.isQueued).toBe(true);
  });

  it('hands a supervised improve start to the tracker with the flag', async () => {
    checkCredits.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-imp', supervised: true }) } as Response);
    const ring = {
      set_id: 'set-1',
      versions: [{ asset_id: 'v1', position: 0, glb_url: '/v1.glb', viewer_threedm_url: '/v1.viewer.3dm', improvable: true }],
    };
    const { result } = renderWorkflow();
    await act(async () => {
      await result.current.restoreCompletedWorkflow('state-r', '/v1.glb', { ring, selectedVersionId: 'v1' });
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-imp', supervised: true }) } as Response);
    await act(async () => { await result.current.improveFromLatestVersion(); });

    expect(mockFetch).toHaveBeenCalledWith('/api/cad/versions/v1/improve', expect.objectContaining({ method: 'POST' }));
    expect(trackCadGenerationMock).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'state-imp', supervised: true }));
  });

  it('says nothing extra when the start reply is not supervised', async () => {
    checkCredits.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-1', supervised: false }) } as Response);
    const { result } = renderWorkflow();
    await act(async () => { await result.current.simulateGeneration(); });
    expect(result.current.statusNotice).toBeNull();
    expect(trackCadGenerationMock).toHaveBeenCalledWith(expect.not.objectContaining({ supervised: true }));
    expect(result.current.isQueued).toBe(false);
  });
});
