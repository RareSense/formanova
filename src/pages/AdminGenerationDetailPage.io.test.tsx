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
const viewer = vi.hoisted(() => ({ openModel: vi.fn(), fetchModelBytes: vi.fn() }));
vi.mock('@/components/admin/workflow-view/model-viewer', () => viewer);

import { DetailContent } from './AdminGenerationDetailPage';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import {
  cadImproveRun, fastloadRun, photoshoot4kRun, productShotRun, proxy, syntheticOddRun,
} from '@/lib/admin-workflow-views/__fixtures__/runs';

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const strip = () => within(screen.getByRole('region', { name: 'Inputs → Outputs' }));
const group = (name: 'Inputs' | 'Outputs') => within(strip().getByRole('group', { name }));
const tiles = (scope: ReturnType<typeof group>) => scope.queryAllByTestId(/^(model|file)-tile$/)
  .map((t) => [t.getAttribute('aria-label'), t.getAttribute('data-format')]);

beforeEach(() => {
  authFetch.authenticatedFetch.mockReset();
  authFetch.authenticatedFetch.mockResolvedValue(new Response('{}', { status: 404 }));
  viewer.openModel.mockReset();
  viewer.openModel.mockResolvedValue({ dispose: vi.fn() });
  viewer.fetchModelBytes.mockReset();
  viewer.fetchModelBytes.mockResolvedValue(new ArrayBuffer(8));
});

describe('Inputs → Outputs strip: small tiles, no WebGL until asked', () => {
  it('pictures are 120 px thumbnail tiles with their role as caption', () => {
    renderDetail(photoshoot4kRun());
    const inputs = group('Inputs').getAllByRole('figure');
    expect(inputs.map((f) => [f.getAttribute('aria-label'), f.getAttribute('data-url')])).toEqual([['Model', proxy(10)], ['Jewelry', proxy(11)]]);
    expect(inputs[0].className).toContain('w-[120px]');
    expect(group('Outputs').getAllByRole('figure').map((f) => f.getAttribute('aria-label'))).toEqual(['Upscaled image']);
  });

  it('3D tiles show a badge, name and size, and load nothing until clicked', () => {
    renderDetail(cadImproveRun());
    expect(tiles(group('Outputs')).slice(0, 4)).toEqual([['GLB', 'glb'], ['3DM', '3dm'], ['STL', 'stl'], ['Casting body', 'stl']]);
    expect(group('Outputs').getByText('casting_body.stl')).toBeTruthy();
    expect(viewer.fetchModelBytes).not.toHaveBeenCalled();
    expect(viewer.openModel).not.toHaveBeenCalled();
    expect(screen.queryByTestId('model-viewport')).toBeNull();
  });

  it('clicking a 3D tile opens the viewer in a dialog and only then fetches that file', async () => {
    renderDetail(cadImproveRun());
    fireEvent.click(group('Outputs').getByRole('button', { name: /^Open 3D preview of 3DM/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('model-viewport')).toBeTruthy();
    await vi.waitFor(() => expect(viewer.openModel).toHaveBeenCalledTimes(1));
    expect(viewer.fetchModelBytes.mock.calls.map((c) => c[0])).toEqual([proxy(61)]);
    expect(viewer.openModel.mock.calls[0][2]).toMatch(/\.3dm$/);
    expect(within(dialog).getByRole('button', { name: /^Download 3DM/ })).toBeTruthy();
  });

  it('a file over ~50 MB asks once more inside the dialog before it is fetched', async () => {
    renderDetail(fastloadRun());
    fireEvent.click(group('Inputs').getByRole('button', { name: /^Open 3D preview of Input 3DM/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Large file (74.5 MB): click to load')).toBeTruthy();
    expect(viewer.fetchModelBytes).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load preview' }));
    await vi.waitFor(() => expect(viewer.fetchModelBytes).toHaveBeenCalledWith(proxy(30), expect.anything()));
  });

  it('a failed preview says "Could not load preview" with the reason and a download, never a blank box', async () => {
    viewer.fetchModelBytes.mockRejectedValue(new Error('HTTP 404'));
    renderDetail(cadImproveRun());
    fireEvent.click(group('Outputs').getByRole('button', { name: /^Open 3D preview of GLB/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Could not load preview')).toBeTruthy();
    expect(within(dialog).getByText('HTTP 404')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /^Download GLB/ })).toBeTruthy();
  });

  it('other files are small tiles that download (spec sheet PDF, STEP)', async () => {
    renderDetail(cadImproveRun());
    fireEvent.click(group('Outputs').getByRole('button', { name: /^Download Spec sheet/ }));
    await vi.waitFor(() => expect(authFetch.authenticatedFetch).toHaveBeenCalledWith(proxy(66)));
  });

  it('untrusted hosts: a warned tile, never fetched or opened', () => {
    renderDetail(syntheticOddRun());
    const outputs = group('Outputs');
    expect(tiles(outputs)).toEqual([['Model url', 'glb']]);
    expect(outputs.getByText(/External file, open at your own risk/)).toBeTruthy();
    expect(outputs.getByRole('link', { name: 'Open link' }).getAttribute('rel')).toContain('noreferrer');
    expect(outputs.queryByRole('button')).toBeNull();
    expect(group('Inputs').getByText('External image, not loaded')).toBeTruthy();
    const loaded = Array.from(document.querySelectorAll('img[src]')).map((i) => i.getAttribute('src'));
    expect(loaded.some((s) => s?.includes('example.com'))).toBe(false);
    expect(viewer.fetchModelBytes).not.toHaveBeenCalled();
  });

  it('says so when a group is empty', () => {
    renderDetail({ ...productShotRun(), input_payload: { category: 'ring' } });
    expect(group('Inputs').getByText('No pictures or files')).toBeTruthy();
  });
});

describe('fastload outputs come only from this run (wrong-3DM report, state-d6f1fb9…)', () => {
  it('the tiles are this run\'s cad_fastload skeleton and meshes, by sha, in that order; nothing else is looked up', async () => {
    renderDetail(fastloadRun());
    expect(tiles(group('Outputs'))).toEqual([['Skeleton 3DM', '3dm'], ['Meshes', 'gz']]);
    expect(group('Outputs').getByText('skeleton.3dm')).toBeTruthy();
    fireEvent.click(group('Outputs').getByRole('button', { name: /^Open 3D preview of Skeleton 3DM skeleton\.3dm/ }));
    await vi.waitFor(() => expect(viewer.fetchModelBytes).toHaveBeenCalledTimes(1));
    expect(viewer.fetchModelBytes.mock.calls[0][0]).toBe(proxy(31));
    // No /api/result fallback, no design-history or other-run lookups for a fastload run.
    const called = authFetch.authenticatedFetch.mock.calls.map((c) => String(c[0]));
    expect(called.filter((u) => /\/result|\/admin\/generations|supervised/.test(u))).toEqual([]);
  });
});
