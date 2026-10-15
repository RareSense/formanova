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

async function makeChange() {
  mockGenerate.mockResolvedValueOnce(NEW_VERSION);
  fireEvent.change(screen.getByLabelText(/describe any change/i), { target: { value: 'make the stone oval' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.queryByText('Original')).toBeNull());
}

function looksRight() {
  fireEvent.click(screen.getByRole('button', { name: /looks right/i }));
}

describe('DesignEditor', () => {
  it('opens on the uploaded picture as the Original, with a small markup toolbar and the price inside Send', () => {
    renderEditor();
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: /mark what to change/i })).toBeInTheDocument();
    for (const name of ['Select', 'Brush', 'Rectangle', 'Arrow', 'Erase']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}$`) })).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText(/describe any change/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toHaveTextContent('10');
  }, 15000); // first render of the dialog is slow on a loaded machine

  it('each change replaces the picture: no versions are shown', async () => {
    renderEditor();
    await makeChange();
    expect(screen.queryByText(/versions/i)).toBeNull();
    expect(screen.queryByText(/^V\d/)).toBeNull();
    expect(screen.getByAltText(/your edited design/i)).toBeInTheDocument();
  });


  it('offers Looks right only once a change has been made', async () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: /looks right/i })).toBeNull();
    await makeChange();
    expect(screen.getByRole('button', { name: /looks right/i })).toBeEnabled();
  });

  it('offers mark colours for the brush, rectangle and arrow, not the eraser', () => {
    renderEditor();
    expect(screen.queryByRole('radiogroup', { name: /mark colour/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^brush$/i }));
    const blue = screen.getByRole('radio', { name: /blue/i });
    fireEvent.click(blue);
    expect(blue).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^erase$/i }));
    expect(screen.queryByRole('radiogroup', { name: /mark colour/i })).toBeNull();
  });




  it('Looks right opens Ready for CAD: the design, optional views and dimensions, and Create CAD', async () => {
    const { onCreateCad } = renderEditor();
    await makeChange();
    looksRight();
    expect(screen.getByRole('heading', { name: /ready for cad/i })).toBeInTheDocument();
    expect(screen.getByAltText(/your approved design/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dimensions/i)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: /^create cad/i });
    expect(create).toHaveTextContent('140');
    fireEvent.click(create);
    await waitFor(() => expect(onCreateCad).toHaveBeenCalledTimes(1));
    expect(onCreateCad.mock.calls[0][0]).toHaveLength(1);
  });



  it('with several photos, thumbnails switch photos and each keeps its own edit', async () => {
    const extra = new File(['y'], 'side.png', { type: 'image/png' });
    const { onCreateCad } = renderEditor({ extras: [extra] });
    expect(screen.getAllByRole('tab', { name: /photo/i })).toHaveLength(2);
    await makeChange();
    expect(screen.getByRole('tab', { name: /photo 1 \(edited\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /photo 2/i }));
    expect(screen.getByRole('tab', { name: /photo 2/i })).toHaveAttribute('aria-selected', 'true');
    looksRight();
    expect(screen.getByText(/photos sent to the cad/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^create cad/i }));
    await waitFor(() => expect(onCreateCad).toHaveBeenCalledTimes(1));
    expect(onCreateCad.mock.calls[0][0]).toHaveLength(2);
  });

  it('Apply to all photos sends the same change to the other photos (Lightroom-style sync)', async () => {
    const extra = new File(['y'], 'side.png', { type: 'image/png' });
    renderEditor({ extras: [extra] });
    expect(screen.queryByRole('button', { name: /apply to all photos/i })).toBeNull();
    await makeChange();
    mockGenerate.mockResolvedValueOnce(NEW_VERSION);
    const apply = screen.getByRole('button', { name: /apply to all photos/i });
    expect(apply).toHaveTextContent('10');
    await act(async () => { fireEvent.click(apply); });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
    const [requests] = mockGenerate.mock.calls[1];
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ prompt: 'make the stone oval' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /photo 2 \(edited\)/i })).toBeInTheDocument());
  });

  it('closing after approval keeps the approved pictures on the page', async () => {
    const { onKeep, onCancel } = renderEditor();
    await makeChange();
    looksRight();
    fireEvent.click(screen.getByRole('button', { name: /^close/i }));
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
    fireEvent.change(screen.getByLabelText(/describe any change/i), { target: { value: 'make the stone oval' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText(/making your change/i)).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/describe any change/i), { target: { value: 'oval' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/discard edits/i);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('switches tools from the keyboard', () => {
    renderEditor();
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: /^brush$/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: /^rectangle$/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
