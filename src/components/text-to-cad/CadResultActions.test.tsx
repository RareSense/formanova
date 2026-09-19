/**
 * The result action bar carries the download that used to sit in the viewport
 * toolbar, so these tests pin the two things that move can silently break:
 * the download still offers exactly what the run produced, and its size does
 * not depend on whether the Improve button is beside it.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { CadResultActions } from './CadResultActions';
import { CAD_RESULT_ACTION_SIZE } from '@/components/downloads/CadDownloadMenu';

describe('CadResultActions', () => {
  it('shows the 3DM download as the default action', () => {
    render(<CadResultActions onDownloadThreedm={vi.fn()} onDownloadGlb={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download 3dm/i })).toBeTruthy();
  });

  it('falls back to the GLB for runs that never produced a 3DM', () => {
    render(<CadResultActions onDownloadGlb={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download glb/i })).toBeTruthy();
  });

  it('hides the Improve action until the run reports a version', () => {
    render(<CadResultActions onDownloadThreedm={vi.fn()} onImproveFromVersion={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /improve from/i })).toBeNull();
  });

  it('shows the Improve action for the latest version', () => {
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V3"
        onImproveFromVersion={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /improve from v3/i })).toBeTruthy();
  });

  it('gives both controls the same size, so siblings stay equal', () => {
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V3"
        onImproveFromVersion={vi.fn()}
      />,
    );
    const improve = screen.getByRole('button', { name: /improve from v3/i });
    const download = screen.getByRole('button', { name: /download 3dm/i });
    for (const size of CAD_RESULT_ACTION_SIZE.split(' ')) {
      expect(improve.className).toContain(size);
      expect(download.className).toContain(size);
    }
  });

  it('gives Download and Improve the same theme-aware color treatment', () => {
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V2"
        onImproveFromVersion={vi.fn()}
      />,
    );
    const improve = screen.getByRole('button', { name: /improve from v2/i });
    const download = screen.getByRole('button', { name: /download 3dm/i });
    expect(improve.className).toContain('bg-primary');
    expect(download.className).toContain('bg-primary');
    expect(improve.className).toContain('text-primary-foreground');
    expect(download.className).toContain('text-primary-foreground');
  });

  it('renders nothing when the run produced no downloadable artifact', () => {
    const { container } = render(<CadResultActions />);
    expect(container.querySelector('button')).toBeNull();
  });
});
