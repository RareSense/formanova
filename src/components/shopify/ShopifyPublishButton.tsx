import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShopifyExportDialog } from '@/components/shopify/ShopifyExportDialog';
import { useShopifyStatus } from '@/hooks/useShopify';
import { cn } from '@/lib/utils';

function ShopifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 9a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1l-1 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 9z"
        fill="currentColor"
      />
      <path
        d="M9 8V6.5a3 3 0 0 1 6 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ShopifyPublishButtonProps {
  assetId: string | null;
  assetName: string;
  workflowId?: string | null;
  label?: string;
  className?: string;
  autoSuggest?: boolean;
  isResolvingAsset?: boolean;
}

export function ShopifyPublishButton({
  assetId,
  assetName,
  workflowId,
  label = 'Publish to Shopify',
  className,
  autoSuggest = false,
  isResolvingAsset = false,
}: ShopifyPublishButtonProps) {
  const { data: status, isLoading } = useShopifyStatus();
  const [exportOpen, setExportOpen] = useState(false);
  const [showDisconnectedHint, setShowDisconnectedHint] = useState(false);

  const isConnected = status?.connected;

  const handleClick = () => {
    if (!assetId) return;

    if (isConnected) {
      setShowDisconnectedHint(false);
      setExportOpen(true);
      return;
    }

    setShowDisconnectedHint(true);
  };

  return (
    <div>
      <Button
        type="button"
        variant={isConnected ? 'default' : 'outline'}
        onClick={handleClick}
        disabled={isLoading || isResolvingAsset || !assetId}
        className={cn('gap-2', className)}
      >
        {isLoading || isResolvingAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShopifyIcon className="h-4 w-4" />}
        {label}
      </Button>

      {showDisconnectedHint && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Connect your Shopify store first.{' '}
          <Link
            to="/my-shopify-store"
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Open Shopify settings
          </Link>
        </p>
      )}

      {assetId && (
        <ShopifyExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          assetId={assetId}
          assetName={assetName}
          workflowId={workflowId}
          autoSuggest={autoSuggest || Boolean(status?.auto_suggest)}
        />
      )}
    </div>
  );
}
