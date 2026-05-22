import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShopifyStatus } from '@/hooks/useShopify';

export function ShopifyReturnHandler() {
  const navigate = useNavigate();
  const { data: status } = useShopifyStatus();

  useEffect(() => {
    if (!status?.connected) return;

    const raw = sessionStorage.getItem('shopify_pending_export');
    if (!raw) return;

    try {
      const pending = JSON.parse(raw);
      sessionStorage.removeItem('shopify_pending_export');
      navigate(pending.returnPath || '/dashboard', {
        replace: true,
        state: { shopifyPendingExport: pending },
      });
    } catch {
      sessionStorage.removeItem('shopify_pending_export');
    }
  }, [status?.connected, navigate]);

  return null;
}
