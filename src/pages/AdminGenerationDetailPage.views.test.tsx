import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  GLBPreviewSlot: ({ glbUrl }: { glbUrl: string }) => <div data-testid="glb" data-url={glbUrl} />,
}));

import { DetailContent } from './AdminGenerationDetailPage';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import {
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, FIXTURES, photoshoot4kRun, productShotRun, proxy,
  syntheticOddRun, syntheticReelRun,
} from '@/lib/admin-workflow-views/__fixtures__/runs';
import { leafPaths } from '@/lib/admin-workflow-views/__fixtures__/leaf-paths';
import { expandAll, openSection } from '@/lib/admin-workflow-views/__fixtures__/expand';

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: string) => within(screen.getByRole('region', { name }));
const strip = () => section('Inputs → Outputs');
const group = (name: 'Inputs' | 'Outputs') => within(strip().getByRole('group', { name }));
const thumb = (scope: ReturnType<typeof section>, label: string) => scope.getAllByRole('figure', { name: label })[0].getAttribute('data-url');

beforeEach(() => {
  authFetch.authenticatedFetch.mockReset();
  // Nothing reaches a real API: every call answers 404.
  authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
});

describe('default view: run header, Inputs -> Outputs strip, everything else closed', () => {
  it('only the header and the strip are open; Steps, Input payload, Technical are closed sections', () => {
    const { container } = renderDetail(productShotRun());
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(regions).toEqual(['admin-section-run', 'admin-section-io', 'admin-section-steps', 'admin-section-input-payload', 'admin-section-technical']);
    for (const title of ['Steps', 'Input payload', 'Technical']) {
      expect(screen.getByRole('button', { name: title }).getAttribute('aria-expanded')).toBe('false');
    }
    // Nothing of the walked payload or the steps is in the default view.
    expect(container.querySelectorAll('[data-path]').length).toBe(0);
    expect(screen.queryByText('warm white marble, soft morning light')).toBeNull();
  });
});

