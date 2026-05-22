import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Unplug } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useInvalidateShopifyStatus, useShopifyStatus } from '@/hooks/useShopify';
import {
  disconnectShopify,
  initiateShopifyConnect,
  updateShopifySettings,
} from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';
import {
  formatRelativeShopifyTime,
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

export default function MyShopifyStore() {
  const { toast } = useToast();
  const invalidateStatus = useInvalidateShopifyStatus();
  const { data: status, isLoading, isError } = useShopifyStatus();
  const [optimisticAutoSuggest, setOptimisticAutoSuggest] = useState<boolean | null>(null);

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
            <h1 className="font-display text-4xl uppercase tracking-wide text-foreground leading-none">Connect Shopify</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Send finished photos to your Shopify store as draft products.
            </p>
          </div>

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
    <div className="border border-border/30 p-8 md:p-10">

      {/* Card heading row */}
      <div className="mb-8 flex items-center gap-3">
        <ShopifyBagIcon className="h-6 w-6 shrink-0" />
        <div>
          <p className="font-display text-xl uppercase tracking-wide text-foreground leading-none">My Shopify store</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            Enter your store name to continue
          </p>
        </div>
      </div>

      {/* Form + CTA — constrained width */}
      <div className="max-w-sm space-y-5">

        {/* Label + input */}
        <div className="space-y-2">
          <label htmlFor="shopify-subdomain" className="block font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            Shopify store name
          </label>

          <div className="flex h-11 border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={connecting}
              aria-describedby="shopify-helper shopify-error"
              aria-invalid={!!error}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center border-l border-input bg-muted/30 px-3">
              <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.1em] text-muted-foreground">.myshopify.com</span>
            </div>
          </div>

          <p id="shopify-helper" className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
            Use the name before .myshopify.com in your Shopify URL.
          </p>

          {error && (
            <p id="shopify-error" role="alert" className="font-mono text-[10px] tracking-[0.1em] text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="space-y-2">
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
  status: { shop_name?: string; shop_domain?: string; last_used_at?: string | null; auto_suggest?: boolean };
  autoSuggestValue: boolean;
  isDisconnecting: boolean;
  isSavingSetting: boolean;
  onToggleAutoSuggest: (v: boolean) => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="border border-[#008060]/40">
      {/* Green header */}
      <div className="flex items-center gap-3 bg-[#008060] px-6 py-4">
        <ShopifyBagIcon className="h-5 w-5" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/90">Connected</span>
        <Check className="ml-auto h-4 w-4 text-white" />
      </div>

      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <p className="font-display text-xl uppercase tracking-wide text-foreground leading-none">{status.shop_name}</p>
          <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">{status.shop_domain}</p>
          <p className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
            Last used: {formatRelativeShopifyTime(status.last_used_at)}
          </p>
        </div>

        <label className="flex cursor-default items-start gap-3 border border-border/30 p-4">
          <input
            type="checkbox"
            checked={autoSuggestValue}
            disabled={isSavingSetting}
            onChange={(e) => onToggleAutoSuggest(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#008060]"
          />
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">Auto-generate AI copy</p>
            <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-muted-foreground">
              Every time you open the export panel, AI will pre-fill title, description, and alt text.
            </p>
          </div>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-destructive hover:text-destructive"
        >
          {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Disconnect store
        </Button>
      </div>
    </div>
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
            We couldn't check your connection. Retry to try again.
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} className="h-10 font-mono text-[10px] uppercase tracking-[0.2em]">
          Retry
        </Button>
      </div>
    </div>
  );
}
