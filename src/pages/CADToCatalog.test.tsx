import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

const track = vi.hoisted(() => ({
  trackCatalogOpened: vi.fn(),
  trackCatalogFileUploaded: vi.fn(),
  trackCatalogShootStarted: vi.fn(),
  trackDownloadClicked: vi.fn(),
  trackPaywallHit: vi.fn(),
}));
vi.mock('@/lib/posthog-events', () => track);

const shoot = vi.hoisted(() => ({
  queue: { pieces: [] as { id: string; name: string; category: string }[], pictures: [], running: false, paused: false },
  openId: 'already-open' as string | null,
  opening: false,
  openingText: null,
  addFiles: vi.fn(),
  openPiece: vi.fn(),
  remove: vi.fn(),
  setCategory: vi.fn(),
  shoot: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  retry: vi.fn(),
  downloadAll: vi.fn(),
}));
vi.mock('@/hooks/useCatalogShoot', () => ({ useCatalogShoot: () => shoot }));
vi.mock('@/components/cad-to-catalog/useEngineState', () => ({ useEngineState: () => ({ parts: [], ready: false }) }));
vi.mock('@/hooks/use-cad-breakpoint', () => ({ useCadBreakpoint: () => 'desktop' }));
vi.mock('@/lib/cad-to-catalog-run', () => ({ picturePrice: () => new Promise(() => {}), blobToDataUrl: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/components/text-to-cad/CadWorkspaceLayout', () => ({
  CadWorkspaceLayout: ({ left }: { left: ReactNode }) => <div>{left}</div>,
}));
vi.mock('@/components/cad/CADRuntimeErrorBoundary', () => ({ CADRuntimeErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/cad-to-catalog/CatalogViewer', () => ({ default: () => null }));
vi.mock('@/components/cad-to-catalog/PartsPanel', () => ({ default: () => null }));
vi.mock('@/components/cad-to-catalog/PicturesStrip', () => ({ default: () => null }));
vi.mock('@/components/cad-to-catalog/ShootSteps', () => ({
  default: ({ onShootAll }: { onShootAll: () => void }) => <button onClick={onShootAll}>shoot</button>,
}));
vi.mock('@/components/cad-to-catalog/BackgroundLibrary', () => ({ default: () => null }));
vi.mock('@/components/cad-to-catalog/PiecesPanel', () => ({
  default: ({ onFiles }: { onFiles: (e: { path: string; file: File }[]) => void }) => (
    <button onClick={() => onFiles([{ path: 'a.3dm', file: new File(['x'], 'a.3dm') }, { path: 'b.3dm', file: new File(['x'], 'b.3dm') }])}>add</button>
  ),
}));

import CADToCatalog from './CADToCatalog';

beforeEach(() => {
  vi.clearAllMocks();
  shoot.queue.pieces = [{ id: 'old', name: 'old.3dm', category: 'ring' }];
});

describe('CADToCatalog analytics', () => {
  it('fires catalog_opened once on page entry, not again on re-render', () => {
    const { rerender } = render(<CADToCatalog />);
    rerender(<CADToCatalog />);
    expect(track.trackCatalogOpened).toHaveBeenCalledTimes(1);
  });

  it('fires catalog_file_uploaded with the new and running piece counts', () => {
    shoot.addFiles.mockReturnValue(['a', 'b']);
    const { getByText } = render(<CADToCatalog />);
    fireEvent.click(getByText('add'));
    expect(track.trackCatalogFileUploaded).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogFileUploaded).toHaveBeenCalledWith({ piece_count: 2, total_after_add: 3 });
  });

  it('does not fire catalog_file_uploaded when nothing new was added', () => {
    shoot.addFiles.mockReturnValue([]);
    const { getByText } = render(<CADToCatalog />);
    fireEvent.click(getByText('add'));
    expect(track.trackCatalogFileUploaded).not.toHaveBeenCalled();
  });
});

describe('CADToCatalog shoot start', () => {
  it('leaves catalog_shoot_started and paywall_hit to the hook, which knows whether the shoot really started', async () => {
    shoot.shoot.mockResolvedValue(false);
    const { getByText } = render(<CADToCatalog />);
    fireEvent.click(getByText('shoot'));
    await Promise.resolve();
    expect(shoot.shoot).toHaveBeenCalledTimes(1);
    expect(track.trackCatalogShootStarted).not.toHaveBeenCalled();
    expect(track.trackPaywallHit).not.toHaveBeenCalled();
  });
});
