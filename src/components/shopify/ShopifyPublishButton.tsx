import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShopifyExportDialog } from '@/components/shopify/ShopifyExportDialog';
import { useShopifyStatus } from '@/hooks/useShopify';
import { cn } from '@/lib/utils';

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

  const handleClick = () => {
    if (!assetId) return;

    if (status?.connected) {
      setShowDisconnectedHint(false);
      setExportOpen(true);
      return;
    }

    setShowDisconnectedHint(true);
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={isLoading || isResolvingAsset || !assetId}
        className={cn('gap-2', className)}
      >
        {isLoading || isResolvingAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
        {label}
      </Button>

      {showDisconnectedHint && (
        <p className="text-xs leading-relaxed text-muted-foreground">
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
