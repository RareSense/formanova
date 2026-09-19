import type React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VersionsPanel } from './VersionsPanel';

vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children, continuous }: { children: React.ReactNode; continuous?: boolean }) => (
    <div data-testid="scissor-grid" data-continuous={String(continuous)}>{children}</div>
  ),
  GLBPreviewSlot: ({ glbUrl }: { glbUrl: string }) => <div data-testid="version-glb" data-url={glbUrl} />,
}));
vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: (url?: string | null) => url ?? null,
}));

describe('VersionsPanel', () => {
  it('matches the four-column reference-image grid and renders each GLB', () => {
    const { container } = render(
      <VersionsPanel
        versions={[
          { asset_id: 'a1', position: 0, glb_url: '/v1.glb' },
          { asset_id: 'a2', position: 1, glb_url: '/v2.glb' },
        ]}
      />,
    );

    expect(container.querySelector('.grid')?.className).toContain('grid-cols-4');
    expect(screen.getAllByTestId('version-glb')).toHaveLength(2);
    expect(screen.getByTestId('scissor-grid').getAttribute('data-continuous')).toBe('false');
  });

  it('prefers saved thumbnails and avoids creating a WebGL renderer', () => {
    render(
      <VersionsPanel
        versions={[{ asset_id: 'a1', position: 0, thumbnail_url: '/v1.png', glb_url: '/v1.glb' }]}
      />,
    );

    expect(document.querySelector('img')?.getAttribute('src')).toBe('/v1.png');
    expect(screen.queryByTestId('version-glb')).toBeNull();
    expect(screen.queryByTestId('scissor-grid')).toBeNull();
  });
});
