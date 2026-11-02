import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { CatalogEngine } from '@/components/cad-to-catalog/engine/engine';

const track = vi.hoisted(() => ({
  trackCatalogModelLoaded: vi.fn(),
  trackCatalogModelLoadFailed: vi.fn(),
  trackCatalogShotCompleted: vi.fn(),
  trackCatalogShotFailed: vi.fn(),
  trackCatalogShootCompleted: vi.fn(),
  trackCatalogShootStarted: vi.fn(),
  trackPaywallHit: vi.fn(),
}));
vi.mock('@/lib/posthog-events', () => track);

const run = vi.hoisted(() => {
  class CatalogRunError extends Error {
    constructor(message: string, readonly status: number | null = null, readonly retryable = false) { super(message); }
  }
  return {
    CatalogRunError,
    blobToDataUrl: vi.fn(async () => 'data:image/png;base64,x'),
    fastloadFile: vi.fn(),
    picturePrice: vi.fn(async () => 24),
    placeOnBackground: vi.fn(),
    savePictures: vi.fn(),
  };
});
vi.mock('@/lib/cad-to-catalog-run', () => run);
const checkCreditsFor = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCreditsFor }) }));
vi.mock('@/contexts/CreditsContext', () => ({ useCredits: () => ({ refreshCredits: async () => {} }) }));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn(async () => ({ ok: true, blob: async () => new Blob(['p']) })) }));
vi.mock('@/lib/cad-to-catalog-zip', () => ({ buildZip: vi.fn() }));
vi.mock('@/components/cad-to-catalog/engine/fastpack', () => ({ unpackMeshes: (b: unknown) => b }));
vi.mock('@/components/cad-to-catalog/engine/materials', () => ({ metalByName: () => null }));
// The hidden preview viewer the hook makes for list thumbnails.
vi.mock('@/components/cad-to-catalog/engine/engine', () => ({
  CatalogEngine: class { isReady = true; open = async () => {}; capture = async () => new Blob(); dispose() {} },
}));

import { useCatalogShoot } from './useCatalogShoot';

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;
});

const FILE_BYTES = 1000;

function fakeEngine(over: Record<string, unknown> = {}) {
  return {
    hasModel: true,
    isReady: true,
    state: { info: null },
    pictureAspect: 1,
    open: vi.fn(async () => {}),
    choices: () => ({}),
    restoreChoices: vi.fn(),
    capture: vi.fn(async () => new Blob(['p'], { type: 'image/png' })),
    materialsText: () => 'band: Yellow Gold',
    withMetal: async (_id: unknown, fn: () => Promise<void>) => fn(),
    applyAngle: vi.fn(),
    maxPicturePx: () => 8192,
    ...over,
  } as unknown as CatalogEngine;
}

/** An engine whose open() asks for the server fastload, as a heavy .3dm does. */
const fastloadingEngine = () => fakeEngine({
  open: vi.fn(async (_f: unknown, _files: unknown, opts: { fastload?: (d: ArrayBuffer) => Promise<unknown> }) => {
    await opts.fastload?.(new ArrayBuffer(FILE_BYTES));
  }),
});

const SETTINGS = { metals: [], backgrounds: ['white', 'beach'], aspect: '1:1', resolution: '2K' };
const ONE_ANGLE = () => [{ name: 'Front', dir: [0, 0, 1] }];
const bgData = async () => 'data:image/jpeg;base64,b';

function setup(engine: CatalogEngine) {
  const hook = renderHook(() => useCatalogShoot(engine, vi.fn()));
  let id = '';
  act(() => { id = hook.result.current.addFiles([{ path: 'band.3dm', file: new File(['x'], 'band.3dm') }])[0]; });
  return { ...hook, id };
}

beforeEach(() => {
  vi.clearAllMocks();
  run.savePictures.mockResolvedValue([{ name: 'p', file: { url: 'u' } }]);
  run.placeOnBackground.mockResolvedValue({ workflowId: 'w', image: { url: 'https://x/photo' } });
  checkCreditsFor.mockResolvedValue(true);
});

const startedIds = () => track.trackCatalogShootStarted.mock.calls.map((c) => c[0].shoot_id);
const completed = () => track.trackCatalogShootCompleted.mock.calls.map((c) => c[0]);

