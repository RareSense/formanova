import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { EMPTY_METAL_REQUEST, type MetalRequest } from '@/lib/metal-weight/request';
import { MetalWeightStep } from './MetalWeightStep';

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

const targetInput = () => screen.getByLabelText('Target weight');

describe('MetalWeightStep', () => {
  it('starts with no metal and no target', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Metal' })).toHaveValue('');
    expect(targetInput()).toHaveValue(null);
    expect(screen.getByLabelText('Tolerance (±%)')).toHaveValue(5);
  });

  it('picks a metal from the grouped list', () => {
    const { last } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Metal' }), { target: { value: 'au18y' } });
    expect(last()).toEqual({ alloyId: 'au18y', target: null });
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

  it('sends the tolerance', () => {
    const { last } = setup();
    fireEvent.change(targetInput(), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('Tolerance (±%)'), { target: { value: '3' } });
    expect(last().target).toEqual({ grams: 28, tolerancePct: 3 });
  });

  it('drops the target when it is cleared or not a positive number', () => {
    const { last } = setup();
    for (const bad of ['', '0', '-2']) {
      fireEvent.change(targetInput(), { target: { value: '28' } });
      fireEvent.change(targetInput(), { target: { value: bad } });
      expect(last().target).toBeNull();
    }
  });
});
