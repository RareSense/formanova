import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { NovaIntroPanel, type NovaLeftStep } from '@/components/brand/NovaIntroPanel';

function renderPanel(step: NovaLeftStep, onSelectVoice = vi.fn(), onSelectText = vi.fn()) {
  render(
    <ThemeProvider>
      <NovaIntroPanel step={step} onSelectVoice={onSelectVoice} onSelectText={onSelectText} />
    </ThemeProvider>,
  );
  return { onSelectVoice, onSelectText };
}

describe('NovaIntroPanel', () => {
  it('renders the intro copy and both CTAs on the intro step', () => {
    renderPanel('intro');

    expect(screen.getByText('Meet Nova')).toBeInTheDocument();
    expect(
      screen.getByText('Your creative consultant for a more tailored FormaNova experience.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument();
    expect(screen.getByText('Creative Consultant')).toBeInTheDocument();
    expect(
      screen.getByText("Let's make FormaNova feel more tailored to your brand."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Talk to Nova' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without voice' })).toBeInTheDocument();
  });

  it('calls onSelectVoice when Talk to Nova is clicked', () => {
    const { onSelectVoice } = renderPanel('intro');

    screen.getByRole('button', { name: 'Talk to Nova' }).click();

    expect(onSelectVoice).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectText when Continue without voice is clicked', () => {
    const { onSelectText } = renderPanel('intro');

    screen.getByRole('button', { name: 'Continue without voice' }).click();

    expect(onSelectText).toHaveBeenCalledTimes(1);
  });

  it('renders the spoken caption and no CTAs on the voice step', () => {
    renderPanel('voice');

    expect(screen.getByTestId('nova-voice-caption')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });

  it('renders the chat message and no CTAs on the text step', () => {
    renderPanel('text');

    expect(screen.getByTestId('nova-text-message')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });
});
