import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
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
vi.mock('@/pages/AdminGenerationDetailPage', () => ({
  DetailContent: () => <div>run detail</div>,
  RunInputsPanel: () => <div>customer inputs</div>,
}));
const cadResult = vi.hoisted(() => ({ fetchCadResult: vi.fn() }));
vi.mock('@/lib/cad-result-api', () => cadResult);

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

const IGNORED = ['Back to CAD Queue', 'Refresh', 'Add note', 'Choose file', 'Replace file', 'Remove', 'What will be sent', 'Send replacement', 'Download 3DM', 'History', 'Details', 'More files', 'Copy run ID', 'Copied'];
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
  queued: 'Press Start to run it, or Reject to skip the AI and upload your own files.',
  errored: 'It broke. Press Start to try again, Reject to upload your own files, or Fail to refund the user.',
  running: 'Running. This page updates by itself.',
  finalizing: 'Running. This page updates by itself.',
  awaiting_review: 'Check the model, then Send it, or Reject it to upload your own.',
  rejected: 'Upload your files below, then press Send replacement.',
  delivered: 'Delivered to the user.',
  failed: 'Failed. The user was refunded.',
};

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

function withTiers(phase: SupervisedPhase, tiers: { llm_tier: string | null; analysis_tier: string | null }) {
  const base = detail(phase);
  return { ...base, supervision: { ...base.supervision, tiers } };
}

