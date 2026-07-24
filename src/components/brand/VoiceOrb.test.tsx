import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { VoiceOrb } from '@/components/brand/VoiceOrb';

function renderOrb(state: 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening') {
  return render(
    <ThemeProvider>
      <VoiceOrb state={state} />
    </ThemeProvider>,
  );
}

describe('VoiceOrb', () => {
  it('renders the orb with the given state', () => {
    renderOrb('idle');
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', 'idle');
  });

  it('renders the side waveform only in the speaking state', () => {
    renderOrb('speaking');
    expect(screen.getByTestId('voice-orb-waveform')).toBeInTheDocument();
  });

  it('does not render the waveform in the idle state', () => {
    renderOrb('idle');
    expect(screen.queryByTestId('voice-orb-waveform')).not.toBeInTheDocument();
  });

  it('does not render the waveform in the listening state', () => {
    renderOrb('listening');
    expect(screen.queryByTestId('voice-orb-waveform')).not.toBeInTheDocument();
  });
});
