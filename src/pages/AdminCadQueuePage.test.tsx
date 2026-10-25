import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ listSupervisedRuns: vi.fn(), startSupervisedRuns: vi.fn() }));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));

import AdminCadQueuePage from './AdminCadQueuePage';

const row = (id: string, phase: string, extra = {}) => ({
  workflow_id: id, workflow_name: 'jewelry_cad_generate', phase, attempt: 1, created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:00:00Z', user_email: `${id}@x.com`, is_paying: false, last_error: null, decision: null, note_count: 0, ...extra,
});

function renderPage(path = '/admin/cad-queue') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AdminCadQueuePage /></MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

/** The table row that shows this run (found by its user email). */
function rowOf(id: string): HTMLElement {
  return screen.getByText(`${id}@x.com`).closest('tr') as HTMLElement;
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

async function chooseAi(optionName: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'AI for these' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

beforeEach(() => {
  api.listSupervisedRuns.mockReset();
  api.startSupervisedRuns.mockReset();
});

describe('AdminCadQueuePage', () => {
  it('opens on To start, which asks for queued and errored runs', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    renderPage();
    await waitFor(() => expect(api.listSupervisedRuns).toHaveBeenCalled());
    expect(api.listSupervisedRuns.mock.calls[0][0].phases).toEqual(['queued', 'errored']);
    expect(await screen.findByText('Nothing here.')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\s*\(\d+\)$/, ''))).toEqual(['To start', 'Running', 'To review', 'Done']);
    expect(screen.getByRole('tab', { name: /To start/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches to To review and asks for awaiting review and rejected runs', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    renderPage();
    await waitFor(() => expect(api.listSupervisedRuns).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /To review/ }));
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls.at(-1)![0].phases).toEqual(['awaiting_review', 'rejected']));
    expect(screen.getByRole('tab', { name: /To review/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('maps the other tabs from the URL', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const first = renderPage('/admin/cad-queue?tab=running');
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls.at(-1)![0].phases).toEqual(['running', 'finalizing']));
    first.unmount();
    renderPage('/admin/cad-queue?tab=done');
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls.at(-1)![0].phases).toEqual(['delivered', 'failed']));
  });

  it('shows the count on the active tab only', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 7, limit: 20, offset: 0 });
    renderPage();
    expect(await screen.findByRole('tab', { name: 'To start (7)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Running' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'To review' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Done' })).toBeTruthy();
  });

  it('renders no tick boxes and only the five columns', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored')], total: 2, limit: 20, offset: 0 });
    renderPage();
    await screen.findByText('wf-a@x.com');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual(['When', 'User', 'Type', 'Status', 'Action']);
    expect(screen.queryByText('wf-a')).toBeNull();
    expect(screen.queryByText(/Paying|Free/)).toBeNull();
  });

  it('says the run type and status in plain words', async () => {
    api.listSupervisedRuns.mockResolvedValue({
      items: [
        row('wf-a', 'queued'),
        row('wf-b', 'finalizing', { workflow_name: 'jewelry_cad_improve' }),
        row('wf-c', 'awaiting_review', { workflow_name: 'other_flow' }),
        row('wf-d', 'queued', { attempt: 3 }),
        row('wf-e', 'errored'),
      ],
      total: 5, limit: 20, offset: 0,
    });
    renderPage();
    await screen.findByText('wf-a@x.com');
    expect(within(rowOf('wf-a')).getByText('Generate')).toBeTruthy();
    expect(within(rowOf('wf-a')).getByText('Queued')).toBeTruthy();
    expect(within(rowOf('wf-b')).getByText('Improve')).toBeTruthy();
    expect(within(rowOf('wf-b')).getByText('Finishing')).toBeTruthy();
    expect(within(rowOf('wf-c')).getByText('other_flow')).toBeTruthy();
    expect(within(rowOf('wf-c')).getByText('Needs review')).toBeTruthy();
    expect(within(rowOf('wf-d')).getByText('Queued (attempt 3)')).toBeTruthy();
    expect(within(rowOf('wf-e')).getByText('Errored (attempt 1)')).toBeTruthy();
  });

  it('shows the first line of the last error with the full text on hover, and the attempt', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-e', 'errored', { attempt: 2, last_error: 'provider credit exhausted\nTraceback: deep' })], total: 1, limit: 20, offset: 0 });
    renderPage();
    const cell = await screen.findByText('provider credit exhausted');
    expect(cell.getAttribute('title')).toBe('provider credit exhausted\nTraceback: deep');
    expect(screen.getByText('Errored (attempt 2)')).toBeTruthy();
  });

  it("starts one run from its row's Start and shows the result in that row", async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored')], total: 2, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: true }]);
    renderPage();
    await screen.findByText('wf-a@x.com');
    fireEvent.click(within(rowOf('wf-a')).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-a']));
    expect(await within(rowOf('wf-a')).findByText('Started.')).toBeTruthy();
    expect(within(rowOf('wf-b')).queryByText('Started.')).toBeNull();
  });

  it('Start all starts every listed run and shows each refusal in its row', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored')], total: 2, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: true }, { workflow_id: 'wf-b', accepted: false, code: 'invalid_phase' }]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /start all \(2\)/i }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-a', 'wf-b']));
    expect(await screen.findByText('Started 1.')).toBeTruthy();
    expect(within(rowOf('wf-a')).getByText('Started.')).toBeTruthy();
    expect(within(rowOf('wf-b')).getByText('invalid_phase')).toBeTruthy();
  });

  it('says Start failed when the request fails', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /start all \(1\)/i }));
    expect(await screen.findByText('Start failed: boom')).toBeTruthy();
  });

  it('keeps Start all disabled with nothing to start, and offers only Open on rows that cannot start', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const first = renderPage();
    const button = await screen.findByRole('button', { name: /start all \(0\)/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    first.unmount();

    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-c', 'awaiting_review')], total: 1, limit: 20, offset: 0 });
    renderPage('/admin/cad-queue?tab=review');
    await screen.findByText('wf-c@x.com');
    expect(within(rowOf('wf-c')).getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(within(rowOf('wf-c')).queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByRole('button', { name: /start all/i })).toBeNull();
  });

  it('keeps the table and shows a banner when a background refresh fails', async () => {
    api.listSupervisedRuns
      .mockResolvedValueOnce({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 })
      .mockRejectedValueOnce(new Error('boom'));
    const { client } = renderPage();
    expect(await screen.findByText('wf-a@x.com')).toBeTruthy();
    await client.refetchQueries({ queryKey: ['admin-cad-queue'] });
    expect(await screen.findByText("Couldn't refresh. Showing the last loaded list.")).toBeTruthy();
    expect(screen.getByText('wf-a@x.com')).toBeTruthy();
    expect(screen.queryByText(/Failed to load the queue/)).toBeNull();
  });

  it('clears the Start results when the tab changes', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: false, code: 'invalid_phase' }]);
    renderPage();
    fireEvent.click(within(await screen.findByRole('row', { name: /wf-a@x\.com/ })).getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('invalid_phase')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Running/ }));
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls.at(-1)![0].phases).toEqual(['running', 'finalizing']));
    expect(await screen.findByText('wf-a@x.com')).toBeTruthy();
    expect(screen.queryByText('invalid_phase')).toBeNull();
    expect(screen.queryByText('Started 0.')).toBeNull();
  });

  it('offers a way back to the first page when the current page is empty', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 5, limit: 20, offset: 20 });
    renderPage('/admin/cad-queue?offset=20');
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls[0][0].offset).toBe(20));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to first page' }));
    await waitFor(() => expect(api.listSupervisedRuns.mock.calls.at(-1)![0].offset).toBe(0));
  });

  it("starts without tiers when AI for these is left on Each run's own", async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: true }]);
    renderPage();
    await screen.findByText('wf-a@x.com');
    expect(screen.getByRole('combobox', { name: 'AI for these' }).textContent).toContain("Each run's own");
    fireEvent.click(screen.getByRole('button', { name: /Start all/ }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
    expect(api.startSupervisedRuns.mock.calls[0]).toEqual([['wf-a']]);
    fireEvent.click(within(rowOf('wf-a')).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(2));
    expect(api.startSupervisedRuns.mock.calls[1]).toEqual([['wf-a']]);
  });

  it('sends a chosen tier as both fields for Start all and a row Start', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored')], total: 2, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([]);
    renderPage();
    await screen.findByText('wf-a@x.com');
    await chooseAi('GPT-6 Astra Pro');
    const tiers = { llm_tier: 'gpt_6_astra_pro_openrouter', analysis_tier: 'gpt_6_astra_pro_openrouter' };
    fireEvent.click(screen.getByRole('button', { name: /Start all/ }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
    expect(api.startSupervisedRuns.mock.calls[0]).toEqual([['wf-a', 'wf-b'], tiers]);
    fireEvent.click(within(rowOf('wf-b')).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(2));
    expect(api.startSupervisedRuns.mock.calls[1]).toEqual([['wf-b'], tiers]);
  });
});