describe('useCatalogShoot model load events', () => {
  it('fires catalog_model_loaded once per prepared file, not again when it is reopened', async () => {
    run.fastloadFile.mockResolvedValue({ skeleton: new ArrayBuffer(1), packed: new ArrayBuffer(1) });
    const { result, id } = setup(fastloadingEngine());
    await act(() => result.current.openPiece(id));
    await act(() => result.current.openPiece(id));
    expect(track.trackCatalogModelLoaded).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogModelLoaded).toHaveBeenCalledWith({ duration_ms: expect.any(Number), file_bytes: FILE_BYTES });
    expect(track.trackCatalogModelLoadFailed).not.toHaveBeenCalled();
  });

  it('fires catalog_model_load_failed with no error text when the fastload fails', async () => {
    run.fastloadFile.mockRejectedValue(new run.CatalogRunError('This file is too large to send.', 413));
    const { result, id } = setup(fastloadingEngine());
    await act(() => result.current.openPiece(id));
    expect(track.trackCatalogModelLoadFailed).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogModelLoadFailed).toHaveBeenCalledWith({ duration_ms: expect.any(Number), file_bytes: FILE_BYTES });
    expect(track.trackCatalogModelLoaded).not.toHaveBeenCalled();
  });

  it('does not report a fastload cancelled by leaving the page as a failure', async () => {
    let reject!: (e: Error) => void;
    run.fastloadFile.mockReturnValue(new Promise((_, r) => { reject = r; }));
    const { result, id, unmount } = setup(fastloadingEngine());
    let opening!: Promise<void>;
    act(() => { opening = result.current.openPiece(id); });
    unmount();
    reject(new run.CatalogRunError('cancelled'));
    await opening;
    expect(track.trackCatalogModelLoadFailed).not.toHaveBeenCalled();
  });
});

