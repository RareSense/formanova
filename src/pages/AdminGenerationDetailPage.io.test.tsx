import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  GLBPreviewSlot: ({ glbUrl }: { glbUrl: string }) => <div data-testid="glb" data-url={glbUrl} />,
}));
const viewer = vi.hoisted(() => ({ openModel: vi.fn(), fetchModelBytes: vi.fn() }));
vi.mock('@/components/admin/workflow-view/model-viewer', () => viewer);

import { DetailContent } from './AdminGenerationDetailPage';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import {
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, photoshoot4kRun, productShotRun, proxy, syntheticOddRun,
} from '@/lib/admin-workflow-views/__fixtures__/runs';

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const top = () => within(screen.getByRole('region', { name: 'Inputs → Outputs' }));
const column = (name: 'Inputs' | 'Outputs') => within(top().getByRole('group', { name }));
const thumbs = (scope: ReturnType<typeof column>) => scope.queryAllByRole('figure').map((f) => [f.getAttribute('aria-label'), f.getAttribute('data-url')]);
const previews = (scope: ReturnType<typeof column>) => scope.queryAllByTestId('model-preview').map((el) => [el.getAttribute('data-format'), el.getAttribute('data-state')]);

/** A controllable IntersectionObserver: reveal() makes every observed element visible. */
let observed: Array<{ el: Element; cb: IntersectionObserverCallback }> = [];
function reveal() {
  act(() => { observed.forEach(({ el, cb }) => cb([{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)); });
}

beforeEach(() => {
  observed = [];
  class IO {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(el: Element) { observed.push({ el, cb: this.cb }); }
    unobserve() {}
    disconnect() { observed = observed.filter((o) => o.cb !== this.cb); }
  }
  vi.stubGlobal('IntersectionObserver', IO);
  authFetch.authenticatedFetch.mockReset();
  authFetch.authenticatedFetch.mockResolvedValue(new Response('{}', { status: 404 }));
  viewer.openModel.mockReset();
  viewer.openModel.mockResolvedValue({ dispose: vi.fn() });
  viewer.fetchModelBytes.mockReset();
  viewer.fetchModelBytes.mockResolvedValue(new ArrayBuffer(8));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Inputs → Outputs summary at the top of the detail page', () => {
  it('sits right under the run header, before Inputs / Steps / Outputs', () => {
    renderDetail(productShotRun());
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(regions.slice(0, 3)).toEqual(['admin-section-run', 'admin-section-io', 'admin-section-inputs']);
  });

  it('product shot: input pictures (deduplicated) and the generated image as thumbnails', () => {
    renderDetail(productShotRun());
    expect(thumbs(column('Inputs'))).toEqual([['Jewelry 1', proxy(1)], ['Jewelry 2', proxy(2)], ['Inspiration', proxy(3)]]);
    expect(thumbs(column('Outputs'))).toEqual([['Generated image', proxy(4)]]);
    expect(top().queryByTestId('model-preview')).toBeNull();
  });

  it('photoshoot: model and jewelry in, upscaled picture out', () => {
    renderDetail(photoshoot4kRun());
    expect(thumbs(column('Inputs')).map(([, url]) => url)).toEqual([proxy(10), proxy(11)]);
    expect(thumbs(column('Outputs'))).toEqual([['Upscaled image', proxy(14)]]);
  });

  it('design image and catalog shot: the picture families', () => {
    renderDetail(designImageRun());
    expect(thumbs(column('Inputs')).map(([l]) => l)).toEqual(['Design being edited', 'Design with annotations', 'Inspiration / reference']);
    expect(thumbs(column('Outputs'))).toEqual([['Design picture', proxy(23)]]);
  });

  it('catalog shot: render and background in, placed photo out', () => {
    renderDetail(catalogShotRun());
    expect(thumbs(column('Inputs')).map(([l]) => l)).toEqual(['Render', 'Background']);
    expect(thumbs(column('Outputs')).map(([l]) => l)).toEqual(['Placed photo', 'AI picture (before paste-back)']);
  });

  it('fastload: the big 3DM waits for a click, the skeleton is a lazy placeholder; nothing loads before it is visible', () => {
    renderDetail(fastloadRun());
    expect(previews(column('Inputs'))).toEqual([['3dm', 'click']]);
    expect(column('Inputs').getByRole('button', { name: /Load 3D preview/ })).toBeTruthy();
    expect(column('Inputs').getByText(/74\.5 MB, loads on click/)).toBeTruthy();
    expect(previews(column('Outputs'))).toEqual([['3dm', 'waiting']]);
    expect(viewer.fetchModelBytes).not.toHaveBeenCalled();
    expect(viewer.openModel).not.toHaveBeenCalled();
  });

  it('CAD improve: reference picture in; GLB + 3DM auto (when visible), STL + casting STL on click', async () => {
    renderDetail(cadImproveRun());
    expect(thumbs(column('Inputs'))).toEqual([['Reference images', proxy(60)]]);
    expect(previews(column('Outputs'))).toEqual([['glb', 'waiting'], ['3dm', 'waiting'], ['stl', 'click'], ['stl', 'click']]);
    reveal();
    await screen.findAllByTestId('model-viewport');
    await vi.waitFor(() => expect(viewer.openModel).toHaveBeenCalledTimes(2));
    // The WebGL cap holds: the click-only ones did not mount on visibility.
    expect(viewer.fetchModelBytes.mock.calls.map((c) => c[0])).toEqual([proxy(62), proxy(61)]);
    fireEvent.click(column('Outputs').getAllByRole('button', { name: /Load 3D preview/ })[0]);
    await vi.waitFor(() => expect(viewer.openModel).toHaveBeenCalledTimes(3));
    expect(viewer.openModel.mock.calls[2][2]).toMatch(/\.stl$/);
  });

  it('a failed preview says "Could not load preview" with a download, never a blank box', async () => {
    viewer.fetchModelBytes.mockRejectedValue(new Error('HTTP 404'));
    renderDetail(cadImproveRun());
    reveal();
    expect((await column('Outputs').findAllByText('Could not load preview')).length).toBe(2);
    expect(column('Outputs').getAllByRole('button', { name: /^Download GLB/ }).length).toBeGreaterThan(0);
  });

  it('untrusted hosts: listed as warned links, never fetched or previewed', () => {
    renderDetail(syntheticOddRun());
    reveal();
    const outputs = column('Outputs');
    expect(previews(outputs)).toEqual([['glb', 'untrusted']]);
    expect(outputs.getByText(/External file, open at your own risk/)).toBeTruthy();
    expect(outputs.queryByRole('button', { name: /Load 3D preview/ })).toBeNull();
    expect(viewer.fetchModelBytes).not.toHaveBeenCalled();
    expect(column('Inputs').getByText('External image, not loaded')).toBeTruthy();
    const loaded = Array.from(document.querySelectorAll('img[src]')).map((i) => i.getAttribute('src'));
    expect(loaded.some((s) => s?.includes('example.com'))).toBe(false);
  });

  it('says so when a column has nothing to show', () => {
    renderDetail({ ...productShotRun(), input_payload: { category: 'ring' } });
    expect(column('Inputs').getByText('No pictures or 3D files.')).toBeTruthy();
  });
});
