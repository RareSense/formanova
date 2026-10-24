import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getSupervisedRun: vi.fn(),
  startSupervisedRuns: vi.fn(),
  sendSupervisedRun: vi.fn(),
  rejectSupervisedRun: vi.fn(),
  failSupervisedRun: vi.fn(),
  addSupervisedRunNote: vi.fn(),
  sendSupervisedReplacement: vi.fn(),
}));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock('@/pages/AdminGenerationDetailPage', () => ({ DetailContent: () => <div>run detail</div> }));

import AdminCadQueueDetailPage from './AdminCadQueueDetailPage';
import { SupervisedRunsApiError, type SupervisedPhase, type SupervisedRunDetail } from '@/lib/supervised-runs-api';

function detail(phase: SupervisedPhase, extra: Partial<SupervisedRunDetail> = {}): SupervisedRunDetail {
  return {
    run: { workflow_id: 'wf-1', steps: [] },
    supervision: {
      phase,
      attempt: 1,
      attempt_started_at: '2026-10-24T10:00:00Z',
      last_error: null,
      last_error_at: null,
      decision: null,
      decided_by_email: null,
      decided_at: null,
      acknowledged_missing: null,
      delivery: null,
      events: [],
    },
    send_check: null,
    replacement_check: null,
    uploads: [],
    notes: [],
    download_urls: {},
    ...extra,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/cad-queue/wf-1']}>
        <Routes>
          <Route path="/admin/cad-queue/:workflowId" element={<AdminCadQueueDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const IGNORED = ['Back to CAD Queue', 'Add note', 'Choose file', 'Replace file', 'Remove', 'What will be sent', 'Send replacement'];
function actionButtonNames(): string[] {
  return screen.getAllByRole('button')
    .map((button) => button.textContent?.trim() ?? '')
    .filter((name) => !IGNORED.includes(name));
}

beforeEach(() => {
  vi.useRealTimers();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('AdminCadQueueDetailPage', () => {
  it('shows only the actions the phase allows', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    const first = renderPage();
    await screen.findByText('Attempt 1');
    expect(actionButtonNames()).toEqual(['Start', 'Reject', 'Fail']);
    first.unmount();

    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review'));
    const second = renderPage();
    await screen.findByText('Attempt 1');
    expect(actionButtonNames()).toEqual(['Send', 'Reject', 'Fail']);
    second.unmount();

    api.getSupervisedRun.mockResolvedValue(detail('running'));
    renderPage();
    expect(await screen.findByText('Working: no actions until this finishes.')).toBeTruthy();
    expect(actionButtonNames()).toEqual([]);
  });

  it('enables Send only when every missing name is ticked', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: true, missing: ['code_artifact', 'loop_state_artifact'] },
    }));
    api.sendSupervisedRun.mockResolvedValue({ accepted: true, phase: 'finalizing' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Without these files the user can't improve this model later. Tick each one to confirm.")).toBeTruthy();
    const send = within(dialog).getByRole('button', { name: 'Send' });
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'code_artifact' }));
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'loop_state_artifact' }));
    expect(send.hasAttribute('disabled')).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(api.sendSupervisedRun).toHaveBeenCalled());
    const [id, ticked] = api.sendSupervisedRun.mock.calls[0];
    expect(id).toBe('wf-1');
    expect(ticked).toEqual(expect.arrayContaining(['code_artifact', 'loop_state_artifact']));
    expect(ticked).toHaveLength(2);
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
  });

  it('sends an empty list at once when nothing is missing', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: true, missing: [] },
    }));
    api.sendSupervisedRun.mockResolvedValue({ accepted: true, phase: 'finalizing' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nothing is missing.')).toBeTruthy();
    const send = within(dialog).getByRole('button', { name: 'Send' });
    expect(send.hasAttribute('disabled')).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(api.sendSupervisedRun).toHaveBeenCalledWith('wf-1', []));
  });

  it('fails the run only after the confirm', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    api.failSupervisedRun.mockResolvedValue({ accepted: true, phase: 'failed' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Fail' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Fail this run?')).toBeTruthy();
    expect(within(dialog).getByText("Refunds every credit. The user gets no email. This can't be undone.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.failSupervisedRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fail run' }));
    await waitFor(() => expect(api.failSupervisedRun).toHaveBeenCalledWith('wf-1'));
  });

  it('says nothing happened when the reject signal fails', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    api.rejectSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(502, 'signal_failed', { code: 'signal_failed' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Nothing happened. Press again.')).toBeTruthy();
    expect(api.rejectSupervisedRun).toHaveBeenCalledWith('wf-1');
  });

  it('adds a note and keeps Add note disabled while the box is blank', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    api.addSupervisedRunNote.mockResolvedValue({ id: 'n1', author_email: 'a@x.com', body: 'checked the prongs', created_at: '2026-10-24T11:00:00Z' });
    renderPage();
    expect(await screen.findByText("Notes can't be edited or deleted.")).toBeTruthy();
    const add = screen.getByRole('button', { name: 'Add note' });
    expect(add.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'New note' }), { target: { value: '   ' } });
    expect(add.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'New note' }), { target: { value: 'checked the prongs' } });
    expect(add.hasAttribute('disabled')).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(api.addSupervisedRunNote).toHaveBeenCalledWith('wf-1', 'checked the prongs'));
  });

  it('shows the run through the reused detail view', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    renderPage();
    expect(await screen.findByText('run detail')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The run' })).toBeTruthy();
  });
  it('polls every 5 s after an accepted action, stops after 2 minutes and on unmount', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    api.rejectSupervisedRun.mockResolvedValue({ accepted: true, phase: 'queued' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
    const before = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.getSupervisedRun.mock.calls.length).toBeGreaterThan(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
    expect(screen.getByText('Still queued. Refresh to check again.')).toBeTruthy();
    const stopped = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(api.getSupervisedRun.mock.calls.length).toBe(stopped);
    view.unmount();
    vi.useRealTimers();
  });

  it('stops polling once the phase moves, and on unmount', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-1', accepted: true }]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
    view.unmount();
    const atUnmount = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(api.getSupervisedRun.mock.calls.length).toBe(atUnmount);
    vi.useRealTimers();

    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByText('Done. Waiting for the run to move...');
    api.getSupervisedRun.mockResolvedValue(detail('running'));
    expect(await screen.findByText('Working: no actions until this finishes.', {}, { timeout: 7000 })).toBeTruthy();
    expect(screen.queryByText('Done. Waiting for the run to move...')).toBeNull();
  }, 15000);
  it('calls Fail once for a double confirm press and a Fail press while waiting', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    let resolveFail: (value: unknown) => void = () => {};
    api.failSupervisedRun.mockImplementation(() => new Promise((resolve) => { resolveFail = resolve; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Fail' }));
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Fail run' });
    // Both clicks inside one act(): React has not re-rendered between them (same tick).
    act(() => {
      confirm.click();
      confirm.click();
    });
    await act(async () => { resolveFail({ accepted: true, phase: 'queued' }); });
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
    const fail = screen.getByRole('button', { name: 'Fail' });
    expect(fail.hasAttribute('disabled')).toBe(true);
    fireEvent.click(fail);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.failSupervisedRun).toHaveBeenCalledTimes(1);
  });

  it('shows Fail as the only action for a rejected run', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected'));
    renderPage();
    await screen.findByText('Attempt 1');
    expect(actionButtonNames()).toEqual(['Fail']);
  });

  it('sends a replacement once through the page lock, then waits for the run to move', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected', {
      replacement_check: { has_model: true, missing: [], final_preview: {} },
    }));
    let resolveSend: (value: { accepted: boolean; phase: SupervisedPhase }) => void = () => {};
    api.sendSupervisedReplacement.mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }));
    renderPage();
    const send = await screen.findByRole('button', { name: 'Send replacement' });
    expect(send.hasAttribute('disabled')).toBe(false);
    fireEvent.click(send);
    fireEvent.click(send);
    expect(api.sendSupervisedReplacement).toHaveBeenCalledTimes(1);
    expect(api.sendSupervisedReplacement).toHaveBeenCalledWith('wf-1', [], undefined);
    await act(async () => { resolveSend({ accepted: true, phase: 'finalizing' }); });
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send replacement' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Fail' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Send replacement' }));
    expect(api.sendSupervisedReplacement).toHaveBeenCalledTimes(1);
  });

  it('keeps Send disabled when there is no model', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: false, missing: [] },
    }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('There is no model to send.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });
});
