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
  uploadReplacementFile: vi.fn(),
}));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));
const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GLBPreviewSlot: ({ glbUrl }: { glbUrl: string }) => <div data-testid="glb">{glbUrl}</div>,
}));
vi.mock('@/pages/AdminGenerationDetailPage', () => ({ DetailContent: () => <div>run detail</div> }));

import AdminCadQueueDetailPage from './AdminCadQueueDetailPage';
import { azureUriToUrl } from '@/lib/azure-utils';
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

const IGNORED = ['Back to CAD Queue', 'Refresh', 'Add note', 'Choose file', 'Replace file', 'Remove', 'What will be sent', 'Send replacement', 'Download 3DM', 'History', 'Details', 'More files', 'Copy', 'Copied'];
function actionButtonNames(): string[] {
  return screen.getAllByRole('button')
    .map((button) => button.textContent?.trim() ?? '')
    .filter((name) => !IGNORED.includes(name) && !/^Notes \(\d+\)$/.test(name));
}

/** The run has loaded: its Refresh button sits beside the status. */
function loaded() {
  return screen.findByRole('button', { name: 'Refresh' });
}

function openSection(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

const GUIDANCE: Record<SupervisedPhase, string> = {
  queued: 'Press Start to run it.',
  errored: 'It broke. Press Start to try again, or Fail to refund the user.',
  running: 'Running. This page updates by itself.',
  finalizing: 'Running. This page updates by itself.',
  awaiting_review: 'Check the model, then Send it, or Reject it to upload your own.',
  rejected: 'Upload your files below, then press Send replacement.',
  delivered: 'Delivered to the user.',
  failed: 'Failed. The user was refunded.',
};

beforeEach(() => {
  vi.useRealTimers();
  Object.values(api).forEach((fn) => fn.mockReset());
  authFetch.authenticatedFetch.mockReset();
});

describe('AdminCadQueueDetailPage', () => {
  it('shows only the actions the phase allows', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued'));
    const first = renderPage();
    await loaded();
    expect(actionButtonNames()).toEqual(['Start', 'Reject', 'Fail']);
    first.unmount();

    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review'));
    const second = renderPage();
    await loaded();
    expect(actionButtonNames()).toEqual(['Send', 'Reject', 'Fail']);
    second.unmount();

    api.getSupervisedRun.mockResolvedValue(detail('running'));
    renderPage();
    expect(await screen.findByText('Running. This page updates by itself.')).toBeTruthy();
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
    await loaded();
    openSection('Notes (0)');
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
    await loaded();
    openSection('Details');
    expect(await screen.findByText('run detail')).toBeTruthy();
  });

  it('shows the run id at the top, always, and copies it', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.getSupervisedRun.mockResolvedValue(detail('running'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    await loaded();
    // Visible with every section folded.
    const id = screen.getByText('wf-1');
    expect(id.closest('[aria-expanded="false"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Details' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('wf-1'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    view.unmount();
    vi.useRealTimers();
  });

  it.each(Object.entries(GUIDANCE))('tells the admin what to do when the run is %s', async (phase, sentence) => {
    api.getSupervisedRun.mockResolvedValue(detail(phase as SupervisedPhase));
    renderPage();
    expect(await screen.findByText(sentence)).toBeTruthy();
  });

  it('heads the page with the status, the run type and the user', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('errored', {
      run: { workflow_id: 'wf-1', workflow_name: 'jewelry_cad_improve', user_email: 'buyer@x.com', steps: [] },
      supervision: { ...detail('errored').supervision, attempt: 2, last_error: 'provider credit exhausted\nTraceback: deep' },
    }));
    renderPage();
    expect(await screen.findByText('Errored (attempt 2)')).toBeTruthy();
    expect(screen.getByText('Improve')).toBeTruthy();
    expect(screen.getByText('buyer@x.com')).toBeTruthy();
    const error = screen.getByText(/provider credit exhausted/);
    expect(error.tagName).toBe('PRE');
    expect(error.textContent).toBe('provider credit exhausted\nTraceback: deep');
  });

  it('puts What Send delivers above the Send button', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: true, missing: [], glb_url: 'https://blob.example/m.glb' },
    }));
    renderPage();
    const viewer = await screen.findByTestId('glb');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(viewer.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('folds Notes, History and Details away until opened', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('queued', {
      notes: [{ id: 'n1', author_email: 'a@x.com', body: 'checked the prongs', created_at: '2026-10-24T11:00:00Z' }],
    }));
    renderPage();
    await loaded();
    expect(screen.queryByText('checked the prongs')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'New note' })).toBeNull();
    expect(screen.queryByText('Attempt 1')).toBeNull();
    expect(screen.queryByText('run detail')).toBeNull();
    for (const name of ['Notes (1)', 'History', 'Details']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false');
    }

    openSection('Notes (1)');
    expect(await screen.findByText('checked the prongs')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'New note' })).toBeTruthy();
    openSection('History');
    expect(await screen.findByText('Attempt 1')).toBeTruthy();
    expect(screen.getByText('No events yet.')).toBeTruthy();
    openSection('Details');
    expect(await screen.findByText('run detail')).toBeTruthy();
  });
  it('polls every 5 s after an accepted action, stops after 2 minutes and on unmount', async () => {
    // awaiting_review: a phase with no background refresh of its own, so the stop is visible.
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review'));
    api.rejectSupervisedRun.mockResolvedValue({ accepted: true, phase: 'awaiting_review' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Done. Waiting for the run to move...')).toBeTruthy();
    const before = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.getSupervisedRun.mock.calls.length).toBeGreaterThan(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
    expect(screen.getByText('Still awaiting review. Refresh to check again.')).toBeTruthy();
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
    expect(await screen.findByText('Running. This page updates by itself.', {}, { timeout: 7000 })).toBeTruthy();
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
    await loaded();
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

  it('shows a Fail error on a rejected run beside Fail, not under Send replacement', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected', {
      replacement_check: { has_model: true, missing: [], final_preview: {} },
    }));
    api.failSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(502, 'signal_failed', { code: 'signal_failed' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Fail' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Fail run' }));
    const messages = await screen.findAllByText('Nothing happened. Press again.');
    expect(messages).toHaveLength(1);
    expect(messages[0].parentElement?.contains(screen.getByRole('button', { name: 'Fail' }))).toBe(true);
    expect(messages[0].parentElement?.contains(screen.getByRole('button', { name: 'Send replacement' }))).toBe(false);
  });

  it('shows a Send replacement error under Send replacement, not beside Fail', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected', {
      replacement_check: { has_model: true, missing: [], final_preview: {} },
    }));
    api.sendSupervisedReplacement.mockRejectedValue(new SupervisedRunsApiError(502, 'signal_failed', { code: 'signal_failed' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send replacement' }));
    const messages = await screen.findAllByText('Nothing happened. Press again.');
    expect(messages).toHaveLength(1);
    expect(messages[0].parentElement?.contains(screen.getByRole('button', { name: 'Send replacement' }))).toBe(true);
    expect(messages[0].parentElement?.contains(screen.getByRole('button', { name: 'Fail' }))).toBe(false);
  });

  it('holds Fail while a replacement upload is running', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected', {
      replacement_check: { has_model: false, missing: [], final_preview: {} },
    }));
    let finish: (value: unknown) => void = () => {};
    api.uploadReplacementFile.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    const fail = await screen.findByRole('button', { name: 'Fail' });
    expect(fail.hasAttribute('disabled')).toBe(false);
    const file = new File(['x'], 'ring.glb');
    fireEvent.change(screen.getByLabelText('GLB model file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fail' }).hasAttribute('disabled')).toBe(true));
    await act(async () => { finish({ upload_id: 'u1', role: 'glb', ref: {} }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fail' }).hasAttribute('disabled')).toBe(false));
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

  it('keeps the run, its upload and its locks on a failed refresh, with a banner', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('rejected', {
      replacement_check: { has_model: false, missing: [], final_preview: {} },
    }));
    api.uploadReplacementFile.mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByRole('button', { name: 'Fail' });
    fireEvent.change(screen.getByLabelText('GLB model file'), { target: { files: [new File(['x'], 'ring.glb')] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fail' }).hasAttribute('disabled')).toBe(true));
    expect(screen.getByText('Uploading... 0%')).toBeTruthy();

    api.getSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(500, 'http_500', {}));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText("Couldn't refresh. Showing the last loaded run.")).toBeTruthy();
    expect(screen.getByText('Replacement')).toBeTruthy();
    expect(screen.getByText('Uploading... 0%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fail' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText(/Failed to load the run/)).toBeNull();
  });

  it('refreshes a working run every 15 s and on Refresh', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('running'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    await screen.findByText('Running. This page updates by itself.');
    const before = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    const afterTick = api.getSupervisedRun.mock.calls.length;
    expect(afterTick).toBeGreaterThan(before);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.getSupervisedRun.mock.calls.length).toBeGreaterThan(afterTick));
    view.unmount();
    vi.useRealTimers();
  });

  it('does not refresh in the background while awaiting review', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderPage();
    await loaded();
    const before = api.getSupervisedRun.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
    expect(api.getSupervisedRun.mock.calls.length).toBe(before);
    view.unmount();
    vi.useRealTimers();
  });

  it('says where the run is now when Send meets invalid_phase, and refetches', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: true, missing: [] },
    }));
    api.sendSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(409, 'invalid_phase', { code: 'invalid_phase', phase: 'finalizing' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const before = api.getSupervisedRun.mock.calls.length;
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This run is now finalizing.')).toBeTruthy();
    expect(api.getSupervisedRun.mock.calls.length).toBeGreaterThan(before);
  });

  it('asks to check again when Send meets acknowledgement_mismatch', async () => {
    api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
      send_check: { has_model: true, missing: [] },
    }));
    api.sendSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(409, 'acknowledgement_mismatch', { code: 'acknowledgement_mismatch' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('The missing list changed. Check it again.')).toBeTruthy();
  });

  describe('What Send delivers', () => {
    const check = (extra: Record<string, unknown>) => detail('awaiting_review', {
      send_check: { has_model: true, missing: [], ...extra },
    });

    it('shows the exact GLB Send delivers in the shared viewer, with a normalized URL', async () => {
      const raw = 'azure://agentic-artifacts/x/model.glb';
      api.getSupervisedRun.mockResolvedValue(check({ glb_url: raw }));
      renderPage();
      expect(await screen.findByText('What Send delivers')).toBeTruthy();
      expect(screen.getByTestId('glb').textContent).toBe(azureUriToUrl(raw) || raw);
      openSection('Details');
      expect(await screen.findByText(/can show an earlier loop/)).toBeTruthy();
    });

    it('says there is no model to send when glb_url is null', async () => {
      api.getSupervisedRun.mockResolvedValue(check({ glb_url: null, has_model: false }));
      renderPage();
      expect(await screen.findByText('No model to send.')).toBeTruthy();
      expect(screen.queryByTestId('glb')).toBeNull();
    });

    it('downloads the 3DM with the normalized URL', async () => {
      const raw = '/artifacts/wf-1/model.3dm';
      const header = '3D Geometry File Format ' + '       7' + 'padding-bytes';
      authFetch.authenticatedFetch.mockResolvedValue({ ok: true, blob: async () => new Blob([header]) });
      const create = vi.fn(() => 'blob:x');
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      api.getSupervisedRun.mockResolvedValue(check({ glb_url: 'azure://a/m.glb', threedm_url: raw }));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Download 3DM' }));
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(authFetch.authenticatedFetch).toHaveBeenCalledWith(azureUriToUrl(raw) || raw);
      expect(create).toHaveBeenCalled();
      click.mockRestore();
    });

    it('shows an error when the 3DM download fails', async () => {
      authFetch.authenticatedFetch.mockResolvedValue({ ok: false, status: 500 });
      api.getSupervisedRun.mockResolvedValue(check({ glb_url: 'azure://a/m.glb', threedm_url: 'azure://a/m.3dm' }));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Download 3DM' }));
      expect(await screen.findByText("Couldn't download the 3DM.")).toBeTruthy();
    });
  });
});