async function choose(label: string, optionName: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

beforeEach(() => {
  vi.useRealTimers();
  Object.values(api).forEach((fn) => fn.mockReset());
  authFetch.authenticatedFetch.mockReset();
  cadResult.fetchCadResult.mockReset();
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
    await waitFor(() => expect(api.sendSupervisedRun).toHaveBeenCalledWith('wf-1', [], ''));
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
    await waitFor(() => expect(api.failSupervisedRun).toHaveBeenCalledWith('wf-1', ''));
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
    fireEvent.click(screen.getByRole('button', { name: 'Copy run ID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('wf-1'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole('button', { name: 'Copy run ID' })).toBeTruthy();
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
    expect(api.sendSupervisedReplacement).toHaveBeenCalledWith('wf-1', [], undefined, '');
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

  describe('customer inputs, the delivered model and the generation count', () => {
    it('shows the customer inputs open, above the actions, in every phase', async () => {
      for (const phase of ['queued', 'rejected', 'delivered'] as SupervisedPhase[]) {
        api.getSupervisedRun.mockResolvedValue(detail(phase));
        cadResult.fetchCadResult.mockResolvedValue({ glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: false });
        const view = renderPage();
        await loaded();
        expect(screen.getByText('Customer inputs')).toBeTruthy();
        expect(screen.getByText('customer inputs')).toBeTruthy();
        view.unmount();
      }
    });

    it('shows a delivered run with the model the user got and where it came from', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('delivered', {
        supervision: { ...detail('delivered').supervision, decision: 'send_replacement' },
      }));
      cadResult.fetchCadResult.mockResolvedValue({ glb_url: '/api/artifacts/abc', threedm_url: null, azure_source: null, not_all_solid: false, pending: false });
      renderPage();
      expect(await screen.findByText('What the user got')).toBeTruthy();
      expect(screen.getByText('Your uploaded replacement.')).toBeTruthy();
      expect((await screen.findByTestId('glb')).textContent).toBe('/api/artifacts/abc');
      expect(cadResult.fetchCadResult).toHaveBeenCalledWith('wf-1');
    });

    it('counts how many times the run was generated', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', {
        supervision: { ...detail('awaiting_review').supervision, events: [
          { event: 'attempt_started', at: '2026-10-24T10:00:00Z' },
          { event: 'attempt_errored', at: '2026-10-24T10:10:00Z' },
          { event: 'attempt_started', at: '2026-10-24T10:20:00Z' },
        ] },
      }));
      renderPage();
      expect(await screen.findByText('Generated 2 times')).toBeTruthy();
    });

    it('says a run that never ran was not generated yet', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('queued'));
      renderPage();
      expect(await screen.findByText('Not generated yet')).toBeTruthy();
    });
  });

  describe('note to the user', () => {
    it('sends the note with Send', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('awaiting_review', { send_check: { has_model: true, missing: [] } }));
      api.sendSupervisedRun.mockResolvedValue({ accepted: true, phase: 'awaiting_review' });
      renderPage();
      await loaded();
      fireEvent.change(screen.getByRole('textbox', { name: 'Note to user' }), { target: { value: 'Send sharper photos.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(api.sendSupervisedRun).toHaveBeenCalledWith('wf-1', [], 'Send sharper photos.'));
    });

    it('sends the note with Fail', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('queued'));
      api.failSupervisedRun.mockResolvedValue({ accepted: true, phase: 'queued' });
      renderPage();
      await loaded();
      fireEvent.change(screen.getByRole('textbox', { name: 'Note to user' }), { target: { value: 'Photos too dark.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Fail run' }));
      await waitFor(() => expect(api.failSupervisedRun).toHaveBeenCalledWith('wf-1', 'Photos too dark.'));
    });

    it('keeps the draft when the press is refused, and says why for a bad note', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('queued'));
      api.failSupervisedRun.mockRejectedValue(new SupervisedRunsApiError(422, 'bad_user_note', { max_chars: 2000 }));
      renderPage();
      await loaded();
      fireEvent.change(screen.getByRole('textbox', { name: 'Note to user' }), { target: { value: 'Keep me.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Fail run' }));
      expect(await screen.findByText(/The note to the user can't be saved/)).toBeTruthy();
      expect((screen.getByRole('textbox', { name: 'Note to user' }) as HTMLTextAreaElement).value).toBe('Keep me.');
    });

    it('counts characters, not UTF-16 units, and refuses a change past 2,000', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('queued'));
      renderPage();
      await loaded();
      const box = screen.getByRole('textbox', { name: 'Note to user' }) as HTMLTextAreaElement;
      fireEvent.change(box, { target: { value: '\u{1F48E}\u{1F48E}' } });
      expect(screen.getByText('2 / 2000')).toBeTruthy();
      fireEvent.change(box, { target: { value: 'a'.repeat(2000) } });
      expect(screen.getByText('2000 / 2000')).toBeTruthy();
      fireEvent.change(box, { target: { value: 'a'.repeat(2001) } });
      expect(box.value).toBe('a'.repeat(2000));
    });

    it('shows the saved note, who wrote it and no box once decided', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('failed', {
        supervision: { ...detail('failed').supervision, decision: 'fail', user_note: 'Line one\nLine two', decided_by_email: 'qc@x.com', decided_at: '2026-10-26T10:00:00Z' },
      }));
      renderPage();
      const note = await screen.findByText(/Line one/);
      expect(note.textContent).toBe('Line one\nLine two');
      expect(screen.getByText('qc@x.com')).toBeTruthy();
      expect(screen.queryByRole('textbox', { name: 'Note to user' })).toBeNull();
    });

    it('offers no note box while the run is running', async () => {
      api.getSupervisedRun.mockResolvedValue(detail('running'));
      renderPage();
      await loaded();
      expect(screen.queryByRole('textbox', { name: 'Note to user' })).toBeNull();
    });
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

  describe('AI pickers', () => {
    it('defaults each picker from supervision.tiers, and to Default when null', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: 'gpt_6_astra_openai', analysis_tier: null }));
      renderPage();
      await loaded();
      expect(screen.getByRole('combobox', { name: 'Build AI' }).textContent).toContain('GPT-6 Astra');
      expect(screen.getByRole('combobox', { name: 'Review AI' }).textContent).toContain('Default');
      expect(screen.getByText("Applies to this run's Start and later restarts.")).toBeTruthy();
    });

    it('shows the pickers for an errored run but not for other phases', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('errored', { llm_tier: null, analysis_tier: null }));
      const first = renderPage();
      await loaded();
      expect(screen.getByRole('combobox', { name: 'Build AI' })).toBeTruthy();
      first.unmount();
      api.getSupervisedRun.mockResolvedValue(withTiers('awaiting_review', { llm_tier: null, analysis_tier: null }));
      renderPage();
      await loaded();
      expect(screen.queryByRole('combobox', { name: 'Build AI' })).toBeNull();
    });

    it('sends the changed Build AI and the unchanged Review AI when Start is pressed', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: null, analysis_tier: 'gpt_6_astra_openai' }));
      api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-1', accepted: true }]);
      renderPage();
      await loaded();
      await choose('Build AI', 'GPT-6 Astra Pro');
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
      expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-1'], { llm_tier: 'gpt_6_astra_pro_openrouter', analysis_tier: 'gpt_6_astra_openai' });
    });

    it('sends the run own real tier when the pickers are untouched, and omits Default', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: 'gpt_6_astra_openai', analysis_tier: null }));
      api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-1', accepted: true }]);
      renderPage();
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
      expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-1'], { llm_tier: 'gpt_6_astra_openai' });
    });

    it('sends no tiers when both pickers are untouched on Default', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: null, analysis_tier: null }));
      api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-1', accepted: true }]);
      renderPage();
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
      expect(api.startSupervisedRuns.mock.calls[0]).toEqual([['wf-1']]);
    });

    it('offers Default only while the run is on the default, since it cannot be sent', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: 'gpt_6_astra_openai', analysis_tier: null }));
      renderPage();
      await loaded();
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Build AI' }), { key: 'Enter' });
      await screen.findAllByRole('option');
      expect(screen.queryByRole('option', { name: 'Default' })).toBeNull();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Review AI' }), { key: 'Enter' });
      expect(await screen.findByRole('option', { name: 'Default' })).toBeTruthy();
    });

    it('shows an unknown current value as its own option and sends it on Start', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: 'mystery_tier_9', analysis_tier: null }));
      api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-1', accepted: true }]);
      renderPage();
      await loaded();
      expect(screen.getByRole('combobox', { name: 'Build AI' }).textContent).toContain('mystery_tier_9');
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledTimes(1));
      expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-1'], { llm_tier: 'mystery_tier_9' });
    });
  });
  describe('AI shown read-only', () => {
    it('says Running with, and names both AIs, while running', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('running', { llm_tier: 'gpt_6_astra_openai', analysis_tier: 'mystery_tier_9' }));
      renderPage();
      await loaded();
      const line = screen.getByText(/Running with/);
      expect(line.textContent).toBe('Running with Build AI: GPT-6 Astra · Direct API · Review AI: mystery_tier_9');
      expect(screen.queryByRole('combobox', { name: 'Build AI' })).toBeNull();
    });

    it('says Ran with once delivered', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('delivered', { llm_tier: 'gpt_6_astra_openai', analysis_tier: 'gpt_6_astra_pro_openrouter' }));
      renderPage();
      await loaded();
      expect(screen.getByText(/Ran with/).textContent).toContain('Review AI: GPT-6 Astra Pro · OpenRouter');
    });

    it('shows Default for null tiers', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('awaiting_review', { llm_tier: null, analysis_tier: null }));
      renderPage();
      await loaded();
      expect(screen.getByText(/Ran with/).textContent).toBe('Ran with Build AI: Default · Review AI: Default');
    });

    it('is not shown beside the pickers', async () => {
      api.getSupervisedRun.mockResolvedValue(withTiers('queued', { llm_tier: null, analysis_tier: null }));
      renderPage();
      await loaded();
      expect(screen.queryByText(/Ran with|Running with/)).toBeNull();
    });
  });
});
