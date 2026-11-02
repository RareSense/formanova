import { beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { EMPTY_METAL_REQUEST, type MetalRequest } from '@/lib/metal-weight/request';
import { MetalWeightStep } from './MetalWeightStep';

// Radix Select renders 22 options; give it room under full-suite load.
vi.setConfig({ testTimeout: 20_000 });

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

/** Holds the value like a page does, and reports every change. */
function Harness({ onChange }: { onChange: (next: MetalRequest) => void }) {
  const [value, setValue] = useState<MetalRequest>(EMPTY_METAL_REQUEST);
  return <MetalWeightStep value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
}

function setup() {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  const last = (): MetalRequest => onChange.mock.calls[onChange.mock.calls.length - 1][0];
  return { onChange, last };
}

const metal = () => screen.getByRole('combobox', { name: 'Metal' });
const targetInput = () => screen.getByLabelText('Target weight');
const toleranceInput = () => screen.getByLabelText('Allowed difference (±%)');

async function chooseMetal(name: string) {
  fireEvent.keyDown(metal(), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

describe('MetalWeightStep', () => {
  it('starts with no metal and no target, allowed difference 5', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Metal & weight' })).toBeInTheDocument();
    expect(metal()).toHaveTextContent('Choose metal');
    expect(targetInput()).toHaveValue(null);
    expect(toleranceInput()).toHaveValue(5);
  });

  it('lays the three controls out on one grid at one height, with the hint under them', () => {
    setup();
    const grid = screen.getByTestId('metal-weight-grid');
    // Equal columns of at least 13rem: three across in a wide form, fewer in a
    // narrow one (ReadyForCad is 460 px), one on a phone. Never squeezed.
    expect(grid).toHaveClass('grid', 'grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]');
    for (const control of [metal(), targetInput(), toleranceInput()]) expect(control).toHaveClass('h-10');
    // The toggle box itself is h-10 (its border inside it), halves fill it equally.
    const unit = screen.getByRole('group', { name: 'Weight unit' });
    expect(unit).toHaveClass('h-10', 'box-border');
    const halves = within(unit).getAllByRole('button');
    expect(halves).toHaveLength(2);
    for (const half of halves) expect(half).toHaveClass('h-full', 'flex-1');
    expect(screen.getByText("Optional. We'll aim for this weight.")).toBeInTheDocument();
  });

  it('offers every cited alloy grouped by family, each with a colour swatch', async () => {
    setup();
    fireEvent.keyDown(metal(), { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    // Above the design editor's z-[120] backdrop, as CadModelPicker is.
    expect(document.querySelector('[class~="z-[200]"]')).not.toBeNull();
    expect(within(listbox).getAllByRole('option')).toHaveLength(22); // No metal + 21
    expect(within(listbox).getAllByRole('group')).toHaveLength(4);
    const option = within(listbox).getByRole('option', { name: '18K Rose Gold' });
    expect(option.querySelector('[data-metal-swatch]')).not.toBeNull();
  });

  it('lists jeweller names (Platinum 950, detail kept for iridium)', async () => {
    setup();
    fireEvent.keyDown(metal(), { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Platinum 950' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Platinum 950 (iridium)' })).toBeInTheDocument();
  });

  it('picks a metal', async () => {
    const { last } = setup();
    await chooseMetal('18K Yellow Gold');
    expect(last()).toEqual({ alloyId: 'au18y', target: null });
    await chooseMetal('No metal');
    expect(last()).toEqual({ alloyId: null, target: null });
    expect(metal()).toHaveTextContent('Choose metal');
  });

  it('sends a gram target with the default tolerance', () => {
    const { last } = setup();
    fireEvent.change(targetInput(), { target: { value: '28' } });
    expect(last()).toEqual({ alloyId: null, target: { grams: 28, tolerancePct: 5 } });
  });

  it('reads a pennyweight target as grams', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'dwt' }));
    fireEvent.change(targetInput(), { target: { value: '20' } });
    expect(last().target?.grams).toBeCloseTo(31.1034768, 9);
  });

  it('converts the shown number when the unit changes, keeping the grams', () => {
    const { onChange } = setup();
    fireEvent.change(targetInput(), { target: { value: '28' } });
    const calls = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'dwt' }));
    expect(targetInput()).toHaveValue(18);
    expect(screen.getByRole('button', { name: 'dwt' })).toHaveAttribute('aria-pressed', 'true');
    expect(onChange.mock.calls.length).toBe(calls);
  });

  it('clamps the allowed difference to 0–100', () => {
    const { last } = setup();
    fireEvent.change(targetInput(), { target: { value: '28' } });
    fireEvent.change(toleranceInput(), { target: { value: '250' } });
    expect(last().target?.tolerancePct).toBe(100);
  });

  it('sends the allowed difference', () => {
    const { last } = setup();
    fireEvent.change(targetInput(), { target: { value: '28' } });
    fireEvent.change(toleranceInput(), { target: { value: '3' } });
    expect(last().target).toEqual({ grams: 28, tolerancePct: 3 });
  });

  it('drops the target when it is cleared or not a weight a piece could have', () => {
    const { last } = setup();
    for (const bad of ['', '0', '-2', '10001', '0.001']) {
      fireEvent.change(targetInput(), { target: { value: '28' } });
      fireEvent.change(targetInput(), { target: { value: bad } });
      expect(last().target).toBeNull();
    }
  });
});
