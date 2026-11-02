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
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, photoshoot4kRun, productShotRun, proxy, unknownRun,
} from '@/lib/admin-workflow-views/__fixtures__/runs';

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: string) => within(screen.getByRole('region', { name }));
const thumb = (scope: ReturnType<typeof section>, label: string) => scope.getByRole('figure', { name: label }).getAttribute('data-url');

describe('DetailContent: Inputs -> Steps -> Outputs per workflow', () => {
  beforeEach(() => {
    authFetch.authenticatedFetch.mockReset();
    // Nothing reaches a real API: every call answers 404 (images stay as thumbnails without bytes).
    authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
  });

  it('product shot: jewelry + inspiration in, analysis and prompt, failed retry marked, final image out, honest cost', () => {
    renderDetail(productShotRun());
    const inputs = section('Inputs');
    expect(thumb(inputs, 'Jewelry 1')).toBe(proxy(1));
    expect(thumb(inputs, 'Jewelry 2')).toBe(proxy(2));
    expect(thumb(inputs, 'Inspiration')).toBe(proxy(3));
    expect(inputs.getByText('warm white marble, soft morning light')).toBeTruthy();

    const steps = section('Steps');
    expect(steps.getByText('analyze_jewelry_pdp')).toBeTruthy();
    expect(steps.getByText('pair')).toBeTruthy();
    expect(steps.getByText(/Product photograph of a pair of gold hoop earrings/)).toBeTruthy();
    expect(steps.getByText('Failed, retried')).toBeTruthy();
    expect(steps.getByText(/upstream timed out/)).toBeTruthy();

    expect(thumb(section('Outputs'), 'Final image')).toBe(proxy(4));

    const header = section('Run');
    expect(header.getByText('28 credits')).toBeTruthy();
    expect(header.getByText('56 credits')).toBeTruthy();
    expect(header.getByText('+28')).toBeTruthy();
    expect(header.getByText('incl. failed retries')).toBeTruthy();
    expect(header.getByText(/Provider spend \(reported\): not reported by this workflow/)).toBeTruthy();
  });

  it('photoshoot 4K: model + jewelry in, intermediate and polished images in the steps, upscaled out', () => {
    renderDetail(photoshoot4kRun());
    expect(thumb(section('Inputs'), 'Model')).toBe(proxy(10));
    const steps = section('Steps');
    expect(thumb(steps, 'Intermediate image')).toBe(proxy(12));
    expect(thumb(steps, 'Polished image')).toBe(proxy(13));
    expect(steps.getByText('Needs repose')).toBeTruthy();
    expect(steps.getByText(/Place the emerald pendant/)).toBeTruthy();
    expect(thumb(section('Outputs'), 'Final image (upscaled)')).toBe(proxy(14));
  });

  it('design image: prompt and role-labelled pictures, consistency out, unpriced cost, reported spend', () => {
    renderDetail(designImageRun());
    const inputs = section('Inputs');
    expect(inputs.getByText('Make the band thinner and add milgrain')).toBeTruthy();
    expect(thumb(inputs, 'Design with annotations')).toBe(proxy(21));
    const outputs = section('Outputs');
    expect(thumb(outputs, 'Design picture')).toBe(proxy(23));
    expect(outputs.getByText('Matches the design')).toBeTruthy();
    expect(outputs.getByText('stone is oval, the design shows round')).toBeTruthy();
    const header = section('Run');
    expect(header.getByText('not priced')).toBeTruthy();
    expect(header.getByText('Provider spend (reported): $0.07 across 1 step')).toBeTruthy();
  });

  it('fastload: the .3dm in and its files out, no image placeholders, free', () => {
    renderDetail(fastloadRun());
    expect(screen.queryByText('Jewelry Input')).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
    const inputs = section('Inputs');
    expect(inputs.getByRole('button', { name: /Input \.3dm.*pave-halo-ring\.3dm.*74\.5 MB/ })).toBeTruthy();
    const outputs = section('Outputs');
    expect(outputs.getByRole('button', { name: /Skeleton \.3dm/ })).toBeTruthy();
    expect(outputs.getByRole('button', { name: /Meshes/ })).toBeTruthy();
    expect(outputs.getByText('4,750,000')).toBeTruthy();
    expect(outputs.getByText('41.2')).toBeTruthy();
    expect(section('Run').getAllByText('free')).toHaveLength(2);
  });

  it('CAD to catalog shot: render + background in, placed photo out', () => {
    renderDetail(catalogShotRun());
    const inputs = section('Inputs');
    expect(thumb(inputs, 'Render')).toBe(proxy(40));
    expect(thumb(inputs, 'Background')).toBe(proxy(41));
    expect(inputs.getByText('band: Yellow Gold; round x14: Diamond')).toBeTruthy();
    expect(thumb(section('Outputs'), 'Placed photo')).toBe(proxy(42));
  });

  it('CAD improve: studio inputs and lineage in, every file from the steps out, mass and validation', () => {
    renderDetail(cadImproveRun());
    const inputs = section('Inputs');
    expect(inputs.getByText('make the band thinner')).toBeTruthy();
    expect(inputs.getByText('33333333-3333-4333-8333-333333333333')).toBeTruthy();
    const outputs = section('Outputs');
    expect(outputs.getByTestId('glb').getAttribute('data-url')).toBe(proxy(62));
    for (const label of ['3DM', 'GLB', 'STL', 'STEP', 'Casting STL', 'Spec sheet']) {
      expect(outputs.getByRole('button', { name: new RegExp(`^Download ${label}\\b`) })).toBeTruthy();
    }
    expect(outputs.getByText('4.82 g')).toBeTruthy();
    expect(outputs.getByText('applied')).toBeTruthy();
    expect(section('Steps').getByText('Failed, retried')).toBeTruthy();
    expect(section('Run').getByText('Provider spend (reported): $0.41 across 1 step')).toBeTruthy();
  });

  it('unknown workflow: generic view with every key and picture', () => {
    renderDetail(unknownRun());
    const inputs = section('Inputs');
    expect(inputs.getByText('fix_instruction')).toBeTruthy();
    expect(thumb(inputs, 'result_image_url')).toBe(proxy(70));
    expect(thumb(section('Outputs'), 'Output image')).toBe(proxy(71));
  });

  it('renders a hostile prompt and labels as text, never as markup', () => {
    const run = productShotRun();
    run.input_payload = { user_art_direction: '<img src=x onerror="alert(1)">', category: '<script>alert(2)</script>' };
    run.steps = [{ tool_name: '<b>bold</b>', took_ms: null, at: null, input: {}, output: { prompt: '<iframe src="javascript:alert(3)">' } }];
    const { container } = renderDetail(run);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(screen.getByText('<script>alert(2)</script>')).toBeTruthy();
    expect(container.querySelector('img[src="x"], script, iframe, b')).toBeNull();
  });
});
