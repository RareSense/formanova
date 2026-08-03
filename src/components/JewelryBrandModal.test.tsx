import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';
import { EMPTY_BRAND_SCAN_INSIGHTS, runBrandScan, type BrandScanResult } from '@/lib/brand-scan-api';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));
vi.mock('@/lib/brand-scan-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/brand-scan-api')>('@/lib/brand-scan-api');
  return { ...actual, runBrandScan: vi.fn() };
});

const mockRunBrandScan = vi.mocked(runBrandScan);

const completedScan: BrandScanResult = {
  status: 'completed',
  readinessLevel: 'full',
  errorCode: null,
  errorMessage: null,
  requestedUrl: 'https://example.com',
  insights: {
    identity: 'Modern fine jewelry with an editorial point of view.',
    palette: ['#111111', '#F4E8D5'],
    productFocus: 'Gold rings and necklaces',
    visualStyle: ['Minimal', 'Editorial'],
    targetMarkets: ['United States'],
    audience: 'Design-conscious women',
    basedIn: 'New York, USA',
    socialLinks: ['https://instagram.com/example'],
    otherInfo: '',
  },
};

function renderModal(onContinue = vi.fn()) {
  render(
    <ThemeProvider>
      <JewelryBrandModal open onClose={vi.fn()} onContinue={onContinue} source="onboarding" />
    </ThemeProvider>,
  );
  return { onContinue };
}

function openMessageForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Message Nova' }));
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Example Atelier' } });
  fireEvent.change(screen.getByLabelText('Online store URL'), { target: { value: 'example.com' } });
}

describe('JewelryBrandModal Nova onboarding', () => {
  beforeEach(() => mockRunBrandScan.mockReset());

  it('starts with message available and transparently marks voice as coming soon', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Talk to Nova.*coming soon/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Message Nova' })).toBeEnabled();
    expect(screen.queryByLabelText('Brand name')).not.toBeInTheDocument();
  });

  it('reveals dedicated brand and storefront fields after Message Nova', () => {
    renderModal();
    openMessageForm();

    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
    expect(screen.getByLabelText('Online store URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start brand scan' })).toBeInTheDocument();
  });

  it('validates both required fields before starting the workflow', () => {
    renderModal();
    openMessageForm();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a valid URL/i)).toBeInTheDocument();
    expect(mockRunBrandScan).not.toHaveBeenCalled();
  });

  it('renders real scan findings, allows corrections, and completes through Maybe later', async () => {
    mockRunBrandScan.mockResolvedValue(completedScan);
    const { onContinue } = renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(screen.getByTestId('brand-scan-progress')).toBeInTheDocument();
    expect((await screen.findAllByText(completedScan.insights.identity)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Contemporary fine jewelry for the modern minimalist.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit Brand identity/i }));
    fireEvent.change(screen.getByDisplayValue(completedScan.insights.identity), {
      target: { value: 'Bold sculptural fine jewelry.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('Bold sculptural fine jewelry.').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Looks perfect' }));
    expect(screen.getByRole('button', { name: /Call Nova now.*coming soon/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      brand_name: 'Example Atelier',
      website_url: '',
      storefront_url: 'https://example.com',
      based_in: 'New York, USA',
      target_markets: ['United States'],
    }));
  });

  it('returns a robots-blocked scan to the form without faking findings', async () => {
    mockRunBrandScan.mockResolvedValue({
      ...completedScan,
      status: 'blocked',
      readinessLevel: null,
      errorCode: 'robots_denied',
      insights: { ...completedScan.insights, identity: '' },
    });
    renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('blocks automated scanning');
    await waitFor(() => expect(screen.getByLabelText('Online store URL')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Looks perfect' })).not.toBeInTheDocument();
  });

  it('renders a terminal workflow failure and stops the spinner', async () => {
    mockRunBrandScan.mockResolvedValue({
      ...completedScan,
      status: 'failed',
      errorCode: 'scanner_unauthorized',
      errorMessage: 'The storefront scanner could not be reached.',
      insights: EMPTY_BRAND_SCAN_INSIGHTS,
    });
    renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The storefront scanner could not be reached.');
    expect(screen.queryByTestId('brand-scan-progress')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Online store URL')).toBeInTheDocument();
  });

  it('offers URL retry or manual setup for a non-storefront result', async () => {
    mockRunBrandScan.mockResolvedValue({
      ...completedScan,
      status: 'partial',
      readinessLevel: 'non_storefront',
      insights: EMPTY_BRAND_SCAN_INSIGHTS,
    });
    renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(await screen.findByText(/couldn’t find an online store/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up manually' }));

    expect(await screen.findByText(/set up Example Atelier manually/i)).toBeInTheDocument();
    expect(screen.getByText('A few details we could not confirm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rescan storefront' })).not.toBeInTheDocument();
  });

  it('shows evidence without promising a completed AI read when analysis fails', async () => {
    mockRunBrandScan.mockResolvedValue({
      ...completedScan,
      status: 'partial',
      readinessLevel: 'full',
      errorCode: 'ai_analysis_failed',
      insights: { ...completedScan.insights, identity: '' },
    });
    renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(await screen.findByRole('status')).toHaveTextContent('AI brand read did not finish');
    expect(screen.getAllByText('Gold rings and necklaces').length).toBeGreaterThan(0);
  });

  it('forces only the explicit rescan action', async () => {
    mockRunBrandScan.mockResolvedValue(completedScan);
    renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Rescan storefront' }));
    await waitFor(() => expect(mockRunBrandScan).toHaveBeenCalledTimes(2));
    expect(mockRunBrandScan.mock.calls[0][1]).toMatchObject({ force: false });
    expect(mockRunBrandScan.mock.calls[1][1]).toMatchObject({ force: true });
  });

  it('asks only for missing optional details and accepts links without a protocol', async () => {
    mockRunBrandScan.mockResolvedValue({
      ...completedScan,
      insights: {
        ...completedScan.insights,
        targetMarkets: [],
        basedIn: '',
        socialLinks: [],
      },
    });
    const { onContinue } = renderModal();
    openMessageForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Start brand scan' }));

    expect(await screen.findByText('A few details we could not confirm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Where is your brand based?'), { target: { value: 'Lahore, Pakistan' } });
    fireEvent.change(screen.getByLabelText('Which markets matter most?'), { target: { value: 'Pakistan, UAE' } });
    fireEvent.change(screen.getByLabelText('Main social profile'), { target: { value: 'instagram.com/example' } });
    fireEvent.change(screen.getByLabelText('Physical store, if you have one'), { target: { value: 'maps.google.com/example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Looks perfect' }));
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      based_in: 'Lahore, Pakistan',
      target_markets: ['Pakistan', 'UAE'],
      social_links: ['https://instagram.com/example'],
      physical_location: 'https://maps.google.com/example',
    }));
  });
});
