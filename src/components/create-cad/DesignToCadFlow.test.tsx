import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDesignImageRun', () => ({ useDesignImageRun: () => ({ generate: mockGenerate, running: false }) }));
vi.mock('@/hooks/use-estimated-cost', () => ({ useEstimatedCost: () => ({ cost: 140, loading: false }) }));

import DesignToCadFlow from './DesignToCadFlow';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) })) as never;
});

beforeEach(() => mockGenerate.mockReset());

const READY = { ok: true, result: { image: { uri: 'u', url: 'https://x/d.png', type: 'image/png', bytes: 1, sha256: 's' }, consistent: null, drift: [], view: null } };

function renderFlow(jewelryType: 'ring' | null = 'ring', variant: 'idea' | 'inspiration' = 'idea') {
  const onCreateCad = vi.fn();
  const view = render(
    <DesignToCadFlow
      jewelryType={jewelryType} setJewelryType={vi.fn()} dimensions="" onDimensions={vi.fn()}
      cadCost={140} cadCostLoading={false} creatingCad={false} onCreateCad={onCreateCad} variant={variant}
    />,
  );
  return { onCreateCad, container: view.container };
}

describe('DesignToCadFlow', () => {
  it('starts with describe or draw, and 4 designs or just 1', () => {
    renderFlow();
    expect(screen.getByRole('tab', { name: /describe it/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /draw it/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /mix pictures/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /4 to choose from/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /make 4 designs/i })).toBeDisabled();
  }, 15000);

  it('makes 4 designs from the description and shows them to pick from', async () => {
    mockGenerate.mockImplementation(async (requests: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => {
      requests.forEach((_, i) => opts.onOutcome?.(i, READY));
      return requests.map(() => READY);
    });
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'signet ring with a ruby' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make 4 designs/i })); });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const [requests] = mockGenerate.mock.calls[0];
    expect(requests).toHaveLength(4);
    expect(requests[0]).toMatchObject({ prompt: 'signet ring with a ruby', jewelryType: 'ring' });
    expect(await screen.findByRole('heading', { name: /pick the closest/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /use design/i })).toHaveLength(4));
  });

  it('Inspiration makes designs from a single picture', async () => {
    mockGenerate.mockResolvedValue(null);
    const { container } = renderFlow('ring', 'inspiration');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make 4 designs/i })).toBeDisabled();
    const input = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    const web = new File(['x'], 'spider-web.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [web] } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make 4 designs/i })); });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    const [requests] = mockGenerate.mock.calls[0];
    expect(requests[0]).toMatchObject({ prompt: 'Design a ring inspired by this picture.' });
    expect(requests[0].images).toHaveLength(1);
  });

  it('asks for the piece before making designs', () => {
    renderFlow(null);
    fireEvent.change(screen.getByLabelText(/describe your/i), { target: { value: 'something' } });
    fireEvent.click(screen.getByRole('button', { name: /make 4 designs/i }));
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/choose what you are making/i);
  });

  it('Just 1 opens the editor as soon as the design is ready', async () => {
    mockGenerate.mockImplementation(async (_requests: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => {
      opts.onOutcome?.(0, READY);
      return [READY];
    });
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /just 1/i }));
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    expect(mockGenerate.mock.calls[0][0]).toHaveLength(1);
    expect(await screen.findByRole('heading', { name: /edit design/i })).toBeInTheDocument();
  });

  it('goes back to the start screen with the description kept', async () => {
    mockGenerate.mockResolvedValue([READY, READY, READY, READY]);
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'kept text' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make 4 designs/i })); });
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByLabelText(/describe your ring/i)).toHaveValue('kept text');
  });
});
