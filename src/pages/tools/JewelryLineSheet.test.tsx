import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import JewelryLineSheet from './JewelryLineSheet';
import { trackLineSheetDownloaded, trackLineSheetFailed, trackLineSheetStarted } from '@/lib/posthog-events';
import { buildLineSheetPdf } from '@/lib/line-sheet/pdf';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/lib/posthog-events', () => ({
  trackLineSheetStarted: vi.fn(),
  trackLineSheetDownloaded: vi.fn(),
  trackLineSheetFailed: vi.fn(),
  trackLineSheetCtaClicked: vi.fn(),
}));

const save = vi.fn();
vi.mock('@/lib/line-sheet/pdf', () => ({ buildLineSheetPdf: vi.fn(async () => ({ save })) }));

// The preview measures text with a canvas, which jsdom does not provide.
vi.mock('@/components/line-sheet/SheetPreview', () => ({ SheetPreview: () => null }));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HelmetProvider>
        <MemoryRouter>
          <JewelryLineSheet />
        </MemoryRouter>
      </HelmetProvider>,
    );
  });
  return container;
}

/** Types a piece name into the blank row, as a jeweler would. */
function typePiece(el: HTMLElement, name: string) {
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name, row 1"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickDownload(el: HTMLElement) {
  const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Download PDF'))!;
  await act(async () => {
    button.click();
  });
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('JewelryLineSheet analytics', () => {
  it('keeps Download disabled until there is a piece, then tracks the start once', () => {
    const el = renderPage();
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Download PDF'))!;
    expect(button.disabled).toBe(true);
    typePiece(el, 'Halo Ring');
    expect(button.disabled).toBe(false);
    expect(trackLineSheetStarted).toHaveBeenCalledTimes(1);
    expect(trackLineSheetStarted).toHaveBeenCalledWith({ method: 'typed' });
  });

  it('downloads the PDF and tracks counts only', async () => {
    const el = renderPage();
    typePiece(el, 'Halo Ring');
    await clickDownload(el);
    expect(save).toHaveBeenCalledWith('line-sheet.pdf');
    expect(trackLineSheetDownloaded).toHaveBeenCalledWith({
      products: 1, pages: 1, has_terms: false, has_logo: false, paper: 'letter', currency: 'USD',
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('still completes the download when analytics throws', async () => {
    vi.mocked(trackLineSheetDownloaded).mockImplementationOnce(() => { throw new Error('PostHog blocked'); });
    vi.mocked(trackLineSheetStarted).mockImplementationOnce(() => { throw new Error('PostHog blocked'); });
    const el = renderPage();
    typePiece(el, 'Halo Ring');
    await clickDownload(el);
    expect(save).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Downloaded.');
  });

  it('tells the jeweler and tracks pdf_error when the PDF cannot be built', async () => {
    vi.mocked(buildLineSheetPdf).mockRejectedValueOnce(new Error('out of memory'));
    const el = renderPage();
    typePiece(el, 'Halo Ring');
    await clickDownload(el);
    expect(save).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'The PDF could not be created.' }));
    expect(trackLineSheetFailed).toHaveBeenCalledWith({ reason: 'pdf_error', count: 1 });
    expect(trackLineSheetDownloaded).not.toHaveBeenCalled();
  });
});
