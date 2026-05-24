import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ShopifyExportDialog } from '@/components/shopify/ShopifyExportDialog';

const mockUseShopifyStatus = vi.hoisted(() => vi.fn());
const mockUseToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShopify', () => ({
  useShopifyStatus: () => mockUseShopifyStatus(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => mockUseToast(),
}));

vi.mock('@/services/shopify-api', () => ({
  exportToShopify: vi.fn(),
  suggestShopifyMetadata: vi.fn(),
}));

describe('ShopifyExportDialog', () => {
  it('does not render the AI suggestion button', () => {
    mockUseShopifyStatus.mockReturnValue({
      data: {
        connected: true,
        shop_name: 'FormaNova Demo',
      },
      isLoading: false,
    });
    mockUseToast.mockReturnValue({ toast: vi.fn() });

    render(
      <ShopifyExportDialog
        open
        onOpenChange={() => {}}
        assetId="asset-1"
        assetName="Necklace Shot"
      />,
    );

    expect(screen.queryByRole('button', { name: /generate with ai/i })).toBeNull();
    expect(screen.getByRole('button', { name: /publish to shopify/i })).toBeTruthy();
  });
});
