import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  uploadReplacementFile: vi.fn(),
  removeSupervisedUpload: vi.fn(),
  sendSupervisedReplacement: vi.fn(),
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
    for (const label of labels) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(GLB_HINT)).toBeTruthy();
    unmount();

    renderPanel(detail({}, 'jewelry_cad_improve'));
    expect(screen.queryByText('Design contract')).toBeNull();
    expect(screen.queryByText('Reference manifest')).toBeNull();
    expect(screen.getByText('Full model STL')).toBeTruthy();
  });

  it('refuses a file over 256 MB before any request', () => {
    renderPanel(detail());
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

  it('enables Send replacement only when every missing name is ticked and a jewelry type is chosen', async () => {
    api.sendSupervisedReplacement.mockResolvedValue({ accepted: true, phase: 'finalizing' });
    const onChanged = renderPanel(detail({
      replacement_check: { has_model: true, missing: ['loop_state_artifact', 'jewelry_type'], final_preview: {} },
    }));
    const send = screen.getByRole('button', { name: 'Send replacement' });
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'loop_state_artifact' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'jewelry_type' }));
    expect(send.hasAttribute('disabled')).toBe(true);

    const trigger = screen.getByRole('combobox', { name: 'Jewelry type' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'ring' }));
    await waitFor(() => expect(send.hasAttribute('disabled')).toBe(false));

    fireEvent.click(send);
    await waitFor(() => expect(api.sendSupervisedReplacement).toHaveBeenCalled());
    expect(api.sendSupervisedReplacement).toHaveBeenCalledWith(
      'wf-1', expect.arrayContaining(['loop_state_artifact', 'jewelry_type']), 'ring',
    );
    expect(api.sendSupervisedReplacement.mock.calls[0][1]).toHaveLength(2);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
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
