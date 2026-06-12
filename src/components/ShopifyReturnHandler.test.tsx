import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ShopifyReturnHandler } from '@/components/ShopifyReturnHandler';

const mockUseShopifyStatus = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShopify', () => ({
  useShopifyStatus: () => mockUseShopifyStatus(),
}));

vi.mock('@/components/shopify/ShopifyExportDialog', () => ({
  ShopifyExportDialog: ({
    open,
    assetId,
    assetName,
  }: {
    open: boolean;
    assetId: string;
    assetName: string;
  }) => open ? <div>{`export-dialog:${assetId}:${assetName}`}</div> : null,
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

describe('ShopifyReturnHandler', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the export dialog after Shopify reconnect and returns to the original studio route', async () => {
    mockUseShopifyStatus.mockReturnValue({
      data: {
        connected: true,
        shop_name: 'FormaNova Demo',
        auto_suggest: false,
      },
      isLoading: false,
    });

    sessionStorage.setItem('shopify_pending_export', JSON.stringify({
      assetId: 'asset-42',
      assetName: 'Necklace Shot',
      workflowId: 'wf-99',
      returnPath: '/studio/necklace?mode=product-shot',
    }));

    render(
      <MemoryRouter initialEntries={['/dashboard?shopify_connected=true']}>
        <ShopifyReturnHandler />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('/studio/necklace?mode=product-shot')).toBeTruthy();
    });

    expect(screen.getByText('export-dialog:asset-42:Necklace Shot')).toBeTruthy();
    expect(sessionStorage.getItem('shopify_pending_export')).toBeNull();
  });

  it('does not redirect when link_token is present — MyShopifyStore owns that flow', async () => {
    mockUseShopifyStatus.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = render(
      <MemoryRouter initialEntries={['/my-shopify-store?shopify_connected=true&link_token=tok-abc']}>
        <ShopifyReturnHandler />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // URL must be unchanged after a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toContain('/my-shopify-store?shopify_connected=true&link_token=tok-abc');
  });
});
