import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';
import { CREATIVE_ZAVA_DEMO, INSIGHT_REVEAL_ORDER } from '@/components/brand/creative-zava-demo';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));

function renderModal(onContinue = vi.fn()) {
  render(
    <ThemeProvider>
      <JewelryBrandModal open onClose={vi.fn()} onContinue={onContinue} source="onboarding" />
    </ThemeProvider>,
  );
  return { onContinue };
}

/** Advances through intro -> speaking -> fields. */
function advanceToFields() {
  act(() => { vi.advanceTimersByTime(600); }); // intro -> speaking
  act(() => { vi.advanceTimersByTime(5200); }); // speaking -> fields
}

/** Advances through the full scanning -> done reveal sequence. */
function advanceThroughScanning() {
  const totalMs = 600 + INSIGHT_REVEAL_ORDER.length * 700 + 700 + 100;
  act(() => { vi.advanceTimersByTime(totalMs); });
}

describe('JewelryBrandModal Nova onboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the Nova intro step with the bespoke card already visible', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument();
    expect(screen.getByText('AI Creative Consultant')).toBeInTheDocument();
    expect(screen.getByText('Your Bespoke Card')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument();
  });

  it('simulates Nova speaking, then reveals the brand name and website fields', () => {
    renderModal();

    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByTestId('nova-speaking-caption')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5200); });
    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
    expect(screen.getByLabelText('Website or store URL')).toBeInTheDocument();
  });

  it('blocks Continue and shows an error when brand name is missing', () => {
    renderModal();
    advanceToFields();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
  });

  it('updates the card title live as the brand name is typed', () => {
    renderModal();
    advanceToFields();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });

    expect(screen.getAllByText('Creative Zava').length).toBeGreaterThan(0);
  });

  it('progressively reveals findings during scanning, then calls onContinue with the (possibly edited) profile', () => {
    const { onContinue } = renderModal();
    advanceToFields();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });
    fireEvent.change(screen.getByLabelText('Website or store URL'), { target: { value: 'creativezava.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('nova-call-timer')).toBeInTheDocument();
    expect(screen.queryByText(CREATIVE_ZAVA_DEMO.identity)).not.toBeInTheDocument();

    advanceThroughScanning();

    expect(screen.getAllByText(CREATIVE_ZAVA_DEMO.identity).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Continue to FormaNova' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to FormaNova' }));

    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_name: 'Creative Zava',
        website_url: 'https://creativezava.com',
        based_in: CREATIVE_ZAVA_DEMO.basedIn,
        target_markets: CREATIVE_ZAVA_DEMO.targetMarkets,
        social_links: CREATIVE_ZAVA_DEMO.socialLinks,
      }),
    );
  });

  it('lets the user end the call early, jumping straight to the done step', () => {
    renderModal();
    advanceToFields();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    act(() => { vi.advanceTimersByTime(600); }); // reveal "identity"

    fireEvent.click(screen.getByRole('button', { name: 'End call' }));

    expect(screen.getByRole('button', { name: 'Continue to FormaNova' })).toBeInTheDocument();
  });

  it('edits an insight after scanning finishes and reflects it on the card', () => {
    renderModal();
    advanceToFields();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    advanceThroughScanning();

    fireEvent.click(screen.getByRole('button', { name: /Show all findings/i }));
    fireEvent.click(screen.getByRole('button', { name: /Edit Brand identity/i }));
    const input = screen.getByDisplayValue(CREATIVE_ZAVA_DEMO.identity);
    fireEvent.change(input, { target: { value: 'Bold statement jewelry.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getAllByText('Bold statement jewelry.').length).toBeGreaterThan(0);
  });
});
