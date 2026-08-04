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
    onRetryStorefront: vi.fn(),
    onManualSetup: vi.fn(),
    onRescan: vi.fn(),
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
        productTitles: ['Halo Ring', 'Pearl Drop'],
        imageCount: 9,
        sitePalette: ['#111111', '#F4E8D5'],
        fonts: ['Didot', 'Inter'],
        screenshotReady: true,
      },
    });

    expect(screen.getByTestId('brand-scan-progress')).toHaveTextContent('Extracting colors and fonts');
    // Findings are shown as their real values, not narrated as prose.
    expect(screen.getByText('Halo Ring, Pearl Drop')).toBeInTheDocument();
    expect(screen.getByText('Didot, Inter')).toBeInTheDocument();
    expect(screen.getByLabelText('Colors discovered so far')).toBeInTheDocument();
    expect(screen.getByTestId('brand-scan-screenshot-captured')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-read-ready')).not.toBeInTheDocument();
  });

  it('confirms completion instead of silently dropping the analyzing rows', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'ai_analysis',
        progressPercent: 96,
        sitePalette: ['#7A2233'],
        brandReadReady: true,
      },
    });

    expect(screen.getByTestId('brand-read-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-finding-identity')).not.toBeInTheDocument();
  });

  it('does not badge a zero-product read as a finding', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'product_probes',
        progressPercent: 30,
        productCount: 0,
      },
    });

    expect(screen.queryByTestId('scan-finding-productFocus')).not.toBeInTheDocument();
  });

  it('falls back to a product count when no titles were captured', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'product_probes',
        progressPercent: 30,
        productCount: 12,
      },
    });

    expect(screen.getByTestId('scan-finding-productFocus')).toHaveTextContent('12 products');
  });

  it('names the page being read instead of a generic stage label', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'browser',
        progressPercent: 40,
        lastPageUrl: 'https://www.quirksmith.com/collections/earrings',
      },
    });

    expect(screen.getByTestId('brand-scan-progress'))
      .toHaveTextContent('Reading quirksmith.com/collections/earrings');
  });

  it('falls back to the stage label while interpreting, where no page applies', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'ai_analysis',
        progressPercent: 90,
        lastPageUrl: 'https://www.quirksmith.com/collections/earrings',
      },
    });

    expect(screen.getByTestId('brand-scan-progress')).toHaveTextContent('Writing your brand read');
  });

  it('shows no placeholder rows for findings the scan has not produced', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'discovery',
        progressPercent: 12,
      },
    });

    // Nothing discovered yet, so the feed states nothing rather than listing
    // fields as unidentified.
    expect(screen.queryByTestId('scan-finding-palette')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-finding-productFocus')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-finding-targetMarkets')).not.toBeInTheDocument();
    expect(screen.queryByText(/not identified/i)).not.toBeInTheDocument();
  });

  it('marks interpreted findings as analyzing only once that pass is running', () => {
    renderPanel('scanning', {
      scanProgress: {
        ...EMPTY_BRAND_SCAN_PROGRESS,
        currentPhase: 'ai_analysis',
        progressPercent: 88,
        sitePalette: ['#7A2233'],
      },
    });

    expect(screen.getByTestId('scan-finding-palette')).toBeInTheDocument();
    expect(screen.getByTestId('scan-finding-targetMarkets')).toHaveTextContent('Analyzing');
    expect(screen.getByTestId('scan-finding-identity')).toHaveTextContent('Analyzing');
  });

  it('offers retry and manual setup when no storefront is found', () => {
    const { onRetryStorefront, onManualSetup } = renderPanel('non_storefront');

    expect(screen.getByText(/couldn’t find an online store/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try another URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up manually' }));
    expect(onRetryStorefront).toHaveBeenCalledTimes(1);
    expect(onManualSetup).toHaveBeenCalledTimes(1);
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
