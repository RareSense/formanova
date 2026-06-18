import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultImageItem } from './ResultImageItem';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: (url: string) => url,
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

  it('opens results in a new tab by navigating directly (no CORS-prone fetch)', async () => {
    const newTab = {} as unknown as Window;
    window.open = vi.fn(() => newTab);

    render(
      <ResultImageItem
        url="https://cdn.example.com/result.png"
        index={0}
        workflowId="wf-12345678"
        jewelryType="ring"
      />,
    );

    fireEvent.click(screen.getAllByRole('button')[1]);

    await waitFor(() => {
      // Direct navigation to the resolved src — no fetch (which would CORS-block
      // a cross-origin Azure image).
      expect(window.open).toHaveBeenCalledWith('https://cdn.example.com/result.png', '_blank', 'noopener,noreferrer');
      expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
    });
  });

  it('alerts when opening in a new tab is popup-blocked', async () => {
    window.open = vi.fn(() => null);

    render(
      <ResultImageItem
        url="https://cdn.example.com/result.png"
        index={0}
        workflowId="wf-12345678"
        jewelryType="ring"
      />,
    );

    fireEvent.click(screen.getAllByRole('button')[1]);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Could not open the image in a new tab. Please try again.');
    });
  });

  it('falls back to opening the image when a cross-origin download fetch is blocked', async () => {
    const newTab = {} as unknown as Window;
    window.open = vi.fn(() => newTab);
    // Non-artifact URL -> plain fetch path; simulate a CORS block.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS'));

    render(
      <ResultImageItem
        url="https://cdn.example.com/result.png"
        index={0}
        workflowId="wf-12345678"
        jewelryType="ring"
      />,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('https://cdn.example.com/result.png', '_blank', 'noopener,noreferrer');
      expect(window.alert).not.toHaveBeenCalled();
    });

    fetchSpy.mockRestore();
  });
});
