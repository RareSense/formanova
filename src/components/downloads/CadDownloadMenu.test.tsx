import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/posthog-events', () => ({ trackDownloadClicked: vi.fn() }));
vi.mock('@/lib/cad-versions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cad-versions-api')>();
  return { ...actual, fetchVersionDownloadLink: vi.fn() };
});

import { toast } from 'sonner';
import { CadDownloadUnavailableError, fetchVersionDownloadLink, type CadVersionDownload } from '@/lib/cad-versions-api';
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
    await screen.findByText('(full editable model, for your CAD technician to fix anything that\'s off)');
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
    await screen.findByText('(full editable model, for your CAD technician to fix anything that\'s off)');
    expect(menuRows()).toEqual([
      'GLB(3D preview for your phone, browser or AR)',
      '3DM(full editable model, for your CAD technician to fix anything that\'s off)',
      '3DM(simple copy to look at in any 3D program, not for editing)',
      'STEP(opens in any CAD program, for your CAD technician or manufacturer)',
      'STL(metal and stones together, to preview or 3D print a sample)',
    ]);
  });

  // One case per format: opening the menu five times in a single test ran past
  // the 5 s test limit on a loaded machine.
  it.each([
    ['(full editable model, for your CAD technician to fix anything that\'s off)', 'onDownloadThreedm'],
    ['(3D preview for your phone, browser or AR)', 'onDownloadGlb'],
    ['(simple copy to look at in any 3D program, not for editing)', 'onDownloadViewerThreedm'],
    ['(opens in any CAD program, for your CAD technician or manufacturer)', 'onDownloadStep'],
    ['(metal and stones together, to preview or 3D print a sample)', 'onDownloadStl'],
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
    await screen.findByText('(full editable model, for your CAD technician to fix anything that\'s off)');
    expect(menuRows()).toEqual(['GLB(3D preview for your phone, browser or AR)', '3DM(full editable model, for your CAD technician to fix anything that\'s off)']);
  });

  it('offers the edited export only once there is an edit', async () => {
    const onExportEdited = vi.fn();
    const { unmount } = render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);
    openMenu();
    await screen.findByText('(full editable model, for your CAD technician to fix anything that\'s off)');
    expect(screen.queryByText('With my edits')).toBeNull();
    unmount();

    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} onExportEdited={onExportEdited} />);
    openMenu();
    fireEvent.click(await screen.findByText('With my edits'));
    expect(onExportEdited).toHaveBeenCalledTimes(1);
  });

  it('shows the metal and its weight above the formats, units in lower case', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} metalWeightLine="Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt" />);

    openMenu();
    const line = await screen.findByText('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt');
    expect(line).not.toHaveClass('uppercase');
  });

  it('shows no weight line when there is none', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} metalWeightLine={null} />);

    openMenu();
    await screen.findByText('(full editable model, for your CAD technician to fix anything that\'s off)');
    expect(screen.queryByText(/^Metal:/)).toBeNull();
  });

  it('works for older runs that only have a GLB', async () => {
    const onDownloadGlb = vi.fn();
    render(<CadDownloadMenu onDownloadGlb={onDownloadGlb} />);

    openMenu();
    fireEvent.click(await screen.findByText('(3D preview for your phone, browser or AR)'));
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

/**
 * The model's complete files, listed on its version by GET /api/cad/models.
 * Each press asks for a fresh, short-lived link and then follows it.
 */
describe('CadDownloadMenu: files from the version', () => {
  const linkMock = vi.mocked(fetchVersionDownloadLink);
  const ALL: CadVersionDownload[] = [
    { kind: 'threedm', filename: 'ring.3dm', bytes: 10 },
    { kind: 'stl', filename: 'ring.stl', bytes: 10 },
    { kind: 'step', filename: 'ring.step', bytes: 10 },
    { kind: 'casting_stl', filename: 'ring-casting.stl', bytes: 10 },
    { kind: 'stones', filename: 'ring-stones.csv', bytes: 10 },
  ];
  const LABELS = {
    stl: '(metal and stones together, to preview or 3D print a sample)',
    step: '(opens in any CAD program, for your CAD technician or manufacturer)',
    casting_stl: '(give this to your caster)',
    stones: '(stone sizes and counts, give it to your stone setter)',
  };

  beforeEach(() => {
    linkMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("lists only the kinds the version has, with their labels, after today's items", async () => {
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        versionDownloads={{ assetId: 'v1', downloads: [ALL[3], ALL[4]] }}
      />,
    );

    openMenu();
    await screen.findByText(LABELS.casting_stl);
    expect(screen.getByText(LABELS.stones)).toBeInTheDocument();
    expect(screen.queryByText(LABELS.stl)).toBeNull();
    expect(screen.queryByText(LABELS.step)).toBeNull();
    const rows = menuRows();
    expect(rows.slice(0, 2)).toEqual(['GLB(3D preview for your phone, browser or AR)', '3DM(full editable model, for your CAD technician to fix anything that\'s off)']);
    expect(rows).toHaveLength(4);
  });

  it('names the format after the file extension, or LIST when there is none', async () => {
    render(
      <CadDownloadMenu
        onDownloadGlb={noop}
        versionDownloads={{ assetId: 'v1', downloads: [
          { kind: 'stones', filename: 'ring-stones.csv', bytes: 1 },
          { kind: 'casting_stl', filename: 'casting', bytes: 1 },
        ] }}
      />,
    );

    openMenu();
    await screen.findByText(LABELS.stones);
    const rows = menuRows();
    expect(rows).toContain(`CSV${LABELS.stones}`);
    expect(rows).toContain(`LIST${LABELS.casting_stl}`);
  });

  it("shows one item per kind: the version's STL and STEP replace the run's, the 3DM keeps today's item", async () => {
    const onDownloadStl = vi.fn();
    const onDownloadStep = vi.fn();
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        onDownloadStl={onDownloadStl}
        onDownloadStep={onDownloadStep}
        versionDownloads={{ assetId: 'v1', downloads: ALL }}
      />,
    );

    openMenu();
    await screen.findByText(LABELS.stl);
    expect(screen.getAllByText('(metal and stones together, to preview or 3D print a sample)')).toHaveLength(1);
    expect(screen.getAllByText('(opens in any CAD program, for your CAD technician or manufacturer)')).toHaveLength(1);
    expect(screen.getAllByText('(full editable model, for your CAD technician to fix anything that\'s off)')).toHaveLength(1);
    for (const label of Object.values(LABELS)) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it("keeps the run's STL and STEP items when the version does not list them", async () => {
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        onDownloadStl={noop}
        onDownloadStep={noop}
        versionDownloads={{ assetId: 'v1', downloads: [ALL[4]] }}
      />,
    );

    openMenu();
    await screen.findByText(LABELS.stones);
    expect(screen.getByText('(metal and stones together, to preview or 3D print a sample)')).toBeInTheDocument();
    expect(screen.getByText('(opens in any CAD program, for your CAD technician or manufacturer)')).toBeInTheDocument();
  });

  it('fetches a fresh link on every press and follows it', async () => {
    const clicked: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
    linkMock
      .mockResolvedValueOnce({ url: 'https://blob.example/one', expires_at: 'x', filename: 'ring-casting.stl' })
      .mockResolvedValueOnce({ url: 'https://blob.example/two', expires_at: 'x', filename: 'ring-casting.stl' });

    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: ALL }} />);

    openMenu();
    fireEvent.click(await screen.findByText(LABELS.casting_stl));
    await waitFor(() => expect(clicked).toEqual(['https://blob.example/one']));
    openMenu();
    fireEvent.click(await screen.findByText(LABELS.casting_stl));
    await waitFor(() => expect(clicked).toEqual(['https://blob.example/one', 'https://blob.example/two']));

    expect(linkMock).toHaveBeenCalledTimes(2);
    expect(linkMock).toHaveBeenNthCalledWith(1, 'v1', 'casting_stl');
    expect(linkMock).toHaveBeenNthCalledWith(2, 'v1', 'casting_stl');
    clickSpy.mockRestore();
  });

  it('says the file is not available when the link request is a 404', async () => {
    linkMock.mockRejectedValueOnce(new CadDownloadUnavailableError());
    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: ALL }} />);

    openMenu();
    fireEvent.click(await screen.findByText(LABELS.stones));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That file isn't available for this model."));
  });

  it('asks to try again on any other failure', async () => {
    linkMock.mockRejectedValueOnce(new Error('boom'));
    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: ALL }} />);

    openMenu();
    fireEvent.click(await screen.findByText(LABELS.step));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't get the download link. Try again."));
  });
});

