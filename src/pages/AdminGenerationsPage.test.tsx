import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const listAdminGenerations = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin-generations-api', async (orig) => ({
  ...(await orig<object>()),
  listAdminGenerations,
}));

import AdminGenerationsPage from './AdminGenerationsPage';

describe('AdminGenerationsPage', () => {
  it('leaves supervised runs out of the list', async () => {
    listAdminGenerations.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/generations']}>
          <AdminGenerationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listAdminGenerations).toHaveBeenCalled());
    expect(listAdminGenerations).toHaveBeenCalledWith(expect.objectContaining({ supervised: false }));
  });
});

describe('AdminGenerationsPage cost columns', () => {
  const row = (id: string, workflow: string, actual: number, provider: number) => ({
    workflow_id: id, workflow_name: workflow, status: 'completed', created_at: '2026-11-01T10:00:00Z',
    finished_at: null, user_email: `${id}@b.co`, actual_cost: actual, provider_cost: provider,
    user_type: null, is_paying: true, feedback_id: null,
  });

  async function renderList() {
    listAdminGenerations.mockResolvedValue({
      items: [
        row('wf-design', 'design_image_v1', 14, 0),
        row('wf-photo', 'jewelry_photoshoots_generator_higher_tier', 20, 28),
        row('wf-fast', 'cad_to_catalog_fastload', 0, 0),
      ],
      total: 3, limit: 20, offset: 0,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/generations']}>
          <AdminGenerationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await view.findByText('wf-design@b.co');
    return view;
  }

  it('names the columns User paid and Workflow cost, each with a one-line explanation', async () => {
    const view = await renderList();
    expect(view.getByRole('columnheader', { name: /User paid/ })).toBeTruthy();
    const header = view.getByRole('columnheader', { name: /Workflow cost/ });
    expect(header.querySelector('[title]')?.getAttribute('title')).toMatch(/including failed attempts that were retried/);
    expect(header.querySelector('[title]')?.getAttribute('title')).toMatch(/Fixed price/);
    expect(view.queryByText('Actual Cost')).toBeNull();
    expect(view.queryByText('Provider Cost')).toBeNull();
  });

  it('reads unpriced, retried and free runs honestly', async () => {
    const view = await renderList();
    const cells = (id: string) => Array.from(view.getByText(`${id}@b.co`).closest('tr')!.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells('wf-design').slice(4, 6)).toEqual(['14 credits', 'Fixed price · tool costs not recorded']);
    const fixedRow = view.getByText('wf-design@b.co').closest('tr')!;
    expect(fixedRow.querySelector('[title]')?.getAttribute('title')).toMatch(/charges a flat price/);
    expect(cells('wf-photo').slice(4, 6)).toEqual(['20 credits', '28 credits+8']);
    expect(cells('wf-fast').slice(4, 6)).toEqual(['Free', 'Free']);
  });
});

describe('AdminGenerationsPage client filter', () => {
  function renderAt(url: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <AdminGenerationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it.each([
    ['/admin/generations?client=rhino', 'rhino'],
    ['/admin/generations?client=untagged', 'untagged'],
    ['/admin/generations?client=bogus', undefined],
    ['/admin/generations', undefined],
  ])('%s sends client=%s', async (url, expected) => {
    listAdminGenerations.mockReset();
    listAdminGenerations.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    renderAt(url);
    await waitFor(() => expect(listAdminGenerations).toHaveBeenCalled());
    expect(listAdminGenerations.mock.calls[0][0].client).toBe(expected);
  });

  it('labels the untagged option without claiming it is website-only', async () => {
    listAdminGenerations.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const view = renderAt('/admin/generations?client=untagged');
    expect(await view.findByText('Website / untagged')).toBeTruthy();
  });

  it('shows a Rhino badge only on Rhino rows', async () => {
    const base = {
      workflow_name: 'jewelry_cad_generate', status: 'completed', created_at: '2026-11-01T10:00:00Z',
      finished_at: null, actual_cost: 140, provider_cost: 140, user_type: null, is_paying: true, feedback_id: null,
    };
    listAdminGenerations.mockResolvedValue({
      items: [
        { ...base, workflow_id: 'wf-r', user_email: 'r@b.co', client: 'rhino', client_version: '0.6.2' },
        { ...base, workflow_id: 'wf-w', user_email: 'w@b.co', client: null, client_version: null },
      ],
      total: 2, limit: 20, offset: 0,
    });
    const view = renderAt('/admin/generations');
    const rhinoRow = (await view.findByText('r@b.co')).closest('tr')!;
    const webRow = view.getByText('w@b.co').closest('tr')!;
    expect(rhinoRow.textContent).toContain('Rhino 0.6.2');
    expect(webRow.textContent).not.toContain('Rhino');
  });
});
