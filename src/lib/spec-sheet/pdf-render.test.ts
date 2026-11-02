import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocument = vi.fn();
vi.mock('pdfjs-dist', () => ({
  AnnotationMode: { DISABLE: 0 },
  GlobalWorkerOptions: {},
  getDocument: (params: unknown) => getDocument(params),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.js' }));
vi.mock('@/lib/cad-versions-api', () => ({
  fetchVersionDownloadLink: vi.fn(async () => ({ url: 'https://storage.example/spec.pdf', expires_at: '', filename: 'spec.pdf' })),
}));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));

import { loadSpecSheet } from './pdf-render';

describe('loadSpecSheet', () => {
  beforeEach(() => {
    getDocument.mockReset();
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2 }) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })));
  });

  it('opens the PDF from its bytes with eval, XFA and outside fetches off', async () => {
    const pdf = await loadSpecSheet('asset-eval');
    expect(pdf.pageCount).toBe(2);
    const params = getDocument.mock.calls[0][0];
    expect(params.data).toBeInstanceOf(Uint8Array);
    expect(params).toMatchObject({ isEvalSupported: false, enableXfa: false });
    expect(params).not.toHaveProperty('url');
    expect(params).not.toHaveProperty('cMapUrl');
  });

  it('forgets a failed load so the next mount retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(loadSpecSheet('asset-fail')).rejects.toThrow('500');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    await expect(loadSpecSheet('asset-fail')).resolves.toMatchObject({ pageCount: 2 });
  });
});
