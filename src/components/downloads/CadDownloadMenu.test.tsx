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

  // One case per format: opening the menu five times in a single test ran past
  // the 5 s test limit on a loaded machine.
  it.each([
    ['Rhino, editable', 'onDownloadThreedm'],
    ['3D preview', 'onDownloadGlb'],
    ['Viewer only (mesh)', 'onDownloadViewerThreedm'],
    ['Other CAD software', 'onDownloadStep'],
    ['3D printing', 'onDownloadStl'],
  ] as const)('downloads the format that was chosen: %s', async (hint, handler) => {
    const handlers = {
      onDownloadThreedm: vi.fn(),
      onDownloadGlb: vi.fn(),
      onDownloadViewerThreedm: vi.fn(),
      onDownloadStep: vi.fn(),
      onDownloadStl: vi.fn(),
    };
    render(<CadDownloadMenu {...handlers} />);

    openMenu();
    fireEvent.click(await screen.findByText(hint));

    for (const [name, fn] of Object.entries(handlers)) {
      expect(fn).toHaveBeenCalledTimes(name === handler ? 1 : 0);
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

describe('CadDownloadMenu casting files', () => {
  it('hides Casting STL and Stone list when the run has neither', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} onDownloadStl={noop} />);

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(screen.queryByText('Casting STL')).toBeNull();
    expect(screen.queryByText('Stone list')).toBeNull();
  });

  it('adds Casting STL and Stone list after the existing formats, which stay unchanged', async () => {
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        onDownloadStep={noop}
        onDownloadStl={noop}
        onDownloadCastingStl={noop}
        onDownloadStones={noop}
      />,
    );

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(menuRows()).toEqual([
      '3DMRhino, editable',
      'GLB3D preview',
      'STEPOther CAD software',
      'STL3D printing',
      'Casting STLFor your manufacturer',
      'Stone listStones to set after casting',
    ]);
  });

  it('shows Casting STL without a Stone list when there are no stones', async () => {
    render(<CadDownloadMenu onDownloadGlb={noop} onDownloadCastingStl={noop} />);

    openMenu();
    await screen.findByText('For your manufacturer');
    expect(screen.queryByText('Stone list')).toBeNull();
  });

  it('shows the check note under Casting STL and still downloads it', async () => {
    const onDownloadCastingStl = vi.fn();
    const onDownloadStones = vi.fn();
    render(
      <CadDownloadMenu
        onDownloadGlb={noop}
        onDownloadCastingStl={onDownloadCastingStl}
        castingNote="Your manufacturer may want to check: some walls are thin."
        onDownloadStones={onDownloadStones}
      />,
    );

    openMenu();
    const note = await screen.findByText('Your manufacturer may want to check: some walls are thin.');
    fireEvent.click(note);
    expect(onDownloadCastingStl).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(await screen.findByText('Stones to set after casting'));
    expect(onDownloadStones).toHaveBeenCalledTimes(1);
  });
});
