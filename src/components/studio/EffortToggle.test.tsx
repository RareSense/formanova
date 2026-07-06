import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EffortToggle } from './EffortToggle';

describe('EffortToggle', () => {
  it('renders "Low" inside the track when off and marks the switch unchecked', () => {
    render(<EffortToggle value="standard" onChange={() => {}} />);
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('renders "High" inside the track when on and marks the switch checked', () => {
    render(<EffortToggle value="high" onChange={() => {}} />);
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('toggles standard -> high on click', () => {
    const onChange = vi.fn();
    render(<EffortToggle value="standard" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('toggles high -> standard on click', () => {
    const onChange = vi.fn();
    render(<EffortToggle value="high" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith('standard');
  });
});
