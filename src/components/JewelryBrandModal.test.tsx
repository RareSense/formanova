// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';

vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderModal(onContinue = vi.fn()) {
  render(
    <ThemeProvider>
      <JewelryBrandModal open source="onboarding" onContinue={onContinue} />
    </ThemeProvider>,
  );
  return { onContinue };
}

describe('JewelryBrandModal', () => {
  it('renders a single Primary sales channel field with the specified placeholder and helper text', () => {
    renderModal();
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Paste your website, Instagram, Facebook, Etsy or other sales link'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add the main place where customers currently sell or showcase their jewelry.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Website')).not.toBeInTheDocument();
    expect(screen.queryByText('Online store')).not.toBeInTheDocument();
  });

  it('does not render a close button', () => {
    renderModal();
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('does not close on Escape', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not close on overlay click', () => {
    renderModal();
    const heading = screen.getByText('Tell us about your jewelry brand');
    const overlay = heading.closest('.fixed') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
  });

  it('shows both brand-name and sales-channel errors when both are empty on submit', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));
    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
    expect(screen.getByText('Primary sales channel is required.')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('submits website_url from the sales channel field and store_url as empty', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.change(screen.getByPlaceholderText('Enter your brand or business name'), {
      target: { value: 'Acme Jewelry' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Paste your website, Instagram, Facebook, Etsy or other sales link'),
      { target: { value: 'instagram.com/acme' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    const details = onContinue.mock.calls[0][0];
    expect(details.website_url).toBe('https://instagram.com/acme');
    expect(details.store_url).toBe('');
  });
});
