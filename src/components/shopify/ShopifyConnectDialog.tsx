import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShopifyStatus } from '@/hooks/useShopify';
import { initiateShopifyConnect } from '@/services/shopify-api';
import { isValidShopifySubdomain, normalizeShopifySubdomain } from '@/lib/shopify-utils';

function ShopifyBagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-18 0 292 292" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46"/>
      <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E"/>
      <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF"/>
    </svg>
  );
}

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
      setError('Enter your store name to continue.');
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConnect();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-foreground/30">
        <div className="flex flex-col items-center pt-2">

          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <ShopifyBagIcon className="h-12 w-12" />
            <DialogTitle className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
              Connect Shopify
            </DialogTitle>
          </div>

          {status?.connected ? (
            <div className="w-full space-y-4">
              <div className="flex items-center gap-3 bg-[#008060] px-4 py-3">
                <ShopifyBagIcon className="h-4 w-4" />
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/90">Connected</span>
                <Check className="ml-auto h-4 w-4 text-white" />
              </div>
              <div className="border border-border bg-muted/20 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Connected store</p>
                <p className="mt-1 text-sm text-foreground">{status.shop_name || status.shop_domain}</p>
              </div>
              <Button
                onClick={() => onOpenChange(false)}
                className="h-11 w-full gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
              >
                <ShopifyBagIcon className="h-4 w-4 shrink-0" />
                Done
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="shopify-dialog-domain"
                  className="block text-sm font-medium text-foreground"
                >
                  Shopify store name
                </label>

                <p id="shopify-dialog-helper" className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
                  Use the name before .myshopify.com in your Shopify URL.
                </p>

                <div className="flex h-11 border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <input
                    id="shopify-dialog-domain"
                    type="text"
                    value={shop}
                    onChange={(e) => {
                      setShop(normalizeShopifySubdomain(e.target.value));
                      if (error) setError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="maevori-jewelry"
                    autoComplete="on"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={connecting}
                    aria-describedby="shopify-dialog-helper shopify-dialog-error"
                    aria-invalid={!!error}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                  />
                  <div className="flex items-center border-l border-input bg-muted/30 px-3">
                    <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.1em] text-muted-foreground">.myshopify.com</span>
                  </div>
                </div>

                {error && (
                  <p id="shopify-dialog-error" role="alert" className="font-mono text-[10px] tracking-[0.1em] text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="h-11 w-full gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em]"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <ShopifyBagIcon className="h-4 w-4 shrink-0" />
                )}
                {connecting ? 'Connecting...' : 'Continue to Shopify'}
                {!connecting && <ArrowRight className="h-4 w-4 shrink-0" />}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
