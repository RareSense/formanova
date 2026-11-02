/**
 * Renders a version's spec sheet PDF to images, for the left panel's Tech
 * spec thumbnail and its preview dialog.
 *
 * Loaded only with a dynamic import, and only when the version has a spec
 * sheet, so pdf.js never weighs on other pages. The worker is a separate
 * file Vite emits (the ?url import).
 *
 * Safety: the PDF is our own file, fetched through the version's signed
 * download link; pdf.js gets its bytes, never a URL, and no cMap or font URL,
 * so it fetches nothing itself. Annotations are not rendered (no links, forms
 * or actions). pdf.js 6 has no eval path (its isEvalSupported option is gone)
 * and runs no document scripts outside the viewer's sandbox, which is not used.
 */
import { AnnotationMode, GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { fetchVersionDownloadLink } from '@/lib/cad-versions-api';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface SpecSheetPdf {
  pageCount: number;
  /** A page as a PNG data URL, `cssWidth` px wide at the device pixel ratio. Cached. */
  renderPage: (page: number, cssWidth?: number) => Promise<string>;
}

/** One load per version per session; a failed load is forgotten so the next mount retries. */
const loaded = new Map<string, Promise<SpecSheetPdf>>();

export function loadSpecSheet(assetId: string): Promise<SpecSheetPdf> {
  const cached = loaded.get(assetId);
  if (cached) return cached;
  const pending = open(assetId);
  loaded.set(assetId, pending);
  pending.catch(() => loaded.delete(assetId));
  return pending;
}

async function open(assetId: string): Promise<SpecSheetPdf> {
  const link = await fetchVersionDownloadLink(assetId, 'spec_sheet');
  // Same-origin links go through the authenticated proxy; signed storage links are fetched as they are.
  const response = link.url.startsWith('/api/') ? await authenticatedFetch(link.url) : await fetch(link.url);
  if (!response.ok) throw new Error(`Spec sheet download failed (${response.status})`);
  const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), enableXfa: false }).promise;
  const pages = new Map<string, Promise<string>>();
  return {
    pageCount: pdf.numPages,
    renderPage(page, cssWidth = 360) {
      const key = `${page}@${cssWidth}`;
      let image = pages.get(key);
      if (!image) {
        image = renderToDataUrl(pdf, page, cssWidth);
        pages.set(key, image);
        image.catch(() => pages.delete(key));
      }
      return image;
    },
  };
}

async function renderToDataUrl(pdf: PDFDocumentProxy, pageNumber: number, cssWidth: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const scale = (cssWidth * Math.min(window.devicePixelRatio || 1, 3)) / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  await page.render({ canvas, canvasContext: context, viewport, annotationMode: AnnotationMode.DISABLE }).promise;
  page.cleanup();
  return canvas.toDataURL('image/png');
}
