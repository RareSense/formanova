import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useShopifyStatus } from '@/hooks/useShopify';

export function ShopifyReturnHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: status } = useShopifyStatus();

  // Intercept backend OAuth callback: /dashboard?shopify_connected=true
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('shopify_connected') !== 'true') return;

    // If there's a pending export, that effect handles navigation — just clean the param
    if (sessionStorage.getItem('shopify_pending_export')) {
      navigate(location.pathname, { replace: true });
      return;
    }

    // Return to the connect page with success indicator
    const returnPath = sessionStorage.getItem('shopify_connect_return') || '/my-shopify-store';
    sessionStorage.removeItem('shopify_connect_return');
    navigate(`${returnPath}?shopify=connected`, { replace: true });
  }, [location.search]);

  // Handle pending export (user was trying to publish an asset)
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