describe('CadDownloadMenu: the spec sheet and Download all', () => {
  const linkMock = vi.mocked(fetchVersionDownloadLink);
  const FILES: CadVersionDownload[] = [
    { kind: 'stl', filename: 'ring.stl', bytes: 10 },
    { kind: 'casting_stl', filename: 'ring-casting.stl', bytes: 10 },
    { kind: 'stones', filename: 'ring-stones.json', bytes: 10 },
  ];
  const SHEET: CadVersionDownload = { kind: 'spec_sheet', filename: 'ring-spec-sheet.pdf', bytes: 10 };

  beforeEach(() => {
    linkMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('renders exactly as before when the version has no spec sheet: no PDF, no Download all', async () => {
    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: FILES }} />);
    openMenu();
    await screen.findByText('(give this to your caster)');
    expect(menuRows()).toEqual([
      'GLB(3D preview for your phone, browser or AR)',
      'STL(metal and stones together, to preview or 3D print a sample)',
      'STL(give this to your caster)',
      'JSON(stone sizes and counts, give it to your stone setter)',
    ]);
    expect(screen.queryByText(/spec sheet/i)).toBeNull();
    expect(screen.queryByText('Download all')).toBeNull();
  });

  it('lists the spec sheet last with its open-flag count beside it', async () => {
    render(
      <CadDownloadMenu
        onDownloadGlb={noop}
        versionDownloads={{ assetId: 'v1', downloads: [SHEET, ...FILES], specSheetOpenFlags: 3 }}
      />,
    );
    openMenu();
    const item = (await screen.findByText('(sizes, weight and notes for the workshop)')).closest('[role="menuitem"]');
    expect(item?.textContent).toBe('PDF(sizes, weight and notes for the workshop)3 open flags');
    const rows = menuRows();
    expect(rows[rows.length - 2]).toBe('PDF(sizes, weight and notes for the workshop)3 open flags');
    expect(rows[rows.length - 1]).toBe('ALLDownload all');
  });

  it('says 1 open flag in the singular, and shows no count when the version sends none', async () => {
    const { unmount } = render(
      <CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: [SHEET], specSheetOpenFlags: 1 }} />,
    );
    openMenu();
    expect(await screen.findByText('1 open flag')).toBeInTheDocument();
    unmount();
    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: [SHEET] }} />);
    openMenu();
    const item = (await screen.findByText('(sizes, weight and notes for the workshop)')).closest('[role="menuitem"]');
    expect(item?.textContent).toBe('PDF(sizes, weight and notes for the workshop)');
  });

  it('fetches the spec sheet through a fresh link like the other files', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    linkMock.mockResolvedValue({ url: 'https://blob.example/sheet', expires_at: 'x', filename: 'ring-spec-sheet.pdf' });
    render(<CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: [SHEET], specSheetOpenFlags: 2 }} />);
    openMenu();
    fireEvent.click(await screen.findByText('(sizes, weight and notes for the workshop)'));
    await waitFor(() => expect(linkMock).toHaveBeenCalledWith('v1', 'spec_sheet'));
    clickSpy.mockRestore();
  });

  it('Download all saves every version file, the spec sheet included, one fresh link at a time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const clicked: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    let inFlight = 0;
    let most = 0;
    linkMock.mockImplementation(async (_asset, kind) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { url: `https://blob.example/${kind}`, expires_at: 'x', filename: `ring-${kind}` };
    });
    render(
      <CadDownloadMenu onDownloadGlb={noop} versionDownloads={{ assetId: 'v1', downloads: [SHEET, ...FILES], specSheetOpenFlags: 0 }} />,
    );
    openMenu();
    fireEvent.click(await screen.findByText('Download all'));
    await waitFor(() => expect(clicked).toHaveLength(4), { timeout: 5000 });
    expect(linkMock.mock.calls.map((call) => call[1])).toEqual(['stl', 'casting_stl', 'stones', 'spec_sheet']);
    expect(clicked).toEqual(['ring-stl', 'ring-casting_stl', 'ring-stones', 'ring-spec_sheet']);
    expect(most).toBe(1);
    clickSpy.mockRestore();
    vi.useRealTimers();
  });
});
