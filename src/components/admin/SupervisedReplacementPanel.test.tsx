import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  uploadReplacementFile: vi.fn(),
  removeSupervisedUpload: vi.fn(),
  sendSupervisedReplacement: vi.fn(),
  getSupervisedRun: vi.fn(),
}));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));

import SupervisedReplacementPanel from './SupervisedReplacementPanel';
import { SupervisedRunsApiError, type SupervisedRunDetail } from '@/lib/supervised-runs-api';

const GLB_HINT = "Must differ from the pipeline's model. An identical GLB saves nothing and the user gets no model; use Send instead.";

function detail(extra: Partial<SupervisedRunDetail> = {}, workflowName = 'jewelry_cad_generate'): SupervisedRunDetail {
  return {
    run: { workflow_id: 'wf-1', workflow_name: workflowName, steps: [] },
    supervision: {
      phase: 'rejected',
      attempt: 1,
      attempt_started_at: null,
      last_error: null,
      last_error_at: null,
      decision: 'rejected',
      decided_by_email: null,
      decided_at: null,
      acknowledged_missing: null,
      delivery: null,
      events: [],
    },
    send_check: null,
    replacement_check: { has_model: true, missing: [], final_preview: {} },
    uploads: [],
    notes: [],
    download_urls: {},
    ...extra,
  };
}

function renderPanel(data: SupervisedRunDetail, onChanged = vi.fn()) {
  render(<SupervisedReplacementPanel detail={data} workflowId="wf-1" onChanged={onChanged} />);
  return onChanged;
}

