import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';
import { CREATIVE_ZAVA_DEMO, DEMO_REVEAL_ORDER } from '@/components/brand/creative-zava-demo';

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

/** Advances through the full building -> done reveal sequence. */
function advanceThroughBuilding() {
  const totalMs = 500 + DEMO_REVEAL_ORDER.length * 550 + 600 + 100;
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

  it('progressively reveals the hardcoded demo fields after Continue, then calls onContinue', () => {
    const { onContinue } = renderModal();
    advanceToFields();

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });
    fireEvent.change(screen.getByLabelText('Website or store URL'), { target: { value: 'creativezava.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByTestId('nova-building-caption')).toBeInTheDocument();
    expect(screen.queryByText(CREATIVE_ZAVA_DEMO.descriptor)).not.toBeInTheDocument();

    advanceThroughBuilding();

    expect(screen.getAllByText(CREATIVE_ZAVA_DEMO.descriptor).length).toBeGreaterThan(0);
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
});
