import { submitFeedback } from '@/lib/feedback-api';

const STORAGE_KEY = 'formanova_alt_delivery_preference';

export type AltDeliveryChannel = 'whatsapp' | 'imessage';

export interface AltDeliveryPreference {
  channel: AltDeliveryChannel;
  contact: string;
}

export function isValidAltDeliveryContact(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length > 24 || !/^[+()\d][\d\s()-]*$/.test(trimmed)) return false;
  // Count digits, not characters: "+1 ()()()-" passes a length check while
  // carrying a single digit, and nobody can be messaged on that.
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Client-only for now — no backend field exists yet for a secondary contact. See docs/ALT_DELIVERY_BACKEND_SPEC.md. */
export function loadAltDeliveryPreference(): AltDeliveryPreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.channel === 'whatsapp' || parsed?.channel === 'imessage') {
      return { channel: parsed.channel, contact: String(parsed.contact ?? '') };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAltDeliveryPreference(pref: AltDeliveryPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch { /* storage unavailable or full — non-critical, request already went out */ }
}

/**
 * No dedicated backend endpoint exists for alternate-channel delivery yet.
 * Interim workaround (explicitly requested): reuse POST /api/feedback, the
 * one endpoint we know triggers a real backend email to the admin/support
 * inbox (feedback-api.ts, tracked by email_sent_at/email_error). The payload
 * is clearly marked as a delivery request, not a complaint, so an admin can
 * read it and manually message the customer — this is a manual bridge until
 * the backend spec (docs/ALT_DELIVERY_BACKEND_SPEC.md) is implemented.
 */
export async function requestAltDeliveryNotification(params: {
  workflowId: string;
  /** 'Text-to-CAD' or 'Image-to-CAD' — FeedbackRequest.generation_type has no image_to_cad
   *  value, so the real source goes in the complaint text instead of being lossily mapped. */
  sourceLabel: string;
  accountEmail: string | null;
  channel: AltDeliveryChannel;
  contact: string;
  resultUrl: string;
}): Promise<void> {
  const channelLabel = params.channel === 'whatsapp' ? 'WhatsApp' : 'iMessage';
  await submitFeedback({
    workflow_id: params.workflowId,
    generation_type: 'text_to_cad',
    input_image_urls: [],
    output_image_url: params.resultUrl,
    category: 'other',
    complaint: [
      '[Delivery request — not a complaint. Please forward manually, do not triage as a bug.]',
      `Source: ${params.sourceLabel}`,
      `Account email: ${params.accountEmail ?? 'unknown'}`,
      `Requested channel: ${channelLabel}`,
      `Contact number: ${params.contact}`,
      `Result link (requires the customer to be logged in): ${params.resultUrl}`,
    ].join('\n'),
  });
}
