import { useCallback, useEffect, useState } from 'react';
import {
  fetchNotificationSettings,
  patchNotificationSettings,
  type NotificationSettings,
} from '@/lib/notification-email-api';

const LOAD_ERROR = 'Could not load the saved notification settings.';
const SAVE_ERROR = 'Could not update the notification settings. Please try again.';

export function useNotificationEmail(accountEmail?: string | null) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetchNotificationSettings(controller.signal)
      .then(loaded => {
        setSettings(loaded);
        setError(null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : LOAD_ERROR);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const saveNotificationEmail = useCallback(async (email: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      const { notificationEmail } = await patchNotificationSettings({ notificationEmail: email });
      // The override is now also where mail goes, so both move together
      // rather than waiting on a refetch to agree with each other.
      setSettings(current => ({
        notificationEmail: notificationEmail ?? null,
        effectiveEmail: notificationEmail ?? null,
        emailEnabled: current?.emailEnabled ?? true,
      }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : SAVE_ERROR);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const setEmailEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    // Optimistic: a switch that waits on a round trip before moving reads as
    // broken. Reverted below if the PATCH fails.
    setSettings(current => (current ? { ...current, emailEnabled: enabled } : current));
    setError(null);
    try {
      await patchNotificationSettings({ emailEnabled: enabled });
      return true;
    } catch (err) {
      setSettings(current => (current ? { ...current, emailEnabled: !enabled } : current));
      setError(err instanceof Error ? err.message : SAVE_ERROR);
      return false;
    }
  }, []);

  const accountFallback = accountEmail?.trim() || null;

  return {
    /** Where results go: the backend's effective address, or the account email on an older profile. */
    notificationEmail: settings?.effectiveEmail ?? accountFallback,
    /** The raw override, or null when unset. Use this to decide whether the input pre-fills. */
    storedNotificationEmail: settings?.notificationEmail ?? null,
    emailEnabled: settings?.emailEnabled ?? true,
    isLoading,
    isSaving,
    error,
    saveNotificationEmail,
    setEmailEnabled,
  };
}
