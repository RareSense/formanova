import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { NovaIntroPanel, type NovaOnboardingStep } from '@/components/brand/NovaIntroPanel';
import { EMPTY_BRAND_SCAN_PROGRESS } from '@/lib/brand-scan-api';

function renderPanel(step: NovaOnboardingStep, overrides: Partial<Parameters<typeof NovaIntroPanel>[0]> = {}) {
  const handlers = {
    onBrandNameChange: vi.fn(),
    onWebsiteChange: vi.fn(),
    onSelectMessage: vi.fn(),
    onStartBuilding: vi.fn(),
    onConfirm: vi.fn(),
    onAddMore: vi.fn(),
    onFinish: vi.fn(),
  };
  render(
    <ThemeProvider>
      <NovaIntroPanel
        step={step}
        brandName=""
        website=""
        {...handlers}
        {...overrides}
      />
    </ThemeProvider>,
  );
  return handlers;
}

describe('NovaIntroPanel', () => {
  it('offers message onboarding and marks the unwired voice action unavailable', () => {
    const { onSelectMessage } = renderPanel('intro');

    expect(screen.getByRole('button', { name: /Talk to Nova.*coming soon/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Message Nova' }));
    expect(onSelectMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/not sold, published, or used to train/i)).toBeInTheDocument();
  });

  it('collects brand name and storefront URL and starts the scan', () => {
    const { onBrandNameChange, onWebsiteChange, onStartBuilding } = renderPanel('fields');

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Example' } });
    fireEvent.change(screen.getByLabelText('Online store URL'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(onBrandNameChange).toHaveBeenCalledWith('Example');
    expect(onWebsiteChange).toHaveBeenCalledWith('example.com');
    expect(onStartBuilding).toHaveBeenCalledTimes(1);
  });

  it('shows field and workflow errors on the form', () => {
    renderPanel('fields', {
      brandNameError: true,
      websiteError: 'Enter a valid URL, e.g. yourbrand.com',
      scanError: 'The scan could not start.',
    });

    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a valid URL/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('could not start');
  });

  it('shows honest workflow progress without call controls or fake findings', () => {
    renderPanel('scanning', { scanStatus: 'Analyzing your storefront…' });

    expect(screen.getByTestId('brand-scan-progress')).toHaveTextContent('Analyzing your storefront');
    expect(screen.queryByRole('button', { name: 'Mute' })).not.toBeInTheDocument();
    expect(screen.queryByText('Brand identity')).not.toBeInTheDocument();
  });

  it('renders editable findings plus review actions when the scan is done', () => {
    const { onConfirm, onAddMore } = renderPanel('done', {
      summaryLine: 'This is what I understand about your brand. Please correct anything that feels off.',
      insights: [{ key: 'identity', value: 'Modern fine jewelry.' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Looks perfect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add something else' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onAddMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Edit Brand identity/i })).toBeInTheDocument();
  });

  it('reveals measured scanner progress without pretending the final read is complete', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'processing',
        completedPhases: ['discovery', 'product_probes', 'browser', 'images', 'processing'],
        progressPercent: 78,
        productCount: 24,
        imageCount: 9,
        sitePalette: ['#111111', '#F4E8D5'],
        fonts: ['Didot', 'Inter'],
      },
    });

    expect(screen.getByTestId('brand-scan-progress')).toHaveTextContent('Extracting colors and fonts');
    expect(screen.getByText('Found 24 products')).toBeInTheDocument();
    expect(screen.getByText('Selected 9 representative images')).toBeInTheDocument();
    expect(screen.getByText('Type styles: Didot, Inter')).toBeInTheDocument();
    expect(screen.queryByText('Your brand read is ready')).not.toBeInTheDocument();
  });

  it('shows every finding without collapsing or cropping long values', () => {
    const longIdentity = 'A detailed identity paragraph that should remain fully visible instead of being cut off with an ellipsis.';
    renderPanel('done', {
      insights: [
        { key: 'identity', value: longIdentity },
        { key: 'productFocus', value: 'Rings' },
        { key: 'visualStyle', value: 'Editorial' },
        { key: 'targetMarkets', value: 'United States' },
        { key: 'audience', value: 'Collectors' },
        { key: 'otherInfo', value: 'Price positioning: premium\nConfidence: 91%' },
      ],
    });

    expect(screen.getByText(longIdentity)).toBeInTheDocument();
    expect(screen.getByText(/Price positioning: premium/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all findings/i })).not.toBeInTheDocument();
  });

  it('offers an honest call-now placeholder and a working later path', () => {
    const { onFinish } = renderPanel('next');

    expect(screen.getByRole('button', { name: /Call Nova now.*coming soon/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
