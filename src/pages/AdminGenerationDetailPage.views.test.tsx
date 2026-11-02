import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: string) => within(screen.getByRole('region', { name }));
const thumb = (scope: ReturnType<typeof section>, label: string) => scope.getAllByRole('figure', { name: label })[0].getAttribute('data-url');

beforeEach(() => {
  authFetch.authenticatedFetch.mockReset();
  // Nothing reaches a real API: every call answers 404.
  authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
});

describe('DetailContent: Inputs -> Steps -> Outputs for any workflow', () => {
  it('product shot: labelled pictures and options in, failed retry marked, final image out, honest cost', () => {
    renderDetail(productShotRun());
    const inputs = section('Inputs');
    expect(thumb(inputs, 'Jewelry 1')).toBe(proxy(1));
    expect(thumb(inputs, 'Inspiration')).toBe(proxy(3));
    expect(inputs.getByText('warm white marble, soft morning light')).toBeTruthy();
    const steps = section('Steps');
    expect(steps.getByText('Failed, retried')).toBeTruthy();
    expect(steps.getAllByText(/upstream timed out/).length).toBeGreaterThan(0);
    expect(steps.getAllByText(/Product photograph of a pair of gold hoop earrings/).length).toBeGreaterThan(0);
    const outputs = section('Outputs');
    expect(outputs.getByText('From step 4: generate_jewelry_image_pdp_higher_tier')).toBeTruthy();
    expect(thumb(outputs, 'Generated image')).toBe(proxy(4));
    const header = section('Run');
    expect(header.getByText('+28')).toBeTruthy();
    expect(header.getByText('incl. failed retries')).toBeTruthy();
    expect(header.getByText(/not reported by this workflow/)).toBeTruthy();
  });

  it('photoshoot 4K: intermediate image in the timeline, upscaled image out', () => {
    renderDetail(photoshoot4kRun());
    expect(thumb(section('Steps'), 'Intermediate image')).toBe(proxy(12));
    expect(thumb(section('Outputs'), 'Upscaled image')).toBe(proxy(14));
  });

  it('design image: role-named pictures, unpriced cost, reported spend', () => {
    renderDetail(designImageRun());
    expect(thumb(section('Inputs'), 'Design with annotations')).toBe(proxy(21));
    expect(thumb(section('Outputs'), 'Design picture')).toBe(proxy(23));
    expect(section('Run').getByText('not priced')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.07 across 1 step')).toBeTruthy();
  });

  it('fastload: file links in and out, no picture placeholders', () => {
    renderDetail(fastloadRun());
    expect(screen.queryByRole('figure')).toBeNull();
    expect(section('Inputs').getByRole('button', { name: /Download Input \.3dm pave-halo-ring\.3dm 74\.5 MB/ })).toBeTruthy();
    expect(section('Outputs').getByRole('button', { name: /Download Skeleton \.3dm/ })).toBeTruthy();
    expect(section('Outputs').getByText('4750000')).toBeTruthy();
    expect(section('Run').getAllByText('free')).toHaveLength(2);
  });

  it('catalog shot: render + background in, placed photo out', () => {
    renderDetail(catalogShotRun());
    expect(thumb(section('Inputs'), 'Render')).toBe(proxy(40));
    expect(thumb(section('Outputs'), 'Placed photo')).toBe(proxy(42));
  });

  it('CAD improve: lineage in, 3D preview and every file out, reported spend', () => {
    renderDetail(cadImproveRun());
    expect(section('Inputs').getByText('33333333-3333-4333-8333-333333333333')).toBeTruthy();
    const outputs = section('Outputs');
    expect(outputs.getByTestId('glb').getAttribute('data-url')).toBe(proxy(62));
    for (const label of ['3DM', 'STL', 'STEP', 'Spec sheet']) {
      expect(outputs.getByRole('button', { name: new RegExp(`^Download ${label}\\b`) })).toBeTruthy();
    }
    expect(outputs.getByRole('button', { name: /casting_body\.stl/ })).toBeTruthy();
    expect(outputs.getByText('4.82')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.41 across 1 step')).toBeTruthy();
  });

  it('unknown workflow #1 (video reel): new artifact types shown with no admin code', () => {
    renderDetail(syntheticReelRun());
    const inputs = section('Inputs');
    expect(inputs.getByText(/Open on the ring turning slowly/)).toBeTruthy();
    expect(thumb(inputs, 'Still')).toBe(proxy(100));
    expect(inputs.getByRole('button', { name: /Download Brand kit brand-kit\.zip/ })).toBeTruthy();
    const outputs = section('Outputs');
    expect(outputs.getByRole('button', { name: /Download Video/ })).toBeTruthy();
    expect(thumb(outputs, 'Poster')).toBe(proxy(105));
    expect(outputs.getByText('240')).toBeTruthy();
    expect(section('Steps').getByText('Failed, retried')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.02 across 1 step')).toBeTruthy();
  });

  it('unknown workflow #2 (odd payload): odd keys, unicode and deep values all visible', () => {
    renderDetail(syntheticOddRun());
    const inputs = section('Inputs');
    expect(inputs.getByText('значение')).toBeTruthy();
    expect(inputs.getByText('six levels down')).toBeTruthy();
    expect(inputs.getByText('empty key')).toBeTruthy();
    expect(inputs.getByText('javascript:alert(1)')).toBeTruthy();
    expect(section('Outputs').getByRole('button', { name: /Show 3D preview|Download Model url/ })).toBeTruthy();
  });
});

describe('completeness in the DOM: every leaf of every fixture is rendered', () => {
  it.each(Object.keys(FIXTURES))('%s', (name) => {
    const detail = FIXTURES[name]();
    const { container } = renderDetail(detail);
    const rendered = new Set(Array.from(container.querySelectorAll('[data-path]')).map((el) => el.getAttribute('data-path')));
    const leaves = [
      ...leafPaths(detail.input_payload, 'input_payload'),
      ...detail.steps.flatMap((s, i) => [...leafPaths(s.input, `steps[${i}].input`), ...leafPaths(s.output, `steps[${i}].output`)]),
    ];
    expect(leaves.filter((p) => !rendered.has(p))).toEqual([]);
  });
});
