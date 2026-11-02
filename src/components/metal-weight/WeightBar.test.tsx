import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { findAlloy } from '@/lib/metal-weight/alloys';
import { NO_VOLUME_REASON, type WeightSource } from '@/lib/metal-weight/source';
import { WeightBar } from './WeightBar';

const measured: WeightSource = { available: true, volumeMm3: 2192.4, from: 'version' };
const target = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };

function renderBar(props: Partial<Parameters<typeof WeightBar>[0]> = {}) {
  const setAlloyId = vi.fn();
  render(<WeightBar source={measured} target={null} alloy={findAlloy('au14y')!} setAlloyId={setAlloyId} {...props} />);
  return { setAlloyId, bar: screen.getByRole('group', { name: 'Metal weight' }) };
}

describe('WeightBar', () => {
  it('shows the weight in grams and pennyweight', () => {
    const { bar } = renderBar();
    expect(within(bar).getByText('27.98 g · 17.99 dwt')).toBeInTheDocument();
  });

  it('has a labelled metal picker listing every alloy, grouped by family', () => {
    renderBar();
    const picker = screen.getByRole('combobox', { name: 'Metal' });
    expect(picker).toHaveValue('au14y');
    expect(within(picker).getAllByRole('option')).toHaveLength(21);
    expect(picker.querySelectorAll('optgroup')).toHaveLength(4);
  });

  it('switches metal from the picker', () => {
    const { setAlloyId } = renderBar();
    fireEvent.change(screen.getByRole('combobox', { name: 'Metal' }), { target: { value: 'au18y' } });
    expect(setAlloyId).toHaveBeenCalledWith('au18y');
  });

  it('shows on target', () => {
    renderBar({ target });
    expect(screen.getByText('On target −0.1%')).toBeInTheDocument();
  });

  it('shows off target in the previewed metal, with Adjust only when it can act', () => {
    const onAdjust = vi.fn();
    const { unmount } = render(
      <WeightBar source={measured} target={target} alloy={findAlloy('au18y')!} setAlloyId={vi.fn()} />,
    );
    expect(screen.getByText('21.3% over in 18K Yellow Gold')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust' })).toBeNull();
    unmount();

    render(<WeightBar source={measured} target={target} alloy={findAlloy('au18y')!} setAlloyId={vi.fn()} onAdjust={onAdjust} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });

  it('says when weight is not available, and shows no figure', () => {
    const { bar } = renderBar({ source: { available: false, reason: NO_VOLUME_REASON } });
    expect(within(bar).getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(within(bar).getByText(/model has no closed metal volume/)).toBeInTheDocument();
    expect(bar.textContent).not.toMatch(/\d g/);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('says when the requested metal is unavailable', () => {
    renderBar({ requestedUnavailable: true });
    expect(screen.getByText('Requested metal unavailable')).toBeInTheDocument();
  });
});
