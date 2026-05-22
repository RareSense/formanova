import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/formanova-logo-black.png';
import logoWhite from '@/assets/formanova-logo-white.png';
import { ArrowLeft, ArrowRight, Check, Info, Lock, Loader2, Settings, Store } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInvalidateShopifyStatus, useShopifyStatus } from '@/hooks/useShopify';
import {
  disconnectShopify,
  initiateShopifyConnect,
  updateShopifySettings,
} from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';
import {
  isValidShopifySubdomain,
  normalizeShopifySubdomain,
} from '@/lib/shopify-utils';

function ShopifyBagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-18 0 292 292" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46"/>
      <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E"/>
      <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF"/>
    </svg>
  );
}

const DARK_THEMES = new Set(['dark', 'cyberpunk', 'retro', 'fashion', 'luxury', 'synthwave', 'neon']);

export default function MyShopifyStore() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const logoSrc = DARK_THEMES.has(theme) ? logoWhite : logoBlack;
  const invalidateStatus = useInvalidateShopifyStatus();
  const { data: status, isLoading, isError } = useShopifyStatus();
  const [optimisticAutoSuggest, setOptimisticAutoSuggest] = useState<boolean | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('shopify') !== 'connected') return;
    navigate('/my-shopify-store', { replace: true });
    invalidateStatus();
    setShowSuccessModal(true);
  }, [location.search]);

  const disconnectMutation = useMutation({
    mutationFn: disconnectShopify,
    onSuccess: async () => {
      await invalidateStatus();
      toast({ title: 'Store disconnected.' });
    },
    onError: () => {
      toast({ title: 'Could not disconnect. Try again.', variant: 'destructive' });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: updateShopifySettings,
    onSuccess: async (result) => {
      setOptimisticAutoSuggest(result.auto_suggest);
      await invalidateStatus();
    },
    onError: () => {
      setOptimisticAutoSuggest(null);
      toast({ title: 'Could not save setting.', variant: 'destructive' });
    },
  });

  const autoSuggestValue = optimisticAutoSuggest ?? status?.auto_suggest ?? false;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background px-4 py-8 sm:px-6 md:px-12 lg:px-16">
      <div className="mx-auto max-w-[760px]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-8"
        >
          {/* Back link */}
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Dashboard
          </Link>

          {/* Page title */}
          <div>
            <h1 className="font-display text-4xl uppercase tracking-wide text-foreground leading-none">Connect your Shopify store</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Send finished photos to your Shopify store as draft products.
            </p>
          </div>

          {/* Success modal — shown once after OAuth callback */}
          <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
            <DialogContent className="sm:max-w-md">
              <div className="flex flex-col items-center gap-6 px-3 pt-5 pb-3 text-center">

                {/* Connection graphic: Shopify → ··· → ✓ → ··· → FormaNova */}
                <div className="flex w-full items-center">
                  <div className="flex flex-1 items-center justify-end gap-3">
                    <ShopifyBagIcon className="h-10 w-10 shrink-0" />
                    <span className="flex items-center gap-1">
                      {[0, 1, 2].map((i) => <span key={i} className="block h-1.5 w-1.5 rounded-full bg-border" />)}
                    </span>
                  </div>
                  <span className="mx-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#008060]">
                    <Check className="h-4 w-4 text-white" />
                  </span>
                  <div className="flex flex-1 items-center justify-start gap-3">
                    <span className="flex items-center gap-1">
                      {[0, 1, 2].map((i) => <span key={i} className="block h-1.5 w-1.5 rounded-full bg-border" />)}
                    </span>
                    <img src={logoSrc} alt="FormaNova" className="h-8 w-auto object-contain" />
                  </div>
                </div>

                {/* Title + green accent line */}
                <div className="flex flex-col items-center gap-2.5">
                  <DialogTitle className="font-display text-3xl uppercase tracking-wide text-foreground leading-none">
                    Shopify connected
                  </DialogTitle>
                  <span className="block h-0.5 w-8 bg-[#008060]" />
                </div>

                <DialogDescription className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Your store is now connected to FormaNova.
                </DialogDescription>

                {/* Connected store card */}
                {status?.shop_domain && (
                  <div className="flex w-full items-center gap-3 border border-border bg-muted/20 px-4 py-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background">
                      <Store className="h-4 w-4 text-[#008060]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Connected store</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{status.shop_domain}</p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setShowSuccessModal(false)}
                  className="h-12 w-full font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  Got it
                </Button>

                <div className="flex items-center justify-center gap-1.5 pb-1">
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <p className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground">
                    You can manage this connection anytime.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Card */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center border border-border/30">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <ErrorCard onRetry={() => invalidateStatus()} />
          ) : status?.connected ? (
            <ConnectedCard
              status={status}
              autoSuggestValue={autoSuggestValue}
              isDisconnecting={disconnectMutation.isPending}
              isSavingSetting={settingsMutation.isPending}
              onToggleAutoSuggest={(next) => {
                setOptimisticAutoSuggest(next);
                settingsMutation.mutate(next);
              }}
              onDisconnect={() => disconnectMutation.mutate()}
            />
          ) : (
            <ConnectCard />
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ---------- Connect (inline form) ---------- */

function ConnectCard() {
  const [shop, setShop] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const isValid = shop.length > 0 && isValidShopifySubdomain(shop);

  const handleConnect = async () => {
    const normalizedShop = normalizeShopifySubdomain(shop);

    if (!normalizedShop) {
      setError('Enter your store URL to continue.');
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
      sessionStorage.setItem('shopify_connect_return', '/my-shopify-store');
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
    <div className="border border-foreground px-8 py-8 md:px-10 md:py-10">
      <div className="flex flex-col items-center">

      {/* Card heading */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <ShopifyBagIcon className="h-10 w-10" />
        <p className="font-display text-xl uppercase tracking-wide text-foreground leading-none">Enter your Shopify URL</p>
      </div>

      {/* Form + CTA — constrained width */}
      <div className="w-full max-w-sm space-y-4">

        {/* Label + input */}
        <div className="space-y-2">
          <label htmlFor="shopify-subdomain" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
            Shopify URL
          </label>

          <p id="shopify-helper" className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
            Use the first part of your .myshopify.com URL.
          </p>

          <div className="flex h-11 border border-foreground bg-background ring-offset-background focus-within:ring-2 focus-within:ring-foreground focus-within:ring-offset-2">
            <input
              id="shopify-subdomain"
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
              aria-describedby="shopify-helper shopify-error"
              aria-invalid={!!error}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center border-l border-foreground bg-muted/30 px-3">
              <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.1em] text-muted-foreground">.myshopify.com</span>
            </div>
          </div>

          {isValid && !error && (
            <div className="flex items-center gap-1.5">
              <Check className="h-3 w-3 shrink-0 text-[#008060]" />
              <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
                You'll connect: <span className="text-foreground">{shop}.myshopify.com</span>
              </span>
            </div>
          )}

          {error && (
            <p id="shopify-error" role="alert" className="font-mono text-[10px] tracking-[0.1em] text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="space-y-3">
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
            {connecting ? 'Connecting...' : 'Connect to Shopify'}
            {!connecting && <ArrowRight className="h-4 w-4 shrink-0" />}
          </Button>

          <div className="flex items-center justify-center gap-1.5">
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            <p className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground">
              We'll only use this to create draft products from your finished photos.
            </p>
          </div>
        </div>

      </div>
      </div>
    </div>
  );
}

/* ---------- Connected ---------- */

function ConnectedCard({
  status,
  autoSuggestValue,
  isDisconnecting,
  isSavingSetting,
  onToggleAutoSuggest,
  onDisconnect,
}: {
  status: { shop_name?: string; shop_domain?: string; auto_suggest?: boolean };
  autoSuggestValue: boolean;
  isDisconnecting: boolean;
  isSavingSetting: boolean;
  onToggleAutoSuggest: (v: boolean) => void;
  onDisconnect: () => void;
}) {
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  return (
    <>
      <div className="border border-border">

        {/* Card header: icon + title + toggle */}
        <div className="flex items-start gap-4 border-b border-border px-6 py-5">
          <ShopifyBagIcon className="mt-0.5 h-8 w-8 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Shopify publishing</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage Shopify draft-product publishing.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Connected</span>
            <button
              type="button"
              role="switch"
              aria-checked
              aria-label="Disconnect Shopify"
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={isDisconnecting}
              className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-primary transition-colors disabled:opacity-50"
            >
              <span className="inline-block h-4 w-4 translate-x-[18px] rounded-full bg-primary-foreground shadow transition-transform" />
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">

          {/* Connected store */}
          <div className="px-6 py-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Connected to</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">{status.shop_domain}</p>
          </div>

          {/* AI setting */}
          <label className="flex cursor-default items-start gap-3 px-6 py-5">
            <input
              type="checkbox"
              checked={autoSuggestValue}
              disabled={isSavingSetting}
              onChange={(e) => onToggleAutoSuggest(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Pre-fill product copy with AI</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Generate draft title, description, and alt text before publishing.
              </p>
            </div>
          </label>

        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-1.5 border-t border-border px-6 py-3">
          <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
          <p className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
            Turning the toggle off will ask for confirmation.
          </p>
        </div>
      </div>

      {/* Disconnect confirmation modal */}
      <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <DialogContent className="sm:max-w-sm">
          <div className="space-y-4 px-1 pt-1 pb-1">
            <DialogTitle className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
              Disconnect Shopify store?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              This will pause Shopify publishing. Finished photos will not be sent to Shopify until you reconnect.
            </DialogDescription>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={isDisconnecting}
                className="h-10 font-mono text-[10px] uppercase tracking-[0.15em]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowDisconnectConfirm(false);
                  onDisconnect();
                }}
                disabled={isDisconnecting}
                className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
              >
                {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Disconnect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Error ---------- */

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-border/30 p-8">
      <div className="flex flex-col items-start gap-6">
        <ShopifyBagIcon className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Can't reach Shopify</p>
          <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-muted-foreground">
            Couldn't load your Shopify status. Check your connection and try again.
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} className="h-10 font-mono text-[10px] uppercase tracking-[0.2em]">
          Try again
        </Button>
      </div>
    </div>
  );
}
