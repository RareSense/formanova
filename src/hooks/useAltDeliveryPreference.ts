import { useCallback, useState } from 'react';
import {
  loadAltDeliveryPreference,
  requestAltDeliveryNotification,
  saveAltDeliveryPreference,
  type AltDeliveryChannel,
  type AltDeliveryPreference,
} from '@/lib/alt-delivery-preference';

/**
 * WhatsApp/iMessage delivery is a manual bridge (see alt-delivery-preference.ts) —
 * there is no backend field for a secondary contact yet, so the preference is
 * stored client-only and each request re-notifies admin via /api/feedback.
 */
export function useAltDeliveryPreference(workflowId: string | null, accountEmail?: string | null, sourceLabel = 'CAD') {
  const [preference, setPreference] = useState<AltDeliveryPreference | null>(() => loadAltDeliveryPreference());
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const requestDelivery = useCallback(async (channel: AltDeliveryChannel, contact: string): Promise<boolean> => {
    if (!workflowId) {
      setError('This design isn’t ready to send yet — try again once generation starts.');
      return false;
    }
    setIsRequesting(true);
    setError(null);
    try {
      const resultUrl = `${window.location.origin}${window.location.pathname}?workflow_id=${encodeURIComponent(workflowId)}`;
      await requestAltDeliveryNotification({
        workflowId,
        sourceLabel,
        accountEmail: accountEmail ?? null,
        channel,
        contact,
        resultUrl,
      });
      saveAltDeliveryPreference({ channel, contact });
      setPreference({ channel, contact });
      setRequested(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this request. Please try again.');
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, [workflowId, accountEmail, sourceLabel]);

  const resetRequested = useCallback(() => setRequested(false), []);

  return { preference, isRequesting, error, requested, requestDelivery, resetRequested };
}
