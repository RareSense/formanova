import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestAltDeliveryNotification = vi.hoisted(() => vi.fn());
vi.mock('@/lib/alt-delivery-preference', async () => {
  const actual = await vi.importActual<typeof import('@/lib/alt-delivery-preference')>('@/lib/alt-delivery-preference');
  return { ...actual, requestAltDeliveryNotification: mockRequestAltDeliveryNotification };
});

import { useAltDeliveryPreference } from './useAltDeliveryPreference';
import { loadAltDeliveryPreference } from '@/lib/alt-delivery-preference';

beforeEach(() => {
  mockRequestAltDeliveryNotification.mockReset();
  mockRequestAltDeliveryNotification.mockResolvedValue(undefined);
  localStorage.clear();
});

describe('useAltDeliveryPreference', () => {
  it('notifies admin, persists the preference locally, and reports success', async () => {
    const { result } = renderHook(() => useAltDeliveryPreference('wf-1', 'jo@example.com', 'Text-to-CAD'));

    let didSucceed = false;
    await act(async () => {
      didSucceed = await result.current.requestDelivery('whatsapp', '+1 555 123 4567');
    });

    expect(didSucceed).toBe(true);
    expect(mockRequestAltDeliveryNotification).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: 'wf-1',
      sourceLabel: 'Text-to-CAD',
      accountEmail: 'jo@example.com',
      channel: 'whatsapp',
      contact: '+1 555 123 4567',
    }));
    expect(result.current.preference).toEqual({ channel: 'whatsapp', contact: '+1 555 123 4567' });
    expect(result.current.requested).toBe(true);
    expect(loadAltDeliveryPreference()).toEqual({ channel: 'whatsapp', contact: '+1 555 123 4567' });
  });

  it('refuses to request without a workflow id', async () => {
    const { result } = renderHook(() => useAltDeliveryPreference(null, 'jo@example.com'));

    let didSucceed = true;
    await act(async () => {
      didSucceed = await result.current.requestDelivery('whatsapp', '+1 555 123 4567');
    });

    expect(didSucceed).toBe(false);
    expect(mockRequestAltDeliveryNotification).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('surfaces a failure without marking the request as sent', async () => {
    mockRequestAltDeliveryNotification.mockRejectedValueOnce(new Error('Failed to submit feedback: 500'));
    const { result } = renderHook(() => useAltDeliveryPreference('wf-1', 'jo@example.com'));

    await act(async () => {
      await result.current.requestDelivery('imessage', '+1 555 123 4567');
    });

    await waitFor(() => expect(result.current.error).toBe('Failed to submit feedback: 500'));
    expect(result.current.requested).toBe(false);
    expect(result.current.preference).toBeNull();
  });
});
