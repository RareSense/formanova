import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultImageItem } from './ResultImageItem';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: (url: string) => url,
}));

vi.mock('@/components/shopify/ShopifyPublishButton', () => ({
  ShopifyPublishButton: () => <button type="button">Publish to Shopify</button>,
}));

vi.mock('@/lib/assets-api', () => ({
  findGeneratedPhotoAssetByWorkflowId: vi.fn(async () => null),
  getAssetDisplayName: vi.fn(() => ''),
}));

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
}));

describe('ResultImageItem', () => {
  const originalOpen = window.open;
  const originalAlert = window.alert;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
    window.alert = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:generated-preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    window.open = originalOpen;
    window.alert = originalAlert;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('opens artifact-backed results in a new tab via authenticated blob fetch', async () => {
    const newTab = {
      location: { href: '' },
      close: vi.fn(),
    } as unknown as Window;
    window.open = vi.fn(() => newTab);

    mockAuthenticatedFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
    } as Response);

    render(
      <ResultImageItem
        url="/api/artifacts/example-image"
        index={0}
        workflowId="wf-12345678"
        jewelryType="ring"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open image in new tab/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('', '_blank', 'noopener,noreferrer');
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/artifacts/example-image');
      expect(newTab.location.href).toBe('blob:generated-preview');
      expect(newTab.close).not.toHaveBeenCalled();
    });
  });

  it('alerts when opening in a new tab fails', async () => {
    window.open = vi.fn(() => null);

    render(
      <ResultImageItem
        url="/api/artifacts/example-image"
        index={0}
        workflowId="wf-12345678"
        jewelryType="ring"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open image in new tab/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Could not open the image in a new tab. Please try again.');
    });
  });
});
