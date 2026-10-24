import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ listSupervisedRuns: vi.fn(), startSupervisedRuns: vi.fn() }));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));

import AdminCadQueuePage from './AdminCadQueuePage';

const row = (id: string, phase: string, extra = {}) => ({
  workflow_id: id, workflow_name: 'jewelry_cad_generate', phase, attempt: 1, created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:00:00Z', user_email: 'u@x.com', is_paying: false, last_error: null, decision: null, note_count: 0, ...extra,
});

function renderPage(path = '/admin/cad-queue') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AdminCadQueuePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listSupervisedRuns.mockReset();
  api.startSupervisedRuns.mockReset();
});

describe('AdminCadQueuePage', () => {
  it('asks for queued, errored and awaiting review by default', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    renderPage();
    await waitFor(() => expect(api.listSupervisedRuns).toHaveBeenCalled());
    expect(api.listSupervisedRuns.mock.calls[0][0].phases).toEqual(['queued', 'errored', 'awaiting_review']);
    expect(await screen.findByText('No runs in these phases.')).toBeTruthy();
  });

  it('shows the full last error on hover and the attempt', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-e', 'errored', { attempt: 2, last_error: 'provider credit exhausted' })], total: 1, limit: 20, offset: 0 });
    renderPage();
    const cell = await screen.findByText('provider credit exhausted');
    expect(cell.getAttribute('title')).toBe('provider credit exhausted');
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('starts the ticked runs and lists the ones not accepted', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored'), row('wf-c', 'awaiting_review')], total: 3, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: true }, { workflow_id: 'wf-b', accepted: false, code: 'invalid_phase' }]);
    renderPage();
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes[2].hasAttribute('disabled') || boxes[2].getAttribute('data-disabled') !== null).toBe(true);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /start selected \(2\)/i }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-a', 'wf-b']));
    expect(await screen.findByText('Started 1.')).toBeTruthy();
    expect(screen.getByText(/wf-b.*invalid_phase/)).toBeTruthy();
  });

  it('keeps Start selected disabled with nothing ticked', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 });
    renderPage();
    const button = await screen.findByRole('button', { name: /start selected \(0\)/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