function sizedFile(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function pick(label: string, file: File) {
  fireEvent.change(screen.getByLabelText(`${label} file`), { target: { files: [file] } });
}

function openMoreFiles() {
  fireEvent.click(screen.getByRole('button', { name: 'More files' }));
}

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('SupervisedReplacementPanel', () => {
  it('shows every role for a generate run, hides generate-only roles otherwise, and warns under the GLB', () => {
    const labels = [
      'GLB model', 'Rhino 3DM', 'Viewer 3DM (mesh only)', 'CAD code', 'Loop state', 'Thumbnail',
      'Design contract', 'Reference manifest', 'Full model STL', 'Full model STEP', 'Casting STL', 'Stone list',
    ];
    const { unmount } = render(
      <SupervisedReplacementPanel detail={detail()} workflowId="wf-1" onChanged={vi.fn()} />,
    );
    openMoreFiles();
    for (const label of labels) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(GLB_HINT)).toBeTruthy();
    unmount();

    renderPanel(detail({}, 'jewelry_cad_improve'));
    openMoreFiles();
    expect(screen.queryByText('Design contract')).toBeNull();
    expect(screen.queryByText('Reference manifest')).toBeNull();
    expect(screen.getByText('Full model STL')).toBeTruthy();
  });

  it('shows the main files first and folds the rest under More files', () => {
    renderPanel(detail());
    for (const label of ['GLB model', 'Rhino 3DM', 'CAD code', 'Loop state', 'Design contract', 'Reference manifest']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    const more = screen.getByRole('button', { name: 'More files' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    for (const label of ['Viewer 3DM (mesh only)', 'Thumbnail', 'Full model STL', 'Full model STEP', 'Casting STL', 'Stone list']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    fireEvent.click(more);
    expect(screen.getByText('Casting STL')).toBeTruthy();
    expect(screen.getByLabelText('Casting STL file')).toBeTruthy();
  });

  it('keeps a role that already has an upload in view while More files is closed', () => {
    renderPanel(detail({
      uploads: [{
        upload_id: 'u2',
        role: 'casting_stl',
        filename: 'casting.stl',
        status: 'verified',
        bytes: 4096,
        sha256: null,
        uploaded_by_email: 'a@b.c',
        created_at: '2026-10-24T10:00:00Z',
        verified_at: '2026-10-24T10:01:00Z',
      }],
    }));
    expect(screen.getByRole('button', { name: 'More files' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Casting STL')).toBeTruthy();
    expect(screen.getByText('casting.stl')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.queryByText('Stone list')).toBeNull();
  });

  it('refuses a file over 256 MB before any request', () => {
    renderPanel(detail());
    openMoreFiles();
    pick('Full model STL', sizedFile('big.stl', 300_000_000));
    expect(screen.getByText("Files over 256 MB aren't supported yet.")).toBeTruthy();
    expect(api.uploadReplacementFile).not.toHaveBeenCalled();
  });

  it('uploads a picked GLB and then refreshes', async () => {
    api.uploadReplacementFile.mockResolvedValue({ upload_id: 'u1', role: 'glb', ref: {} });
    const onChanged = renderPanel(detail());
    const file = sizedFile('ring.glb', 1000);
    pick('GLB model', file);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.uploadReplacementFile).toHaveBeenCalledWith(
      'wf-1', 'glb', file, expect.objectContaining({ onProgress: expect.any(Function) }),
    );
  });

  it('shows the refusal reason when the check refuses the file', async () => {
    api.uploadReplacementFile.mockRejectedValue(
      new SupervisedRunsApiError(422, 'upload_invalid', { code: 'upload_invalid', reason: 'bad_signature' }),
    );
    renderPanel(detail());
    pick('GLB model', sizedFile('ring.glb', 1000));
    expect(await screen.findByText('Refused: bad_signature. Upload it again.')).toBeTruthy();
  });

  it('enables Send replacement only when every acknowledgeable name is ticked and a jewelry type is chosen', async () => {
    api.sendSupervisedReplacement.mockResolvedValue({ accepted: true, phase: 'finalizing' });
    const onChanged = renderPanel(detail({
      replacement_check: { has_model: true, missing: ['loop_state_artifact', 'jewelry_type'], final_preview: {} },
    }));
    const send = screen.getByRole('button', { name: 'Send replacement' });
    expect(send.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'jewelry_type' })).toBeNull();
    expect(screen.getByText('Jewelry type (required)')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'loop_state_artifact' }));
    expect(send.hasAttribute('disabled')).toBe(true);

    const trigger = screen.getByRole('combobox', { name: 'Jewelry type' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'ring' }));
    await waitFor(() => expect(send.hasAttribute('disabled')).toBe(false));

    fireEvent.click(send);
    await waitFor(() => expect(api.sendSupervisedReplacement).toHaveBeenCalled());
    expect(api.sendSupervisedReplacement).toHaveBeenCalledWith('wf-1', ['loop_state_artifact'], 'ring', undefined);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('needs only a picked type when jewelry_type is the only missing name', async () => {
    api.sendSupervisedReplacement.mockResolvedValue({ accepted: true, phase: 'finalizing' });
    renderPanel(detail({
      replacement_check: { has_model: true, missing: ['jewelry_type'], final_preview: {} },
    }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Nothing is missing.')).toBeNull();
    const send = screen.getByRole('button', { name: 'Send replacement' });
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jewelry type' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'ring' }));
    await waitFor(() => expect(send.hasAttribute('disabled')).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(api.sendSupervisedReplacement).toHaveBeenCalledWith('wf-1', [], 'ring', undefined));
  });

  it('drops a tick when its name leaves the missing list, so it comes back unticked', () => {
    const check = (missing: string[]) => detail({ replacement_check: { has_model: true, missing, final_preview: {} } });
    const { rerender } = render(
      <SupervisedReplacementPanel detail={check(['loop_state_artifact', 'code_artifact'])} workflowId="wf-1" onChanged={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'loop_state_artifact' }));
    rerender(<SupervisedReplacementPanel detail={check(['code_artifact'])} workflowId="wf-1" onChanged={vi.fn()} />);
    rerender(
      <SupervisedReplacementPanel detail={check(['loop_state_artifact', 'code_artifact'])} workflowId="wf-1" onChanged={vi.fn()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'loop_state_artifact' }).getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(screen.getByRole('checkbox', { name: 'code_artifact' }));
    expect(screen.getByRole('button', { name: 'Send replacement' }).hasAttribute('disabled')).toBe(true);
  });

  it('says the run moved when an upload meets invalid_phase', async () => {
    api.uploadReplacementFile.mockRejectedValue(new SupervisedRunsApiError(409, 'invalid_phase', { code: 'invalid_phase' }));
    renderPanel(detail());
    pick('GLB model', sizedFile('ring.glb', 1000));
    expect(await screen.findByText('This run is no longer rejected. Refresh the page.')).toBeTruthy();
  });

  it('says nothing is missing when the model is there and the missing list is empty', () => {
    renderPanel(detail({ replacement_check: { has_model: true, missing: [], final_preview: {} } }));
    expect(screen.getByText('Nothing is missing.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says the file was already removed when Remove meets no_verified_upload', async () => {
    api.removeSupervisedUpload.mockRejectedValue(new SupervisedRunsApiError(409, 'no_verified_upload', { code: 'no_verified_upload' }));
    renderPanel(detail({
      uploads: [{
        upload_id: 'u1',
        role: 'glb',
        filename: 'ring-final.glb',
        status: 'verified',
        bytes: 2048,
        sha256: null,
        uploaded_by_email: 'a@b.c',
        created_at: '2026-10-24T10:00:00Z',
        verified_at: '2026-10-24T10:01:00Z',
      }],
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('That file was already removed. Refresh the page.')).toBeTruthy();
  });

  it('asks for the GLB first when there is no model', () => {
    renderPanel(detail({ replacement_check: { has_model: false, missing: [], final_preview: {} } }));
    expect(screen.getByText('Upload the GLB first.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send replacement' }).hasAttribute('disabled')).toBe(true);
  });

  describe('a check that outlasts the proxy', () => {
    const TIMEOUT_COPY = 'The check is taking long. Refresh in a minute to see if it finished.';
    const proxyTimeout = () => new SupervisedRunsApiError(524, 'http_524', { upload_id: 'u9' });
    const verifiedGlb = (uploadId: string) => detail({
      uploads: [{
        upload_id: uploadId,
        role: 'glb',
        filename: 'ring.glb',
        status: 'verified',
        bytes: 1000,
        sha256: null,
        uploaded_by_email: 'a@b.c',
        created_at: '2026-10-24T10:00:00Z',
        verified_at: '2026-10-24T10:01:00Z',
      }],
    });

    afterEach(() => { vi.useRealTimers(); });

    it('keeps checking after a 524 and succeeds once the upload shows as verified', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(proxyTimeout());
      api.getSupervisedRun
        .mockResolvedValueOnce(detail())
        .mockResolvedValue(verifiedGlb('u9'));
      const onBusy = vi.fn();
      const onChanged = vi.fn();
      render(<SupervisedReplacementPanel detail={detail()} workflowId="wf-1" onChanged={onChanged} onBusyChange={onBusy} />);
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Still checking...')).toBeTruthy();
      expect(onBusy).toHaveBeenLastCalledWith(true);
      expect(onChanged).not.toHaveBeenCalled();

      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(api.getSupervisedRun).toHaveBeenCalledWith('wf-1');
      expect(onChanged).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Still checking...')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onBusy).toHaveBeenLastCalledWith(false);
      expect(api.uploadReplacementFile).toHaveBeenCalledTimes(1);
    });

    it('does not take an older verified file of the same role for the new one', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(proxyTimeout());
      api.getSupervisedRun.mockResolvedValue(verifiedGlb('u-old'));
      const onChanged = vi.fn();
      render(<SupervisedReplacementPanel detail={verifiedGlb('u-old')} workflowId="wf-1" onChanged={onChanged} />);
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Still checking...')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(onChanged).not.toHaveBeenCalled();
      expect(screen.getByText('Still checking...')).toBeTruthy();
    });

    const removedGlb = (uploadId: string) => detail({
      uploads: [{
        upload_id: uploadId,
        role: 'glb',
        filename: 'ring.glb',
        status: 'removed',
        bytes: 1000,
        sha256: null,
        uploaded_by_email: 'a@b.c',
        created_at: '2026-10-24T10:00:00Z',
        verified_at: null,
      }],
    });

    it('stops waiting as soon as this upload shows as removed, and asks for it again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(proxyTimeout());
      api.getSupervisedRun.mockResolvedValue(removedGlb('u9'));
      const onBusy = vi.fn();
      const onChanged = vi.fn();
      render(<SupervisedReplacementPanel detail={detail()} workflowId="wf-1" onChanged={onChanged} onBusyChange={onBusy} />);
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Still checking...')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(await screen.findByText('This file failed the check. Upload it again.')).toBeTruthy();
      expect(screen.queryByText('Still checking...')).toBeNull();
      expect(onBusy).toHaveBeenLastCalledWith(false);
      expect(onChanged).not.toHaveBeenCalled();
      expect(api.uploadReplacementFile).toHaveBeenCalledTimes(1);
      const polls = api.getSupervisedRun.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(api.getSupervisedRun.mock.calls.length).toBe(polls);
    });

    it('does not stop for a different removed upload in the same role', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(proxyTimeout());
      api.getSupervisedRun.mockResolvedValue(removedGlb('u-old'));
      render(<SupervisedReplacementPanel detail={detail()} workflowId="wf-1" onChanged={vi.fn()} />);
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Still checking...')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(screen.getByText('Still checking...')).toBeTruthy();
      expect(screen.queryByText('This file failed the check. Upload it again.')).toBeNull();
    });

    it('gives up after 3 minutes with a refresh hint and releases the busy state', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(new SupervisedRunsApiError(0, 'network_error', { upload_id: 'u9' }));
      api.getSupervisedRun.mockResolvedValue(detail());
      const onBusy = vi.fn();
      const onChanged = vi.fn();
      render(<SupervisedReplacementPanel detail={detail()} workflowId="wf-1" onChanged={onChanged} onBusyChange={onBusy} />);
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Still checking...')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(170_000); });
      expect(screen.queryByText(TIMEOUT_COPY)).toBeNull();
      expect(onBusy).toHaveBeenLastCalledWith(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
      expect(await screen.findByText(TIMEOUT_COPY)).toBeTruthy();
      expect(screen.queryByText('Still checking...')).toBeNull();
      expect(onBusy).toHaveBeenLastCalledWith(false);
      expect(onChanged).not.toHaveBeenCalled();
      expect(api.uploadReplacementFile).toHaveBeenCalledTimes(1);
      const polls = api.getSupervisedRun.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(api.getSupervisedRun.mock.calls.length).toBe(polls);
    });

    it('shows a coded upload_invalid at once, without polling', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.uploadReplacementFile.mockRejectedValue(
        new SupervisedRunsApiError(422, 'upload_invalid', { code: 'upload_invalid', reason: 'bad_signature', upload_id: 'u9' }),
      );
      renderPanel(detail());
      pick('GLB model', sizedFile('ring.glb', 1000));
      expect(await screen.findByText('Refused: bad_signature. Upload it again.')).toBeTruthy();
      expect(screen.queryByText('Still checking...')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(api.getSupervisedRun).not.toHaveBeenCalled();
    });
  });

  it('shows a verified upload with a Remove button', async () => {
    api.removeSupervisedUpload.mockResolvedValue({ removed: true });
    const onChanged = renderPanel(detail({
      uploads: [{
        upload_id: 'u1',
        role: 'glb',
        filename: 'ring-final.glb',
        status: 'verified',
        bytes: 2048,
        sha256: null,
        uploaded_by_email: 'a@b.c',
        created_at: '2026-10-24T10:00:00Z',
        verified_at: '2026-10-24T10:01:00Z',
      }],
      download_urls: { glb: 'https://blob.example/ring-final.glb' },
    }));
    expect(screen.getByText('ring-final.glb')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removeSupervisedUpload).toHaveBeenCalledWith('wf-1', 'glb'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
