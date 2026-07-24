import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));

function renderModal() {
  return render(
    <ThemeProvider>
      <JewelryBrandModal open onClose={vi.fn()} onContinue={vi.fn()} source="onboarding" />
    </ThemeProvider>,
  );
}

describe('JewelryBrandModal Nova intro', () => {
  it('opens on the Nova intro step, not the brand-details form', () => {
    renderModal();

    expect(screen.getByText('Meet Nova')).toBeInTheDocument();
    expect(screen.queryByText('Tell us about your jewelry brand')).not.toBeInTheDocument();
  });

  it('shows the spoken caption after choosing Talk to Nova, and hides the intro CTAs', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Talk to Nova' }));

    expect(screen.getByTestId('nova-voice-caption')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
  });

  it('shows the chat message after choosing Continue without voice, and hides the intro CTAs', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Continue without voice' }));

    expect(screen.getByTestId('nova-text-message')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });

  it('still renders the bespoke card stage on the intro step', () => {
    renderModal();

    expect(screen.getByText('Your Bespoke Card')).toBeInTheDocument();
  });
});