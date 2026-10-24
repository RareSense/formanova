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
