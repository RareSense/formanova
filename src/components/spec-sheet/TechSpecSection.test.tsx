import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const loadSpecSheet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/spec-sheet/pdf-render', () => ({ loadSpecSheet }));
const openVersionFile = vi.hoisted(() => vi.fn());
const saveVersionFile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cad-version-file', () => ({ openVersionFile, saveVersionFile }));

import { TechSpecSection, hasSpecSheet } from './TechSpecSection';

const PAGE_1 = 'data:image/png;base64,PAGE1';
const PAGE_2 = 'data:image/png;base64,PAGE2';

function sheet(pages = 2) {
  return { pageCount: pages, renderPage: vi.fn(async (page: number) => (page === 1 ? PAGE_1 : PAGE_2)) };
}

const thumbnail = () => screen.getByRole('button', { name: 'Open spec sheet preview' });

describe('hasSpecSheet', () => {
  it('is true only when the version lists a spec sheet', () => {
    expect(hasSpecSheet([{ kind: 'spec_sheet', filename: 's.pdf', bytes: 1 }])).toBe(true);
    expect(hasSpecSheet([{ kind: 'stl', filename: 'a.stl', bytes: 1 }])).toBe(false);
    expect(hasSpecSheet(undefined)).toBe(false);
  });
});

describe('TechSpecSection', () => {
  beforeEach(() => {
    loadSpecSheet.mockReset();
    openVersionFile.mockReset();
    saveVersionFile.mockReset();
  });

  it('loads the PDF lazily, shows a skeleton, then page 1 as the thumbnail', async () => {
    let resolve: (v: ReturnType<typeof sheet>) => void = () => {};
    loadSpecSheet.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    expect(screen.getByTestId('spec-sheet-skeleton')).toBeInTheDocument();
    // Loaded through a dynamic import, so only once the section is on screen.
    await waitFor(() => expect(loadSpecSheet).toHaveBeenCalledWith('v1'));
    await act(async () => { resolve(sheet()); });
    expect(await within(thumbnail()).findByRole('img', { name: 'Spec sheet, page 1' })).toHaveAttribute('src', PAGE_1);
    expect(screen.queryByTestId('spec-sheet-skeleton')).toBeNull();
  });

  it('overlays the review badge: open items, or none', async () => {
    loadSpecSheet.mockResolvedValue(sheet());
    const { unmount } = render(<TechSpecSection assetId="v1" openFlags={3} />);
    expect(within(thumbnail()).getByText('3 to review')).toBeInTheDocument();
    unmount();
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    expect(within(thumbnail()).getByText('No open items')).toBeInTheDocument();
  });

  it('shows no badge when the count is unknown', async () => {
    loadSpecSheet.mockResolvedValue(sheet());
    render(<TechSpecSection assetId="v1" openFlags={null} />);
    expect(within(thumbnail()).queryByText(/review|open items/)).toBeNull();
  });

  it('falls back to a document card, logs the error, and keeps the buttons when rendering fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadSpecSheet.mockRejectedValue(new Error('Invalid PDF structure'));
    render(<TechSpecSection assetId="v1" openFlags={1} />);
    expect(await screen.findByTestId('spec-sheet-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('spec-sheet-skeleton')).toBeNull();
    expect(error).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'View spec sheet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download spec sheet' })).toBeInTheDocument();
    error.mockRestore();
  });

  it('View shows the sheet in-app (the signed link only downloads), and Download saves it', async () => {
    loadSpecSheet.mockResolvedValue(sheet());
    render(<TechSpecSection assetId="v1" openFlags={0} source="image-to-cad" />);
    await within(thumbnail()).findByRole('img', { name: 'Spec sheet, page 1' });
    fireEvent.click(screen.getByRole('button', { name: 'View spec sheet' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(openVersionFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download spec sheet' })[0]);
    expect(saveVersionFile).toHaveBeenCalledWith('v1', 'spec_sheet', 'image-to-cad');
  });

  it('View falls back to the file link when the PDF cannot be read in-app', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadSpecSheet.mockRejectedValue(new Error('Invalid PDF structure'));
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    await screen.findByTestId('spec-sheet-fallback');
    fireEvent.click(screen.getByRole('button', { name: 'View spec sheet' }));
    expect(openVersionFile).toHaveBeenCalledWith('v1', 'spec_sheet');
    error.mockRestore();
  });

  it('keeps the card short in every state: the top of page 1 when it renders, the same height when it cannot', async () => {
    let resolve: (v: ReturnType<typeof sheet>) => void = () => {};
    loadSpecSheet.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = render(<TechSpecSection assetId="v1" openFlags={0} />);
    const short = (card: HTMLElement) => {
      expect(card).toHaveClass('h-[200px]', 'w-full', 'overflow-hidden');
      expect(card).not.toHaveClass('aspect-[210/297]');
    };
    short(thumbnail());
    await act(async () => { resolve(sheet()); });
    const image = await within(thumbnail()).findByRole('img', { name: 'Spec sheet, page 1' });
    // Cropped from the top: the header and key facts, not the middle of the page.
    expect(image).toHaveClass('object-cover', 'object-top');
    short(thumbnail());
    unmount();

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadSpecSheet.mockRejectedValue(new Error('worker failed'));
    render(<TechSpecSection assetId="v2" openFlags={0} />);
    const fallback = await screen.findByTestId('spec-sheet-fallback');
    expect(thumbnail()).toContainElement(fallback);
    short(thumbnail());
    error.mockRestore();
  });

  it('renders page 1 wide enough for the panel at its widest', async () => {
    const pdf = sheet();
    loadSpecSheet.mockResolvedValue(pdf);
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    await within(thumbnail()).findByRole('img');
    expect(pdf.renderPage).toHaveBeenCalledWith(1, 504);
  });

  it('View and Download are one size', () => {
    loadSpecSheet.mockResolvedValue(sheet());
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    for (const name of ['View spec sheet', 'Download spec sheet']) expect(screen.getByRole('button', { name })).toHaveClass('h-9', 'w-full');
  });

  it('opens a larger preview with page navigation, and closes it', async () => {
    const pdf = sheet(2);
    loadSpecSheet.mockResolvedValue(pdf);
    render(<TechSpecSection assetId="v1" openFlags={0} />);
    await within(thumbnail()).findByRole('img');
    fireEvent.click(thumbnail());
    const dialog = await screen.findByRole('dialog', { name: 'Spec sheet' });
    expect(within(dialog).getByText('Page 1 of 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Spec sheet, page 2' })).toHaveAttribute('src', PAGE_2));
    expect(within(dialog).getByText('Page 2 of 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'View spec sheet' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download spec sheet' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
