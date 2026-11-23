import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const listAdminRhinoUsers = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin-rhino-users-api', async (orig) => ({
  ...(await orig<object>()),
  listAdminRhinoUsers,
}));

const listAdminGenerations = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin-generations-api', async (orig) => ({
  ...(await orig<object>()),
  listAdminGenerations,
}));

import AdminRhinoUsersPage from './AdminRhinoUsersPage';
import { AdminGenerationsApiError } from '@/lib/admin-generations-api';

function user(i: number) {
  return {
    user_id: `u${i}`, user_email: `user${i}@b.co`, first_run_at: '2026-10-20T12:00:00',
    last_run_at: '2026-10-28T09:00:00', runs: i, credits: i * 140,
  };
}

const EMPTY = { totals: { users: 0, runs: 0, credits: 0 }, items: [], total: 0, limit: 20, offset: 0 };

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAt(url = '/admin/rhino-users') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/rhino-users" element={<><AdminRhinoUsersPage /><Where /></>} />
          <Route path="/admin/cad-queue" element={<Where />} />
          <Route path="/admin/cad-queue/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { listAdminRhinoUsers.mockReset(); listAdminGenerations.mockReset(); });

describe('AdminRhinoUsersPage', () => {
  it('shows the totals and one row per user, all time by default', async () => {
    listAdminRhinoUsers.mockResolvedValue({
      totals: { users: 2, runs: 5, credits: 700 }, items: [user(3), user(2)], total: 2, limit: 20, offset: 0,
    });
    renderAt();
    const totals = await screen.findByRole('region', { name: 'Rhino totals' });
    expect(within(totals).getByText('Rhino users').nextElementSibling?.textContent).toBe('2');
    expect(within(totals).getByText('Rhino runs').nextElementSibling?.textContent).toBe('5');
    expect(within(totals).getByText('Rhino credits').nextElementSibling?.textContent).toBe('700 credits');
    const cells = Array.from(screen.getByText('user3@b.co').closest('tr')!.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells[0]).toBe('user3@b.co');
    expect(cells[3]).toBe('3');
    expect(cells[4]).toBe('420 credits');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(listAdminRhinoUsers).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it('sends the date range with an exclusive next-day end', async () => {
    listAdminRhinoUsers.mockResolvedValue(EMPTY);
    renderAt('/admin/rhino-users?from=2026-10-01&to=2026-10-31');
    await waitFor(() => expect(listAdminRhinoUsers).toHaveBeenCalled());
    expect(listAdminRhinoUsers).toHaveBeenCalledWith({
      limit: 20, offset: 0, created_after: '2026-10-01T00:00:00', created_before: '2026-11-01T00:00:00',
    });
  });

  it('writes a picked date to the URL and goes back to page 1', async () => {
    listAdminRhinoUsers.mockResolvedValue(EMPTY);
    renderAt('/admin/rhino-users?offset=20');
    fireEvent.change(await screen.findByLabelText('To'), { target: { value: '2026-10-31' } });
    expect(screen.getByTestId('where').textContent).toBe('/admin/rhino-users?to=2026-10-31');
  });

  it('pages through users with the backend user count', async () => {
    listAdminRhinoUsers.mockResolvedValue({
      totals: { users: 45, runs: 90, credits: 9000 },
      items: Array.from({ length: 20 }, (_, i) => user(i + 1)), total: 45, limit: 20, offset: 20,
    });
    renderAt('/admin/rhino-users?offset=20');
    expect(await screen.findByText('Page 2 of 3 · 45 users')).toBeTruthy();
    expect(listAdminRhinoUsers).toHaveBeenCalledWith({ limit: 20, offset: 20 });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/rhino-users?offset=40');
  });

  it("opens a user's only Rhino run in the CAD queue run view", async () => {
    listAdminRhinoUsers.mockResolvedValue({
      totals: { users: 1, runs: 1, credits: 140 }, items: [user(1)], total: 1, limit: 20, offset: 0,
    });
    listAdminGenerations.mockResolvedValue({ items: [{ workflow_id: 'state-abc' }], total: 1, limit: 2, offset: 0 });
    renderAt();
    fireEvent.click(await screen.findByText('user1@b.co'));
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/admin/cad-queue/state-abc?tab=all&search=user1%40b.co'));
    expect(listAdminGenerations).toHaveBeenCalledWith({ client: 'rhino', user_email: 'user1@b.co', limit: 2 });
  });

  it('opens the CAD queue, every phase, searched by email when a user has several runs', async () => {
    listAdminRhinoUsers.mockResolvedValue({
      totals: { users: 1, runs: 2, credits: 280 }, items: [user(2)], total: 1, limit: 20, offset: 0,
    });
    listAdminGenerations.mockResolvedValue({ items: [{ workflow_id: 'a' }, { workflow_id: 'b' }], total: 2, limit: 2, offset: 0 });
    renderAt();
    fireEvent.click(await screen.findByText('user2@b.co'));
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/admin/cad-queue?tab=all&search=user2%40b.co'));
  });

  it('falls back to the searched CAD queue when the run lookup fails', async () => {
    listAdminRhinoUsers.mockResolvedValue({
      totals: { users: 1, runs: 1, credits: 140 }, items: [user(1)], total: 1, limit: 20, offset: 0,
    });
    listAdminGenerations.mockRejectedValue(new Error('down'));
    renderAt();
    fireEvent.click(await screen.findByText('user1@b.co'));
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/admin/cad-queue?tab=all&search=user1%40b.co'));
  });

  it('shows the empty state', async () => {
    listAdminRhinoUsers.mockResolvedValue(EMPTY);
    renderAt();
    expect(await screen.findByText('No Rhino users found.')).toBeTruthy();
  });

  it('shows the error state', async () => {
    listAdminRhinoUsers.mockRejectedValue(new AdminGenerationsApiError(500, 'boom'));
    renderAt();
    expect(await screen.findByText('Failed to load Rhino users.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Rhino totals' })).toBeNull();
  });

  it('shows Not Authorized on 403', async () => {
    listAdminRhinoUsers.mockRejectedValue(new AdminGenerationsApiError(403, 'Forbidden'));
    renderAt();
    expect(await screen.findByText('Not Authorized')).toBeTruthy();
  });
});
