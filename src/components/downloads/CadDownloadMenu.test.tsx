import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CadDownloadMenu } from './CadDownloadMenu';

/**
 * The contract: one Download button. Pressing it never downloads by itself;
 * it opens the list of formats this run actually has, in a fixed order, each
 * with a plain-English hint, so nobody grabs the wrong file by accident.
 */

const noop = () => {};

/** Radix opens on pointerdown or keyboard, not on a synthetic click. */
const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: /^download$/i }), { key: 'Enter' });

const menuRows = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('CadDownloadMenu', () => {
  it('opens the format list without downloading anything', async () => {
    const onDownloadThreedm = vi.fn();
    render(<CadDownloadMenu onDownloadThreedm={onDownloadThreedm} onDownloadGlb={noop} />);

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(onDownloadThreedm).not.toHaveBeenCalled();
  });

  it('lists every format in a fixed order with a hint', async () => {
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        onDownloadViewerThreedm={noop}
        onDownloadStep={noop}
        onDownloadStl={noop}
      />,
    );

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(menuRows()).toEqual([
      '3DMRhino, editable',
      'GLB3D preview',
      '3DMViewer only (mesh)',
      'STEPOther CAD software',
      'STL3D printing',
    ]);
  });

  it('downloads the format that was chosen', async () => {
    const handlers = {
      onDownloadThreedm: vi.fn(),
      onDownloadGlb: vi.fn(),
      onDownloadViewerThreedm: vi.fn(),
      onDownloadStep: vi.fn(),
      onDownloadStl: vi.fn(),
    };
    render(<CadDownloadMenu {...handlers} />);

    const cases: [string, keyof typeof handlers][] = [
      ['Rhino, editable', 'onDownloadThreedm'],
      ['3D preview', 'onDownloadGlb'],
      ['Viewer only (mesh)', 'onDownloadViewerThreedm'],
      ['Other CAD software', 'onDownloadStep'],
      ['3D printing', 'onDownloadStl'],
    ];
    for (const [hint, handler] of cases) {
      openMenu();
      fireEvent.click(await screen.findByText(hint));
      expect(handlers[handler]).toHaveBeenCalledTimes(1);
    }
  });

  it('shows only the formats this run has', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(menuRows()).toEqual(['3DMRhino, editable', 'GLB3D preview']);
  });

  it('offers the edited export only once there is an edit', async () => {
    const onExportEdited = vi.fn();
    const { unmount } = render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);
    openMenu();
    await screen.findByText('Rhino, editable');
    expect(screen.queryByText('With my edits')).toBeNull();
    unmount();

    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} onExportEdited={onExportEdited} />);
    openMenu();
    fireEvent.click(await screen.findByText('With my edits'));
    expect(onExportEdited).toHaveBeenCalledTimes(1);
  });

  it('shows the estimated metal weight above the formats', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} estimatedMetalMassG={4.214} />);

    openMenu();
    expect(await screen.findByText(/est\. metal weight: 4\.21 g/i)).toBeInTheDocument();
  });

  it('works for older runs that only have a GLB', async () => {
    const onDownloadGlb = vi.fn();
    render(<CadDownloadMenu onDownloadGlb={onDownloadGlb} />);

    openMenu();
    fireEvent.click(await screen.findByText('3D preview'));
    expect(onDownloadGlb).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no artifact at all', () => {
    const { container } = render(<CadDownloadMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is disabled and says so while a download is in flight', () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} isBusy />);

    const button = screen.getByRole('button', { name: /preparing/i });
    expect(button).toBeDisabled();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
