import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ShopifyReturnHandler } from '@/components/ShopifyReturnHandler';

const mockUseShopifyStatus = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShopify', () => ({
  useShopifyStatus: () => mockUseShopifyStatus(),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
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
    mockToast.mockReset();
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
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Shopify connected. You can now export images directly to FormaNova Demo.',
    });
    expect(sessionStorage.getItem('shopify_pending_export')).toBeNull();
  });
});
