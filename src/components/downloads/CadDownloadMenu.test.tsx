import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CadDownloadMenu } from './CadDownloadMenu';

/**
 * The contract these tests protect: the .3dm is the deliverable people came
 * for, so it is always the one-click default; the .glb the backend also
 * produces is always reachable from the menu; and the edited export is only
 * offered when there is actually an edit to export.
 */

const noop = () => {};

/** Radix opens on pointerdown or keyboard, not on a synthetic click, so the
 *  chevron is driven the way a keyboard user would drive it. */
const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: /more download options/i }), { key: 'Enter' });

describe('CadDownloadMenu', () => {
  it('makes the 3dm the default action, reachable in one click', () => {
    const onDownloadThreedm = vi.fn();
    render(<CadDownloadMenu onDownloadThreedm={onDownloadThreedm} onDownloadGlb={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /download 3dm/i }));
    expect(onDownloadThreedm).toHaveBeenCalledTimes(1);
  });

  it('does not fire the default action when the chevron is opened', () => {
    const onDownloadThreedm = vi.fn();
    render(<CadDownloadMenu onDownloadThreedm={onDownloadThreedm} onDownloadGlb={noop} />);

    openMenu();
    expect(onDownloadThreedm).not.toHaveBeenCalled();
  });

  it('offers the glb from the menu', async () => {
    const onDownloadGlb = vi.fn();
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={onDownloadGlb} />);

    openMenu();
    fireEvent.click(await screen.findByText(/download glb/i));
    expect(onDownloadGlb).toHaveBeenCalledTimes(1);
  });

  it('hides the edited export when there are no edits', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);

    openMenu();
    await screen.findByText(/download glb/i);
    expect(screen.queryByText(/with my edits/i)).toBeNull();
  });

  it('offers the edited export once an edit exists', async () => {
    const onExportEdited = vi.fn();
    render(
      <CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} onExportEdited={onExportEdited} />,
    );

    openMenu();
    fireEvent.click(await screen.findByText(/with my edits/i));
    expect(onExportEdited).toHaveBeenCalledTimes(1);
  });

  it('falls back to the glb as the default action when no 3dm exists', () => {
    // Older runs predate ring_cad_nurbs_v1 and have no .3dm at all. The button
    // must still do something useful rather than render a dead default.
    const onDownloadGlb = vi.fn();
    render(<CadDownloadMenu onDownloadGlb={onDownloadGlb} />);

    fireEvent.click(screen.getByRole('button', { name: /download glb/i }));
    expect(onDownloadGlb).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no artifact at all', () => {
    const { container } = render(<CadDownloadMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not open the menu when the 3dm is the only artifact', () => {
    // A lone action needs no chevron: offering a menu with one item in it is
    // a dead affordance.
    render(<CadDownloadMenu onDownloadThreedm={noop} />);
    expect(screen.queryByRole('button', { name: /more download options/i })).toBeNull();
  });

  it('disables the default action while a download is in flight', () => {
    const onDownloadThreedm = vi.fn();
    render(
      <CadDownloadMenu onDownloadThreedm={onDownloadThreedm} onDownloadGlb={noop} isBusy />,
    );

    const button = screen.getByRole('button', { name: /preparing/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onDownloadThreedm).not.toHaveBeenCalled();
  });
});
