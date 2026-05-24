import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ShopifyExportDialog } from '@/components/shopify/ShopifyExportDialog';
import { ShopifyConnectDialog } from '@/components/shopify/ShopifyConnectDialog';
import { useShopifyStatus } from '@/hooks/useShopify';
import { cn } from '@/lib/utils';

const SHOPIFY_BUTTON_ACCENT = '#6E9735';

function ShopifyIcon() {
  return (
    <svg viewBox="-18 0 292 292" className="h-5 w-5 shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46"/>
      <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E"/>
      <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF"/>
    </svg>
  );
}

interface ShopifyPublishButtonProps {
  assetId: string | null;
  assetName: string;
  workflowId?: string | null;
  label?: string;
  shortLabel?: string;
  className?: string;
  autoSuggest?: boolean;
  isResolvingAsset?: boolean;
}

export function ShopifyPublishButton({
  assetId,
  assetName,
  workflowId,
  label = 'Export to Shopify',
  shortLabel,
  className,
  autoSuggest = false,
  isResolvingAsset = false,
}: ShopifyPublishButtonProps) {
  const { data: status } = useShopifyStatus();
  const [exportOpen, setExportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [showNotReadyHint, setShowNotReadyHint] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isConnected = status?.connected;

  useEffect(() => {
    const pending = location.state?.shopifyPendingExport;
    if (!pending || !isConnected) return;
    if (pending.assetId !== assetId) return;
    setExportOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [isConnected, location.state, assetId]);

  const handleClick = () => {
    if (isConnected) {
      if (!assetId) {
        setShowNotReadyHint(true);
        return;
      }
      setShowNotReadyHint(false);
      setExportOpen(true);
      return;
    }

    if (assetId) {
      sessionStorage.setItem('shopify_pending_export', JSON.stringify({
        assetId,
        assetName,
        workflowId: workflowId ?? null,
        returnPath: location.pathname + location.search,
      }));
    }
    setConnectOpen(true);
  };

  return (
    <div className="w-full">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isResolvingAsset}
        style={{
          borderColor: SHOPIFY_BUTTON_ACCENT,
          color: SHOPIFY_BUTTON_ACCENT,
        }}
        className={cn(
          'gap-2 border bg-background hover:bg-background hover:text-[#6E9735]',
          className
        )}
      >
        {isResolvingAsset
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          : <ShopifyIcon />}
        {shortLabel ? (
          <>
            <span className="hidden whitespace-nowrap sm:inline">{label}</span>
            <span className="whitespace-nowrap sm:hidden">{shortLabel}</span>
          </>
        ) : (
          <span className="whitespace-nowrap">{label}</span>
        )}
      </Button>

      {showNotReadyHint && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Asset not ready yet. Try again in a moment.
        </p>
      )}

      <ShopifyConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />

      {assetId && (
        <ShopifyExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          assetId={assetId}
          assetName={assetName}
          workflowId={workflowId}
          autoSuggest={false}
        />
      )}
    </div>
  );
}
