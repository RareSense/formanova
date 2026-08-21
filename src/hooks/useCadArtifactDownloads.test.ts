import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockDownloadCadArtifact = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cad-artifact-download', () => ({
  downloadCadArtifact: mockDownloadCadArtifact,
}));

const mockTrackDownloadClicked = vi.hoisted(() => vi.fn());
vi.mock('@/lib/posthog-events', () => ({
  trackDownloadClicked: mockTrackDownloadClicked,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useCadArtifactDownloads } from './useCadArtifactDownloads';

beforeEach(() => {
  vi.clearAllMocks();
  mockDownloadCadArtifact.mockResolvedValue(undefined);
});

const setup = (overrides = {}) =>
  renderHook(() =>
    useCadArtifactDownloads({
      threedmUrl: 'https://api/artifacts/aaa',
      glbUrl: 'https://api/artifacts/bbb',
      source: 'text-to-cad',
      ...overrides,
    }),
  );

describe('useCadArtifactDownloads', () => {
  it('saves the 3dm straight from the backend URL', async () => {
    const { result } = setup();
    await act(async () => { await result.current.downloadThreedm(); });

    const [url, , kind] = mockDownloadCadArtifact.mock.calls[0];
    expect(url).toBe('https://api/artifacts/aaa');
    expect(kind).toBe('3dm');
  });

  it('saves the GLB straight from the backend URL, not a re-export', async () => {
    // The regression this guards: the studio used to hand back a three.js
    // re-encode of the live scene, which renders differently from the file the
    // backend produced.
    const exportEditedBlob = vi.fn();
    const { result } = setup({ exportEditedBlob });
    await act(async () => { await result.current.downloadGlb(); });

    const [url, , kind] = mockDownloadCadArtifact.mock.calls[0];
    expect(url).toBe('https://api/artifacts/bbb');
    expect(kind).toBe('glb');
    expect(exportEditedBlob).not.toHaveBeenCalled();
  });

  it('uses the scene export only for the explicit edited export', async () => {
    const blob = new Blob(['x']);
    const exportEditedBlob = vi.fn().mockResolvedValue(blob);
    const { result } = setup({ exportEditedBlob });

    await act(async () => { await result.current.exportEdited(); });
    expect(exportEditedBlob).toHaveBeenCalledTimes(1);
    // Goes out directly; it is not a backend artifact, so it has no hash to
    // verify and must not be routed through the artifact validator.
    expect(mockDownloadCadArtifact).not.toHaveBeenCalled();
  });

  it('reports which CAD tool the download came from', async () => {
    const { result } = setup({ source: 'image-to-cad' });
    await act(async () => { await result.current.downloadThreedm(); });

    await waitFor(() => expect(mockTrackDownloadClicked).toHaveBeenCalled());
    expect(mockTrackDownloadClicked.mock.calls[0][0]).toMatchObject({
      file_type: '3dm',
      source: 'image-to-cad',
    });
  });

  it('does nothing when the artifact is missing', async () => {
    const { result } = setup({ threedmUrl: null });
    await act(async () => { await result.current.downloadThreedm(); });
    expect(mockDownloadCadArtifact).not.toHaveBeenCalled();
  });

  it('clears the busy flag after a failure so the button is not stuck', async () => {
    mockDownloadCadArtifact.mockRejectedValue(new Error('truncated'));
    const { result } = setup();

    await act(async () => { await result.current.downloadThreedm(); });
    expect(result.current.isBusy).toBe(false);
  });

  it('ignores a second click while one download is already running', async () => {
    let release: () => void = () => {};
    mockDownloadCadArtifact.mockImplementation(
      () => new Promise<void>(resolve => { release = () => resolve(); }),
    );
    const { result } = setup();

    act(() => { void result.current.downloadThreedm(); });
    await waitFor(() => expect(result.current.isBusy).toBe(true));
    await act(async () => { await result.current.downloadGlb(); });

    expect(mockDownloadCadArtifact).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });
});
