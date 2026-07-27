import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { NovaIntroPanel, NOVA_INTRO_LINE, type NovaOnboardingStep } from '@/components/brand/NovaIntroPanel';

function renderPanel(step: NovaOnboardingStep, overrides: Partial<Parameters<typeof NovaIntroPanel>[0]> = {}) {
  const onBrandNameChange = vi.fn();
  const onWebsiteChange = vi.fn();
  const onStartBuilding = vi.fn();
  const onFinish = vi.fn();
  render(
    <ThemeProvider>
      <NovaIntroPanel
        step={step}
        brandName=""
        onBrandNameChange={onBrandNameChange}
        website=""
        onWebsiteChange={onWebsiteChange}
        onStartBuilding={onStartBuilding}
        onFinish={onFinish}
        {...overrides}
      />
    </ThemeProvider>,
  );
  return { onBrandNameChange, onWebsiteChange, onStartBuilding, onFinish };
}

describe('NovaIntroPanel', () => {
  it('shows only the orb, name, and title on the intro step — no fields, no chat bubble', () => {
    renderPanel('intro');

    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument();
    expect(screen.getByText('AI Creative Consultant')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nova-speaking-caption')).not.toBeInTheDocument();
  });

  it('shows the simulated speech on the speaking step', () => {
    renderPanel('speaking');

    expect(screen.getByTestId('nova-speaking-caption')).toHaveTextContent(NOVA_INTRO_LINE);
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument();
  });

  it('reveals brand name and website fields plus Continue on the fields step', () => {
    renderPanel('fields');

    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
    expect(screen.getByLabelText('Website or store URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('calls onBrandNameChange and onWebsiteChange as the user types', () => {
    const { onBrandNameChange, onWebsiteChange } = renderPanel('fields');

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Creative Zava' } });
    expect(onBrandNameChange).toHaveBeenCalledWith('Creative Zava');

    fireEvent.change(screen.getByLabelText('Website or store URL'), { target: { value: 'creativezava.com' } });
    expect(onWebsiteChange).toHaveBeenCalledWith('creativezava.com');
  });

  it('calls onStartBuilding when Continue is clicked on the fields step', () => {
    const { onStartBuilding } = renderPanel('fields');

    screen.getByRole('button', { name: 'Continue' }).click();

    expect(onStartBuilding).toHaveBeenCalledTimes(1);
  });

  it('shows a brand-name-required error when brandNameError is true', () => {
    renderPanel('fields', { brandNameError: true });

    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
  });

  it('drops the repeated Nova title and shows the call timer + controls on the scanning step, with no findings yet', () => {
    renderPanel('scanning', { callSeconds: 5 });

    expect(screen.queryByRole('heading', { name: 'Nova' })).not.toBeInTheDocument();
    expect(screen.getByTestId('nova-call-timer')).toHaveTextContent('0:05');
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('reveals insight cards without a checkmark or pencil while still scanning', () => {
    renderPanel('scanning', {
      insights: [{ key: 'identity', value: 'Contemporary fine jewelry for the modern minimalist.' }],
    });

    expect(screen.getByText('Brand identity')).toBeInTheDocument();
    expect(screen.getByText('Contemporary fine jewelry for the modern minimalist.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Brand identity/i })).not.toBeInTheDocument();
  });

  it('toggles mute and ends the call via the provided handlers', () => {
    const onToggleMute = vi.fn();
    const onEndCall = vi.fn();
    renderPanel('scanning', { onToggleMute, onEndCall });

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(onEndCall).toHaveBeenCalledTimes(1);
  });

  it('shows a pencil for each finding once scanning is done, and edits update the value', () => {
    const onEditInsight = vi.fn();
    renderPanel('done', {
      insights: [{ key: 'identity', value: 'Contemporary fine jewelry for the modern minimalist.' }],
      onEditInsight,
    });

    fireEvent.click(screen.getByRole('button', { name: /Edit Brand identity/i }));
    const input = screen.getByDisplayValue('Contemporary fine jewelry for the modern minimalist.');
    fireEvent.change(input, { target: { value: 'Minimalist fine jewelry.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEditInsight).toHaveBeenCalledWith('identity', 'Minimalist fine jewelry.');
  });

  it('lets the user add and remove palette swatches once done', () => {
    const onEditPalette = vi.fn();
    renderPanel('done', {
      insights: [{ key: 'palette', value: '' }],
      palette: ['#111111', '#222222'],
      onEditPalette,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit color palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }));

    expect(onEditPalette).toHaveBeenCalledWith(['#111111', '#222222', '#8A8A8A']);
  });

  it('collapses older findings behind "Show all findings" once the feed is long', () => {
    const insights = ['identity', 'productFocus', 'visualStyle', 'targetMarkets', 'audience', 'location'].map((key) => ({
      key: key as never,
      value: `value-${key}`,
    }));
    renderPanel('done', { insights });

    expect(screen.queryByText('value-identity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show all findings/i }));
    expect(screen.getByText('value-identity')).toBeInTheDocument();
  });

  it('shows the Nova summary caption and finish CTA on the done step', () => {
    const { onFinish } = renderPanel('done', { summaryLine: "Here's what I understand about your brand so far…" });

    expect(screen.getByTestId('nova-summary-caption')).toHaveTextContent('so far');
    screen.getByRole('button', { name: 'Continue to FormaNova' }).click();

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
