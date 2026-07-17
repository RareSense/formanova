import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { ShopifyPublishButton } from '@/components/shopify/ShopifyPublishButton';

const mockUseShopifyStatus = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShopify', () => ({
  useShopifyStatus: () => mockUseShopifyStatus(),
}));

vi.mock('@/components/shopify/ShopifyExportDialog', () => ({
  ShopifyExportDialog: ({ open }: { open: boolean }) => open ? <div>export-dialog</div> : null,
}));

describe('ShopifyPublishButton', () => {
  it('opens the connect dialog when the store is not connected', () => {
    mockUseShopifyStatus.mockReturnValue({ data: { connected: false }, isLoading: false });

    render(
      <MemoryRouter>
        <ShopifyPublishButton assetId="asset-1" assetName="Photoshoot 3" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /export to shopify/i }));

    expect(screen.getByText(/connect your shopify store/i)).toBeTruthy();
  });

  it('opens the export dialog when the store is already connected', () => {
    mockUseShopifyStatus.mockReturnValue({ data: { connected: true }, isLoading: false });

    render(
      <MemoryRouter>
        <ShopifyPublishButton assetId="asset-1" assetName="Photoshoot 3" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /export to shopify/i }));

    expect(screen.getByText('export-dialog')).toBeTruthy();
  });
});
