import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDesignImageRun', () => ({ useDesignImageRun: () => ({ generate: mockGenerate, running: false }) }));

import DesignEditor from './DesignEditor';

beforeAll(() => {
  // jsdom has no ResizeObserver, object URLs or canvas.
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  // Result pictures and approved pictures are fetched as blobs.
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) })) as never;
});

beforeEach(() => mockGenerate.mockReset());

const source = new File(['x'], 'ring.png', { type: 'image/png' });

function renderEditor(props: Partial<React.ComponentProps<typeof DesignEditor>> = {}) {
  const onCancel = vi.fn();
  const onKeep = vi.fn();
  const onCreateCad = vi.fn();
  render(
    <DesignEditor
      open source={source} jewelryType="ring" onCancel={onCancel} onKeep={onKeep} onCreateCad={onCreateCad}
      dimensions="" onDimensions={vi.fn()} cadCost={140} cadCostLoading={false} creatingCad={false}
      {...props}
    />,
  );
  return { onCancel, onKeep, onCreateCad };
}

const NEW_VERSION = [{ ok: true, result: { image: { uri: 'u', url: 'https://x/v2.png', type: 'image/png', bytes: 1, sha256: 's' }, consistent: null, drift: [], view: null } }];

async function makeNewVersion() {
  mockGenerate.mockResolvedValueOnce(NEW_VERSION);
  fireEvent.change(screen.getByLabelText(/describe what to change/i), { target: { value: 'make the stone oval' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await screen.findByText('V1 of 1');
}

/** Approve the version showing: the next steps appear only after this. */
function approveShown() {
  fireEvent.click(screen.getByRole('button', { name: /approve v1/i }));
}

describe('DesignEditor', () => {
  it('opens on the uploaded picture as the Original (not a version), with the optional markup tools', () => {
    renderEditor();
    expect(screen.getAllByText('Original').length).toBeGreaterThan(0);
    expect(screen.queryByText(/of 1$/)).toBeNull();
    expect(screen.getByRole('toolbar', { name: /mark what to change/i })).toBeInTheDocument();
    for (const name of ['Select', 'Brush', 'Rectangle', 'Arrow', 'Erase']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/optional/i).length).toBeGreaterThan(0);
  }, 15000); // first render of the dialog is slow on a loaded machine

  it('offers Approve and Try again for a new version, and the next steps only once approved', async () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    await makeNewVersion();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /make it cad/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add more angles/i })).toBeNull();
    approveShown();
    expect(screen.getByRole('button', { name: /add more angles/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /make it cad/i })).toBeEnabled();
  });

  it('Try again makes the version again from the same request, as a new version', async () => {
    renderEditor();
    await makeNewVersion();
    const firstRequest = mockGenerate.mock.calls[0][0];
    mockGenerate.mockResolvedValueOnce(NEW_VERSION);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByText('V2 of 2');
    expect(mockGenerate.mock.calls[1][0]).toEqual(firstRequest);
  });

  it('Make it CAD goes to Ready for CAD, and Generate CAD hands over the approved picture', async () => {
    const { onCreateCad } = renderEditor();
    await makeNewVersion();
    approveShown();
    fireEvent.click(screen.getByRole('button', { name: /make it cad/i }));
    expect(screen.getByText(/ready for cad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dimensions/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /generate cad/i }));
    await waitFor(() => expect(onCreateCad).toHaveBeenCalledTimes(1));
    expect(onCreateCad.mock.calls[0][0]).toHaveLength(1);
  });

  it('Add more angles suggests four angles for the piece, three ticked', async () => {
    renderEditor();
    await makeNewVersion();
    approveShown();
    fireEvent.click(screen.getByRole('button', { name: /add more angles/i }));
    expect(screen.getByText(/more angles/i, { selector: 'h2' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(3);
    expect(screen.getByRole('button', { name: /make 3 angles/i })).toBeInTheDocument();
  });

  it('closing after approval keeps the approved pictures on the page', async () => {
    const { onKeep, onCancel } = renderEditor();
    await makeNewVersion();
    approveShown();
    fireEvent.click(screen.getByRole('button', { name: /make it cad/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(onKeep).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cannot send an empty change', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('shows the generating state while a change is being made', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGenerate.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderEditor();
    fireEvent.change(screen.getByLabelText(/describe what to change/i), { target: { value: 'make the stone oval' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText(/making your new version/i)).toBeInTheDocument();
    expect(screen.getByText(/takes a few seconds/i)).toBeInTheDocument();
    await act(async () => { resolve([{ ok: false, message: 'That picture was blocked.', retryable: false }]); });
    expect(await screen.findByRole('alert')).toHaveTextContent('That picture was blocked.');
  });

  it('closes straight away when nothing was changed', () => {
    const { onCancel } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks before throwing away a typed change', async () => {
    const { onCancel } = renderEditor();
    fireEvent.change(screen.getByLabelText(/describe what to change/i), { target: { value: 'oval' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/discard your edits/i);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('switches tools from the keyboard', () => {
    renderEditor();
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: /brush/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: /rectangle/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
