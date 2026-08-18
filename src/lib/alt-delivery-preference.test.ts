import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubmitFeedback = vi.hoisted(() => vi.fn());
vi.mock('@/lib/feedback-api', () => ({
  submitFeedback: mockSubmitFeedback,
}));

import {
  isValidAltDeliveryContact,
  loadAltDeliveryPreference,
  requestAltDeliveryNotification,
  saveAltDeliveryPreference,
} from './alt-delivery-preference';

beforeEach(() => {
  mockSubmitFeedback.mockReset();
  mockSubmitFeedback.mockResolvedValue({ success: true, feedback_id: 'f1' });
  localStorage.clear();
});

describe('isValidAltDeliveryContact', () => {
  it('accepts plausible phone numbers', () => {
    expect(isValidAltDeliveryContact('+1 555 123 4567')).toBe(true);
    expect(isValidAltDeliveryContact('(555) 123-4567')).toBe(true);
  });

  it('rejects too-short, too-long, and non-numeric input', () => {
    expect(isValidAltDeliveryContact('12345')).toBe(false);
    expect(isValidAltDeliveryContact('1'.repeat(21))).toBe(false);
    expect(isValidAltDeliveryContact('call me maybe')).toBe(false);
    expect(isValidAltDeliveryContact('')).toBe(false);
  });
});

describe('localStorage round-trip', () => {
  it('saves and loads a preference', () => {
    expect(loadAltDeliveryPreference()).toBeNull();
    saveAltDeliveryPreference({ channel: 'whatsapp', contact: '+1 555 123 4567' });
    expect(loadAltDeliveryPreference()).toEqual({ channel: 'whatsapp', contact: '+1 555 123 4567' });
  });

  it('ignores malformed or unrecognized stored data instead of throwing', () => {
    localStorage.setItem('formanova_alt_delivery_preference', '{not json');
    expect(loadAltDeliveryPreference()).toBeNull();
    localStorage.setItem('formanova_alt_delivery_preference', JSON.stringify({ channel: 'carrier_pigeon', contact: 'x' }));
    expect(loadAltDeliveryPreference()).toBeNull();
  });
});

describe('requestAltDeliveryNotification', () => {
  it('reuses POST /api/feedback with a clearly-marked, non-complaint payload', async () => {
    await requestAltDeliveryNotification({
      workflowId: 'wf-1',
      sourceLabel: 'Image-to-CAD',
      accountEmail: 'jo@example.com',
      channel: 'imessage',
      contact: '+1 555 123 4567',
      resultUrl: 'https://formanova.ai/image-to-cad?workflow_id=wf-1',
    });

    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
    const payload = mockSubmitFeedback.mock.calls[0][0];
    expect(payload.workflow_id).toBe('wf-1');
    expect(payload.category).toBe('other');
    expect(payload.input_image_urls).toEqual([]);
    expect(payload.output_image_url).toBe('https://formanova.ai/image-to-cad?workflow_id=wf-1');
    expect(payload.complaint).toContain('[Delivery request — not a complaint');
    expect(payload.complaint).toContain('Source: Image-to-CAD');
    expect(payload.complaint).toContain('jo@example.com');
    expect(payload.complaint).toContain('iMessage');
    expect(payload.complaint).toContain('+1 555 123 4567');
    expect(payload.complaint).toContain('https://formanova.ai/image-to-cad?workflow_id=wf-1');
  });

  it('falls back to "unknown" when no account email is available', async () => {
    await requestAltDeliveryNotification({
      workflowId: 'wf-2',
      sourceLabel: 'Text-to-CAD',
      accountEmail: null,
      channel: 'whatsapp',
      contact: '+1 555 000 1111',
      resultUrl: 'https://formanova.ai/text-to-cad?workflow_id=wf-2',
    });
    expect(mockSubmitFeedback.mock.calls[0][0].complaint).toContain('Account email: unknown');
  });

  it('propagates a failed submission to the caller', async () => {
    mockSubmitFeedback.mockRejectedValueOnce(new Error('Failed to submit feedback: 500'));
    await expect(requestAltDeliveryNotification({
      workflowId: 'wf-3',
      sourceLabel: 'Text-to-CAD',
      accountEmail: 'jo@example.com',
      channel: 'whatsapp',
      contact: '+1 555 000 1111',
      resultUrl: 'https://formanova.ai/text-to-cad?workflow_id=wf-3',
    })).rejects.toThrow('Failed to submit feedback: 500');
  });
});