describe('useCatalogShoot shot and shoot events', () => {
  it('fires catalog_shot_completed per picture and catalog_shoot_completed once when all settle', async () => {
    const { result, id } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));

    expect(track.trackCatalogShotCompleted).toHaveBeenCalledTimes(2);
    expect(track.trackCatalogShotCompleted).toHaveBeenCalledWith({ kind: 'white', category: 'ring', resolution: '2K', duration_ms: expect.any(Number) });
    expect(track.trackCatalogShotCompleted).toHaveBeenCalledWith({ kind: 'photo', category: 'ring', resolution: '2K', duration_ms: expect.any(Number) });
    expect(track.trackCatalogShootCompleted).toHaveBeenCalledWith({ shoot_id: expect.any(String), succeeded: 2, failed: 0, stopped: false, abandoned: false, duration_ms: expect.any(Number) });
    expect(track.trackCatalogShotFailed).not.toHaveBeenCalled();
  });

  it('waits for runs still going after the drawing ends before firing catalog_shoot_completed', async () => {
    let land!: (v: unknown) => void;
    run.placeOnBackground.mockReturnValue(new Promise((r) => { land = r; }));
    const { result, id } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShotCompleted).toHaveBeenCalledTimes(1));
    expect(track.trackCatalogShootCompleted).not.toHaveBeenCalled();
    await act(async () => { land({ workflowId: 'w', image: { url: 'https://x/photo' } }); });
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
  });

  it('fires catalog_shot_failed at the run stage, without the error text, and counts it', async () => {
    run.savePictures.mockRejectedValue(new run.CatalogRunError("We couldn't finish that. Please try again."));
    const { result, id } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
    expect(track.trackCatalogShotFailed).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogShotFailed).toHaveBeenCalledWith({ kind: 'white', category: 'ring', resolution: '2K', failure_stage: 'run', duration_ms: expect.any(Number) });
    expect(track.trackCatalogShootCompleted).toHaveBeenCalledWith(expect.objectContaining({ succeeded: 1, failed: 1 }));
  });

  it('fires catalog_shot_failed at the draw stage when the picture cannot be drawn', async () => {
    const engine = fakeEngine();
    // Every capture fails: the list thumbnail (ignored by the hook) and both shoot pictures.
    (engine.capture as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('WebGL lost'));
    const { result, id } = setup(engine);
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
    expect(track.trackCatalogShotFailed).toHaveBeenCalledTimes(2);
    expect(track.trackCatalogShotFailed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo', failure_stage: 'draw' }));
    expect(track.trackCatalogShootCompleted).toHaveBeenCalledWith(expect.objectContaining({ succeeded: 0, failed: 2 }));
    expect(run.savePictures).not.toHaveBeenCalled();
  });

  it('fires no shot events for runs cut off by leaving the page, and closes the shoot as abandoned', async () => {
    run.savePictures.mockReturnValue(new Promise(() => {}));
    run.placeOnBackground.mockReturnValue(new Promise(() => {}));
    const { result, id, unmount } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    unmount();
    await new Promise((r) => setTimeout(r, 20));
    expect(track.trackCatalogShotCompleted).not.toHaveBeenCalled();
    expect(track.trackCatalogShotFailed).not.toHaveBeenCalled();
    // The shoot still closes, once, as abandoned with what had settled.
    expect(completed()).toEqual([{ shoot_id: startedIds()[0], succeeded: 0, failed: 0, stopped: false, abandoned: true, duration_ms: expect.any(Number) }]);
  });

  it('does not report a drawing cut off by leaving the page as a failed shot', async () => {
    const engine = fakeEngine();
    const fails: ((e: Error) => void)[] = [];
    (engine.capture as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((_, r) => { fails.push(r); }));
    const { result, id, unmount } = setup(engine);
    let shooting!: Promise<boolean>;
    act(() => { shooting = result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE); });
    // One capture is the list thumbnail on open, the next is the shoot's first picture.
    await waitFor(() => expect(fails.length).toBeGreaterThan(1));
    unmount();
    fails.forEach((f) => f(new Error('context lost')));
    await shooting;
    expect(track.trackCatalogShotFailed).not.toHaveBeenCalled();
    expect(completed()).toEqual([expect.objectContaining({ abandoned: true, succeeded: 0, failed: 0 })]);
  });

  it('fires no shoot events when the shoot never starts', async () => {
    const { result, id } = setup(fakeEngine({ maxPicturePx: () => 1024 }));
    await act(async () => { expect(await result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE)).toBe(false); });
    await new Promise((r) => setTimeout(r, 20));
    expect(track.trackCatalogShootStarted).not.toHaveBeenCalled();
    expect(track.trackCatalogShootCompleted).not.toHaveBeenCalled();
    // The device limit is not a paywall.
    expect(track.trackPaywallHit).not.toHaveBeenCalled();
  });

  it('fires catalog_shoot_started once the checks pass, joined to its completed by shoot_id', async () => {
    const { result, id } = setup(fakeEngine());
    await act(() => result.current.shoot([id], { ...SETTINGS, metals: ['Yellow Gold', 'White Gold'] }, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
    expect(track.trackCatalogShootStarted).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogShootStarted).toHaveBeenCalledWith({ shoot_id: expect.any(String), pieces: 1, pictures: 4, photo_backgrounds: 1, metals: 2 });
    expect(completed()[0].shoot_id).toBe(startedIds()[0]);
  });

  it('fires paywall_hit and no started or completed when credits block the shoot', async () => {
    checkCreditsFor.mockResolvedValue(false);
    const { result, id } = setup(fakeEngine());
    await act(async () => { expect(await result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE)).toBe(false); });
    expect(track.trackPaywallHit).toHaveBeenCalledTimes(1);
    expect(track.trackPaywallHit).toHaveBeenCalledWith({ category: 'ring', steps_completed: 4 });
    expect(track.trackCatalogShootStarted).not.toHaveBeenCalled();
    expect(track.trackCatalogShootCompleted).not.toHaveBeenCalled();
  });

  it('treats a retry as a new shoot: its own started and completed', async () => {
    const { result, id } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
    act(() => result.current.retry(id));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(2));
    expect(track.trackCatalogShootStarted).toHaveBeenCalledTimes(2);
    const [first, second] = startedIds();
    expect(first).not.toBe(second);
    expect(completed().map((c) => c.shoot_id)).toEqual([first, second]);
  });

  it('counts each result into the shoot that made it when shoots overlap', async () => {
    const { result, id } = setup(fakeEngine());
    let second = '';
    act(() => { second = result.current.addFiles([{ path: 'stud.3dm', file: new File(['y'], 'stud.3dm') }])[0]; });
    // The first shoot's photo is still being placed when the second shoot starts.
    let land!: (v: unknown) => void;
    run.placeOnBackground.mockReturnValueOnce(new Promise((r) => { land = r; }));
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShotCompleted).toHaveBeenCalledTimes(1));
    await act(() => result.current.shoot([second], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(1));
    const [firstId, secondId] = startedIds();
    expect(completed()[0]).toEqual(expect.objectContaining({ shoot_id: secondId, succeeded: 2, failed: 0 }));
    await act(async () => { land({ workflowId: 'w', image: { url: 'https://x/photo' } }); });
    await waitFor(() => expect(track.trackCatalogShootCompleted).toHaveBeenCalledTimes(2));
    expect(completed()[1]).toEqual(expect.objectContaining({ shoot_id: firstId, succeeded: 2, failed: 0, abandoned: false }));
  });

  it('closes a shoot cut off mid-run with the results it already had', async () => {
    run.placeOnBackground.mockReturnValue(new Promise(() => {}));
    const { result, id, unmount } = setup(fakeEngine());
    await act(() => result.current.shoot([id], SETTINGS, bgData, ONE_ANGLE));
    await waitFor(() => expect(track.trackCatalogShotCompleted).toHaveBeenCalledTimes(1));
    unmount();
    expect(completed()).toEqual([expect.objectContaining({ shoot_id: startedIds()[0], succeeded: 1, failed: 0, abandoned: true })]);
  });
});
