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
});

beforeEach(() => mockGenerate.mockReset());

const source = new File(['x'], 'ring.png', { type: 'image/png' });

function renderEditor(props: Partial<React.ComponentProps<typeof DesignEditor>> = {}) {
  const onCancel = vi.fn();
  const onApprove = vi.fn();
  render(<DesignEditor open source={source} jewelryType="ring" onCancel={onCancel} onApprove={onApprove} {...props} />);
  return { onCancel, onApprove };
}

describe('DesignEditor', () => {
  it('opens on the uploaded picture as V1, with the optional markup tools', () => {
    renderEditor();
    expect(screen.getByText('V1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: /mark what to change/i })).toBeInTheDocument();
    for (const name of ['Select', 'Brush', 'Rectangle', 'Arrow', 'Erase']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/optional/i).length).toBeGreaterThan(0);
  }, 15000); // first render of the dialog is slow on a loaded machine

  it('offers Looks right only once a new version exists', () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: /looks right/i })).toBeNull();
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
