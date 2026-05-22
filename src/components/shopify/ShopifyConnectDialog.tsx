import { useState } from 'react';
import { Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShopifyStatus } from '@/hooks/useShopify';
import { initiateShopifyConnect } from '@/services/shopify-api';
import { isValidShopifySubdomain, normalizeShopifySubdomain } from '@/lib/shopify-utils';

interface ShopifyConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShopifyConnectDialog({ open, onOpenChange }: ShopifyConnectDialogProps) {
  const { data: status } = useShopifyStatus();
  const [shop, setShop] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    const normalizedShop = normalizeShopifySubdomain(shop);

    if (!normalizedShop) {
      setError('Enter your Shopify subdomain to continue.');
      return;
    }

    if (!isValidShopifySubdomain(normalizedShop)) {
      setError('Use lowercase letters, numbers, and hyphens only.');
      return;
    }

    setError(null);
    setConnecting(true);
    try {
      const installUrl = await initiateShopifyConnect(normalizedShop);
      window.location.href = installUrl;
    } catch {
      setError('Could not start Shopify connection. Try again.');
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/40">
            <Store className="h-5 w-5 text-foreground" />
          </div>
          <DialogTitle className="font-display text-2xl uppercase tracking-wide">
            Connect Shopify
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Connect your store once, then publish generated images straight into Shopify draft products.
          </DialogDescription>
        </DialogHeader>

        {status?.connected ? (
          <div className="space-y-4">
            <div className="border border-border bg-muted/20 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Connected store
              </p>
              <p className="mt-2 text-sm text-foreground">{status.shop_name || status.shop_domain}</p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="h-10 w-full gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              <Store className="h-4 w-4" />
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="shopify-shop-domain" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Store name
              </label>
              <Input
                id="shopify-shop-domain"
                value={shop}
                onChange={(event) => setShop(normalizeShopifySubdomain(event.target.value))}
                placeholder="maevori-jewelry"
                autoComplete="off"
                className="h-11"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                The name before .myshopify.com in your store URL. We&apos;ll redirect you to Shopify to approve access.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="h-11 w-full gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              <Store className="h-4 w-4" />
              {connecting ? 'Connecting…' : 'Connect Shopify Store'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
