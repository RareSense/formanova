import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDesignImageRun', () => ({ useDesignImageRun: () => ({ generate: mockGenerate, running: false }) }));
vi.mock('@/hooks/use-estimated-cost', () => ({ useEstimatedCost: () => ({ cost: 140, loading: false }) }));
const credits = vi.hoisted(() => ({ value: 1000 as number | null }));
vi.mock('@/contexts/CreditsContext', () => ({ useCredits: () => ({ credits: credits.value, loading: false, refreshCredits: vi.fn(), lastDelta: null }) }));
const mockSaveReturn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/post-purchase-return', () => ({ savePostPurchaseReturn: mockSaveReturn }));

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DesignToCadFlow, { lowCreditsAfterDesign, requestFor } from './DesignToCadFlow';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) })) as never;
});

beforeEach(() => { mockGenerate.mockReset(); credits.value = 1000; mockSaveReturn.mockReset(); });

const READY = { ok: true, result: { image: { uri: 'u', url: 'https://x/d.png', type: 'image/png', bytes: 1, sha256: 's' }, consistent: null, drift: [], view: null } };

function renderFlow(jewelryType: 'ring' | null = 'ring', variant: 'idea' | 'inspiration' = 'idea', onCreateCad = vi.fn()) {
  const view = render(
    <MemoryRouter initialEntries={['/text-to-cad']}>
      <Routes>
        <Route path="/text-to-cad" element={(
          <DesignToCadFlow
            jewelryType={jewelryType} setJewelryType={vi.fn()} dimensions="" onDimensions={vi.fn()}
            cadCost={140} cadCostLoading={false} creatingCad={false} onCreateCad={onCreateCad} variant={variant}
          />
        )} />
        <Route path="/credits" element={<h1>Buy credits page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onCreateCad, container: view.container };
}

function designReady() {
  mockGenerate.mockImplementation(async (_requests: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => {
    opts.onOutcome?.(0, READY);
    return [READY];
  });
}

const stepNow = () => screen.getAllByRole('list', { name: /steps/i }).map((l) => l.querySelector('[aria-current="step"]')?.textContent);

describe('DesignToCadFlow', () => {
  it('starts with describe or draw, one design straight to the editor', () => {
    renderFlow();
    expect(screen.getByRole('tab', { name: /describe it/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /draw it/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /mix pictures/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /4 to choose from/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make my design/i })).toBeDisabled();
  }, 15000);


  it('Inspiration makes designs from a single picture', async () => {
    mockGenerate.mockResolvedValue(null);
    const { container } = renderFlow('ring', 'inspiration');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make my design/i })).toBeDisabled();
    const input = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    const web = new File(['x'], 'spider-web.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [web] } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    const [requests] = mockGenerate.mock.calls[0];
    expect(requests[0]).toMatchObject({ prompt: 'Design a ring inspired by this picture.' });
    expect(requests[0].images).toHaveLength(1);
    expect(requests[0].images[0].role).toBe('reference');
  });

  it('sends a drawing as the piece itself (built as drawn), not as an inspiration', async () => {
    const doodle = new File(['x'], 'doodle.png', { type: 'image/png' });
    const req = await requestFor({ mode: 'draw', text: '', images: [doodle], count: 1 }, 'ring');
    expect(req.images.map((i) => i.role)).toEqual(['drawing']);
    expect(req.prompt).toBe('Turn this drawing into a realistic ring design.');
  });

  it('asks for the piece before making designs', () => {
    renderFlow(null);
    fireEvent.change(screen.getByLabelText(/describe your/i), { target: { value: 'something' } });
    fireEvent.click(screen.getByRole('button', { name: /make my design/i }));
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/select what you're making/i);
  });

  it('opens the editor as soon as the design is ready', async () => {
    mockGenerate.mockImplementation(async (_requests: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => {
      opts.onOutcome?.(0, READY);
      return [READY];
    });
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    expect(mockGenerate.mock.calls[0][0]).toHaveLength(1);
    expect(await screen.findByRole('heading', { name: /edit design/i })).toBeInTheDocument();
  });

  it('while the design is made, shows the Photo Studio generating screen with the input picture', async () => {
    let finish: (v: unknown) => void = () => {};
    mockGenerate.mockReturnValue(new Promise((r) => { finish = r; }));
    const { container } = renderFlow('ring', 'inspiration');
    const input = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'shell.png', { type: 'image/png' })] } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    expect(screen.getByRole('heading', { name: /generating/i })).toBeInTheDocument();
    expect(screen.getByText(/studying your inspiration/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 90 seconds/i)).toBeInTheDocument();
    expect(screen.getByAltText('Your picture')).toBeInTheDocument();
    await act(async () => { finish(null); });
  });

  it('one design goes straight into the editor (no Use this one step); closing it returns to the start', async () => {
    mockGenerate.mockImplementation(async (_requests: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => {
      opts.onOutcome?.(0, READY);
      return [READY];
    });
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    expect(await screen.findByRole('heading', { name: /edit design/i })).toBeInTheDocument();
    expect(screen.queryByText(/use this one/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.getByLabelText(/describe your ring/i)).toBeVisible());
    expect(screen.getByLabelText(/describe your ring/i)).toHaveValue('band ring');
    expect(screen.queryByText(/use this one/i)).toBeNull();
  });

  it('goes back to the start screen with the description kept', async () => {
    // A failed design leaves the screen with Back.
    const FAILED = { ok: false, message: 'Busy, try again.', retryable: true };
    mockGenerate.mockImplementation(async (_r: unknown[] = [], opts: { onOutcome?: (i: number, o: unknown) => void } = {}) => { opts.onOutcome?.(0, FAILED); return [FAILED]; });
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'kept text' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByLabelText(/describe your ring/i)).toHaveValue('kept text');
  });
  it('shows the three steps, naming step 1 after how the design starts', () => {
    renderFlow();
    expect(stepNow()).toEqual(['1Describe']);
    expect(screen.getByText('Pick your design')).toBeInTheDocument();
    expect(screen.getByText('Create CAD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /draw it/i }));
    expect(stepNow()).toEqual(['1Draw']);
  });

  it('Inspiration names step 1 Choose inspiration', () => {
    renderFlow('ring', 'inspiration');
    expect(stepNow()).toEqual(['1Choose inspiration']);
  });

  it('a new design can go to Create CAD straight away: Looks right needs no paid edit', async () => {
    designReady();
    const onCreateCad = vi.fn(async () => true);
    renderFlow('ring', 'idea', onCreateCad);
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    await screen.findByRole('heading', { name: /edit design/i });
    expect(stepNow()).toContain('2Pick your design');
    expect(screen.getByRole('button', { name: /looks right/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /looks right/i }));
    expect(stepNow()).toContain('3Create CAD');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create cad/i })); });
    expect(mockGenerate).toHaveBeenCalledTimes(1); // the design only, no edit
    await waitFor(() => expect(onCreateCad).toHaveBeenCalledTimes(1));
    const [files] = onCreateCad.mock.calls[0] as unknown as [File[]];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('edited-design.png');
  });

  it('warns before a design that would leave too little for a CAD; Generate anyway makes it', async () => {
    credits.value = 150;
    designReady();
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    fireEvent.click(screen.getByRole('button', { name: /make my design/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent("After this design you'll have 136 credits — not enough for a CAD (140). Continue anyway?");
    expect(mockGenerate).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate anyway' })); });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('Buy credits goes to the credits page and makes nothing', async () => {
    credits.value = 150;
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    fireEvent.click(screen.getByRole('button', { name: /make my design/i }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));
    expect(await screen.findByRole('heading', { name: 'Buy credits page' })).toBeInTheDocument();
    expect(mockSaveReturn).toHaveBeenCalledWith('/text-to-cad');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does not warn when enough is left for a CAD', async () => {
    credits.value = 154;
    mockGenerate.mockResolvedValue(null);
    renderFlow();
    fireEvent.change(screen.getByLabelText(/describe your ring/i), { target: { value: 'band ring' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /make my design/i })); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('lowCreditsAfterDesign: only when what is left is under the CAD price', () => {
    expect(lowCreditsAfterDesign(150, 14, 140)).toBe(136);
    expect(lowCreditsAfterDesign(154, 14, 140)).toBeNull();
    expect(lowCreditsAfterDesign(1000, 56, 140)).toBeNull();
    expect(lowCreditsAfterDesign(10, 14, 140)).toBeNull(); // the normal credit check handles this
    expect(lowCreditsAfterDesign(null, 14, 140)).toBeNull();
    expect(lowCreditsAfterDesign(150, 14, null)).toBeNull();
  });
});
