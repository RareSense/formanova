import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShopifyExportDialog } from '@/components/shopify/ShopifyExportDialog';
import { useShopifyStatus } from '@/hooks/useShopify';

interface PendingShopifyExport {
  assetId: string;
  assetName: string;
  workflowId?: string | null;
  returnPath?: string;
}

export function ShopifyReturnHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: status } = useShopifyStatus();
  const [pendingExport, setPendingExport] = useState<PendingShopifyExport | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Intercept backend OAuth callback: /dashboard?shopify_connected=true
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('shopify_connected') !== 'true') return;

    // New OAuth flow: link_token present — MyShopifyStore handles the full handshake
    if (params.get('link_token')) return;

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
      const pending = JSON.parse(raw) as Partial<PendingShopifyExport>;
      sessionStorage.removeItem('shopify_pending_export');
      if (!pending.assetId || !pending.assetName) return;
      setPendingExport({
        assetId: pending.assetId,
        assetName: pending.assetName,
        workflowId: pending.workflowId ?? null,
        returnPath: pending.returnPath,
      });
      setExportOpen(true);
      navigate(pending.returnPath || '/dashboard', { replace: true });
    } catch {
      sessionStorage.removeItem('shopify_pending_export');
    }
  }, [status?.connected, status?.shop_domain, status?.shop_name, navigate]);

  return pendingExport ? (
    <ShopifyExportDialog
      open={exportOpen}
      onOpenChange={(open) => {
        setExportOpen(open);
        if (!open) setPendingExport(null);
      }}
      assetId={pendingExport.assetId}
      assetName={pendingExport.assetName}
      workflowId={pendingExport.workflowId}
      autoSuggest={false}
    />
  ) : null;
}
