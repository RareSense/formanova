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

  it('shows the building caption and no fields on the building step', () => {
    renderPanel('building');

    expect(screen.getByTestId('nova-building-caption')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument();
  });

  it('shows the finish CTA on the done step', () => {
    const { onFinish } = renderPanel('done');

    screen.getByRole('button', { name: 'Continue to FormaNova' }).click();

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