describe('DetailContent for any workflow', () => {
  it('product shot: pictures in the strip, one line per step, honest cost', () => {
    renderDetail(productShotRun());
    expect(thumb(group('Inputs'), 'Jewelry 1')).toBe(proxy(1));
    expect(thumb(group('Inputs'), 'Inspiration')).toBe(proxy(3));
    expect(thumb(group('Outputs'), 'Generated image')).toBe(proxy(4));
    openSection(document, 'Steps');
    const steps = section('Steps');
    expect(steps.getAllByRole('listitem')).toHaveLength(4);
    expect(steps.getByText('Failed, retried')).toBeTruthy();
    expect(steps.getAllByText(/upstream timed out/).length).toBeGreaterThan(0);
    // A step opens to its walked input and output.
    fireEvent.click(steps.getByRole('button', { name: /^2\. prepare_jewelry_request_pdp_higher_tier/ }));
    expect(steps.getAllByText(/Product photograph of a pair of gold hoop earrings/).length).toBeGreaterThan(0);
    openSection(document, 'Input payload');
    expect(section('Input payload').getByText('warm white marble, soft morning light')).toBeTruthy();
    const header = section('Run');
    expect(header.getByText('+28')).toBeTruthy();
    expect(header.getByText('incl. failed retries')).toBeTruthy();
    expect(header.getByText(/not reported by this workflow/)).toBeTruthy();
  });

  it('photoshoot 4K: model then jewelry in, the upscaled image out; the intermediate stays in its step', () => {
    renderDetail(photoshoot4kRun());
    expect(group('Inputs').getAllByRole('figure').map((f) => f.getAttribute('aria-label'))).toEqual(['Model', 'Jewelry']);
    expect(group('Outputs').getAllByRole('figure').map((f) => f.getAttribute('data-url'))).toEqual([proxy(14)]);
    expandAll(document);
    expect(thumb(section('Steps'), 'Intermediate image')).toBe(proxy(12));
  });

  it('design image: role-named pictures, fixed price, reported spend', () => {
    renderDetail(designImageRun());
    expect(thumb(group('Inputs'), 'Design with annotations')).toBe(proxy(21));
    expect(thumb(group('Outputs'), 'Design picture')).toBe(proxy(23));
    const run = section('Run');
    expect(run.getByText('Fixed price: 14 credits')).toBeTruthy();
    expect(run.getByText("This workflow charges a flat price. Its tools have no per-call cost set, so what it cost us isn't tracked.")).toBeTruthy();
    expect(run.queryByText('not priced')).toBeNull();
    expect(run.queryByText('0 credits')).toBeNull();
    expect(run.getByText('Provider spend (reported): $0.07 across 1 step')).toBeTruthy();
  });

  it('fastload: 3D tiles, no pictures; the files and counts are in the open step', () => {
    renderDetail(fastloadRun());
    expect(screen.queryByRole('figure')).toBeNull();
    expect(group('Inputs').getByRole('button', { name: /Open 3D preview of Input 3DM pave-halo-ring\.3dm/ })).toBeTruthy();
    expect(group('Outputs').getByRole('button', { name: /Open 3D preview of Skeleton 3DM skeleton\.3dm/ })).toBeTruthy();
    expect(group('Outputs').getByRole('button', { name: /^Download Meshes meshes\.bin\.gz 38\.1 MB/ })).toBeTruthy();
    expandAll(document);
    expect(section('Steps').getByText('4750000')).toBeTruthy();
    expect(section('Input payload').getByRole('button', { name: /Download Input 3DM pave-halo-ring\.3dm 74\.5 MB/ })).toBeTruthy();
    expect(section('Run').getAllByText('Free')).toHaveLength(2);
  });

  it('catalog shot: render + background in, placed photo out', () => {
    renderDetail(catalogShotRun());
    expect(thumb(group('Inputs'), 'Render')).toBe(proxy(40));
    expect(thumb(group('Outputs'), 'Placed photo')).toBe(proxy(42));
  });

  it('CAD improve: reference in; GLB, 3DM, STL, casting, STEP, spec sheet out in that order; lineage in the payload', () => {
    renderDetail(cadImproveRun());
    const tiles = strip().getAllByRole('group').filter((g) => g.getAttribute('data-testid'));
    expect(tiles.map((t) => [t.getAttribute('aria-label'), t.getAttribute('data-format')])).toEqual([
      ['GLB', 'glb'], ['3DM', '3dm'], ['STL', 'stl'], ['Casting body', 'stl'], ['STEP', 'step'], ['Spec sheet', 'pdf'],
    ]);
    expect(group('Outputs').getByRole('button', { name: /^Download Spec sheet/ })).toBeTruthy();
    expandAll(document);
    expect(section('Input payload').getByText('33333333-3333-4333-8333-333333333333')).toBeTruthy();
    expect(section('Steps').getByText('4.82')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.41 across 1 step')).toBeTruthy();
  });

  it('unknown workflow #1 (video reel): new artifact types shown with no admin code', () => {
    renderDetail(syntheticReelRun());
    expect(thumb(group('Inputs'), 'Still')).toBe(proxy(100));
    expect(group('Inputs').getByRole('button', { name: /Download Brand kit brand-kit\.zip/ })).toBeTruthy();
    expect(thumb(group('Outputs'), 'Poster')).toBe(proxy(105));
    expect(group('Outputs').getByRole('button', { name: /Download Video/ })).toBeTruthy();
    expandAll(document);
    expect(section('Input payload').getAllByText(/Open on the ring turning slowly/).length).toBeGreaterThan(0);
    expect(section('Steps').getByText('240')).toBeTruthy();
    expect(section('Steps').getByText('Failed, retried')).toBeTruthy();
    expect(section('Technical').getByText('reel-1')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.02 across 1 step')).toBeTruthy();
  });

  it('unknown workflow #2 (odd payload): odd keys, unicode and deep values all reachable', () => {
    renderDetail(syntheticOddRun());
    // The model sits on an outside host: a warned tile, never previewed or token-fetched.
    expect(group('Outputs').getByText(/External file, open at your own risk/)).toBeTruthy();
    expect(group('Outputs').queryByRole('button', { name: /Open 3D preview/ })).toBeNull();
    expandAll(document);
    const inputs = section('Input payload');
    expect(inputs.getByText('значение')).toBeTruthy();
    expect(inputs.getByText('six levels down')).toBeTruthy();
    expect(inputs.getByText('empty key')).toBeTruthy();
    expect(inputs.getByText('javascript:alert(1)')).toBeTruthy();
    expect(section('Technical').getByText('abc123')).toBeTruthy();
    expect(screen.queryByTestId('glb')).toBeNull();
  });
});

describe('completeness in the DOM: every leaf of every fixture is reachable in the collapsed sections', () => {
  it.each(Object.keys(FIXTURES))('%s', (name) => {
    const detail = FIXTURES[name]();
    const { container } = renderDetail(detail);
    expandAll(container);
    const rendered = new Set(Array.from(container.querySelectorAll('[data-path]')).map((el) => el.getAttribute('data-path')));
    const leaves = [
      ...leafPaths(detail.input_payload, 'input_payload'),
      ...detail.steps.flatMap((s, i) => [...leafPaths(s.input, `steps[${i}].input`), ...leafPaths(s.output, `steps[${i}].output`)]),
    ];
    expect(leaves.filter((p) => !rendered.has(p))).toEqual([]);
  });
});

describe('a fetched picture that has not painted yet', () => {
  // Regression: the reel's Poster (proxy(105)) was fetched fine, but its lazy <img> had not
  // decoded, so the thumbnail collapsed to an empty strip with no placeholder.
  it('keeps a sized loading placeholder until the image paints', async () => {
    // jsdom has no object urls; stand in for the browser's.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = () => 'blob:poster';
    URL.revokeObjectURL = () => {};
    authFetch.authenticatedFetch.mockImplementation(async (url: string) => (
      url === proxy(105) ? new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 }) : new Response('{}', { status: 404 })
    ));
    const { unmount } = renderDetail(syntheticReelRun());
    try {
      const poster = group('Outputs').getAllByRole('figure', { name: 'Poster' })[0];
      const img = await within(poster).findByRole('img', { name: 'Poster' });
      expect(img.getAttribute('src')).toBe('blob:poster');
      expect(poster.getAttribute('aria-busy')).toBe('true');
      expect(within(poster).getByText('Loading')).toBeTruthy();
      fireEvent.load(img);
      expect(poster.getAttribute('aria-busy')).toBe('false');
      expect(within(poster).queryByText('Loading')).toBeNull();
    } finally {
      unmount();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });

  it('a Poster that fails says "Could not load", in the strip and in its step', async () => {
    renderDetail(syntheticReelRun());
    expandAll(document);
    const posters = [...group('Outputs').getAllByRole('figure', { name: 'Poster' }), ...section('Steps').getAllByRole('figure', { name: 'Poster' })];
    expect(posters.length).toBeGreaterThan(1);
    for (const poster of posters) expect(await within(poster).findByText('Could not load')).toBeTruthy();
  });
});
