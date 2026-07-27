import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VoiceOrb, type VoiceOrbState } from '@/components/brand/VoiceOrb';

function renderOrb(state: VoiceOrbState) {
  return render(<VoiceOrb state={state} />);
}

describe('VoiceOrb', () => {
  it('renders the orb with the given state', () => {
    renderOrb('idle');
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', 'idle');
  });

  it('reflects state changes on the data attribute', () => {
    renderOrb('speaking');
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', 'speaking');
  });

  it('is a labeled, clickable control', () => {
    renderOrb('connecting');
    expect(screen.getByRole('button', { name: 'Talk to Nova' })).toBeInTheDocument();
  });
});
