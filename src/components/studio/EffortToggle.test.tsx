import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EffortToggle } from './EffortToggle';

describe('EffortToggle', () => {
  it('renders both segments and marks Low active when value is low', () => {
    render(<EffortToggle value="low" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Low' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('false');
  });

  it('marks High active when value is high', () => {
    render(<EffortToggle value="high" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Low' }).getAttribute('aria-checked')).toBe('false');
  });

  it('selects high when the High segment is clicked', () => {
    const onChange = vi.fn();
    render(<EffortToggle value="low" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('selects low when the Low segment is clicked', () => {
    const onChange = vi.fn();
    render(<EffortToggle value="high" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Low' }));
    expect(onChange).toHaveBeenCalledWith('low');
  });
});
