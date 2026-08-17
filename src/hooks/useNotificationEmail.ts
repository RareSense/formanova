import { useCallback, useEffect, useState } from 'react';
import { fetchNotificationEmail, patchNotificationEmail } from '@/lib/notification-email-api';

export function useNotificationEmail(accountEmail?: string | null) {
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetchNotificationEmail(controller.signal)
      .then(email => {
        setStoredEmail(email);
        setError(null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load the saved notification email.');
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
      const savedEmail = await patchNotificationEmail(email);
      setStoredEmail(savedEmail);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the notification email. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const accountFallback = accountEmail?.trim();
  const effectiveEmail = storedEmail ?? (accountFallback || null);

  return {
    notificationEmail: effectiveEmail,
    isLoading,
    isSaving,
    error,
    saveNotificationEmail,
  };
}
