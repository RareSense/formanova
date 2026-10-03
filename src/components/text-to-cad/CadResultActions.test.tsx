/**
 * The result action bar carries the download that used to sit in the viewport
 * toolbar, so these tests pin the two things that move can silently break:
 * the download still offers exactly what the run produced, and its size does
 * not depend on whether the Improve button is beside it.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { CadResultActions, CAD_RESULT_ACTION_ROW_SIZE } from './CadResultActions';
import { CAD_RESULT_ACTION_SIZE } from '@/components/downloads/CadDownloadMenu';

describe('CadResultActions', () => {
  it('shows one Download button when a 3DM exists', () => {
    render(<CadResultActions onDownloadThreedm={vi.fn()} onDownloadGlb={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
  });

  it('shows the Download button for GLB-only runs', () => {
    render(<CadResultActions onDownloadGlb={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
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

  it('shows Improve grayed out and unpressable when the version cannot be improved', () => {
    const onImprove = vi.fn();
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V2"
        onImproveFromVersion={onImprove}
        improveDisabled
      />,
    );
    const improve = screen.getByRole('button', { name: /improve from v2/i }) as HTMLButtonElement;
    expect(improve.disabled).toBe(true);
    fireEvent.click(improve);
    expect(onImprove).not.toHaveBeenCalled();
  });

  it('says it cannot be improved when the version has nothing left to fix', () => {
    const onImprove = vi.fn();
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V3"
        onImproveFromVersion={onImprove}
        improveDisabled
        improveExhausted
      />,
    );
    const button = screen.getByRole('button', { name: "Can't be improved" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onImprove).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /improve from/i })).toBeNull();
    for (const size of CAD_RESULT_ACTION_SIZE.split(' ')) expect(button.className).toContain(size);
  });

  it('keeps Improve pressable when the version can be improved', () => {
    const onImprove = vi.fn();
    render(<CadResultActions latestVersionLabel="V2" onImproveFromVersion={onImprove} />);
    fireEvent.click(screen.getByRole('button', { name: /improve from v2/i }));
    expect(onImprove).toHaveBeenCalledTimes(1);
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
    const download = screen.getByRole('button', { name: /^download$/i });
    for (const size of CAD_RESULT_ACTION_SIZE.split(' ')) {
      expect(improve.className).toContain(size);
      expect(download.className).toContain(size);
    }
    expect(download.className).not.toContain('flex-1');
  });

  it('keeps Download light and Improve dark independently of theme', () => {
    render(
      <CadResultActions
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V2"
        onImproveFromVersion={vi.fn()}
      />,
    );
    const improve = screen.getByRole('button', { name: /improve from v2/i });
    const download = screen.getByRole('button', { name: /^download$/i });
    expect(improve.className).toContain('bg-zinc-950');
    expect(download.className).toContain('bg-white');
    expect(improve.className).toContain('text-white');
    expect(download.className).toContain('text-zinc-950');
  });

  it('row layout puts both controls side by side at one shared size', () => {
    const { container } = render(
      <CadResultActions
        layout="row"
        onDownloadThreedm={vi.fn()}
        latestVersionLabel="V3"
        onImproveFromVersion={vi.fn()}
      />,
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain('grid-cols-2');
    expect(bar.className).not.toContain('absolute');
    const improve = screen.getByRole('button', { name: /improve v3/i });
    const download = screen.getByRole('button', { name: /^download$/i });
    for (const size of CAD_RESULT_ACTION_ROW_SIZE.split(' ')) {
      expect(improve.className).toContain(size);
      expect(download.className).toContain(size);
    }
  });

  it('row layout gives a lone Download the whole row', () => {
    const { container } = render(<CadResultActions layout="row" onDownloadGlb={vi.fn()} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('grid-cols-1');
  });

  it('row layout says it cannot be improved in a phone-sized label', () => {
    render(
      <CadResultActions layout="row" onDownloadGlb={vi.fn()} latestVersionLabel="V3" onImproveFromVersion={vi.fn()} improveDisabled improveExhausted />,
    );
    expect((screen.getByRole('button', { name: "Can't improve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders nothing when the run produced no downloadable artifact', () => {
    const { container } = render(<CadResultActions />);
    expect(container.querySelector('button')).toBeNull();
  });
});
