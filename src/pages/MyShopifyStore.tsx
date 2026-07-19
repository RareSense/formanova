import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import fnLogo from '@/assets/fn-logo-black.webp';
import { ArrowLeft, Check, Info, Lock, Loader2, Store } from 'lucide-react';
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
  linkShopify,
  LinkTokenExpiredError,
} from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';

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
  const invalidateStatus = useInvalidateShopifyStatus();
  const { data: status, isLoading, isError } = useShopifyStatus();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLinkExpired, setShowLinkExpired] = useState(false);
  const [linkState, setLinkState] = useState<'idle' | 'checking'>('idle');
  const [hasPendingExport, setHasPendingExport] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const linkingRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shopifyConnected = params.get('shopify_connected');
    const linkToken = params.get('link_token');

    if (shopifyConnected === 'true' && linkToken) {
      // Persist before navigating so it survives any auth redirect
      sessionStorage.setItem('shopify_link_token', linkToken);
      navigate('/my-shopify-store', { replace: true });
      return;
    }

    // Recover pending token (set above then re-entered via clean URL, or post-login redirect)
    const storedToken = sessionStorage.getItem('shopify_link_token');
    if (storedToken && !linkingRef.current) {
      linkingRef.current = true;
      setLinkState('checking');
      linkShopify(storedToken)
        .then(async () => {
          sessionStorage.removeItem('shopify_link_token');
          if (sessionStorage.getItem('shopify_pending_export')) setHasPendingExport(true);
          await invalidateStatus();
          setLinkState('idle');
          setShowSuccessModal(true);
        })
        .catch((err) => {
          sessionStorage.removeItem('shopify_link_token');
          setLinkState('idle');
          linkingRef.current = false;
          if (err instanceof LinkTokenExpiredError) {
            setShowLinkExpired(true);
          } else {
            toast({
              title: "Couldn't link your store. Try installing again from Shopify.",
              variant: 'destructive',
            });
          }
        });
      return;
    }

    // Legacy callback param
    if (params.get('shopify') === 'connected') {
      navigate('/my-shopify-store', { replace: true });
      invalidateStatus();
      setShowSuccessModal(true);
    }
  }, [location.search]);

  const disconnectMutation = useMutation({
    mutationFn: disconnectShopify,
    onSuccess: async () => {
      await invalidateStatus();
    },
    onError: () => {
      toast({ title: 'Could not disconnect. Try again.', variant: 'destructive' });
    },
  });

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
              Send your finished photos straight to your Shopify store as drafts.
            </p>
          </div>

          {/* Success modal — shown once after OAuth callback */}
          <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
            <DialogContent className="sm:max-w-lg">
              <div className="flex flex-col items-center gap-6 px-3 pt-5 pb-3 text-center">

                {/* Connection graphic: Shopify → ··· → ✓ → ··· → FormaNova */}
                <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex items-center justify-end gap-3">
                    <div className="flex h-12 w-12 items-center justify-center">
                      <ShopifyBagIcon className="h-10 w-10 shrink-0" />
                    </div>
                    <span className="flex items-center gap-1">
                      {[0, 1, 2].map((i) => <span key={i} className="block h-1.5 w-1.5 rounded-full bg-border" />)}
                    </span>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#008060]">
                    <Check className="h-4 w-4 text-white" />
                  </span>
                  <div className="flex items-center justify-start gap-3">
                    <span className="flex items-center gap-1">
                      {[0, 1, 2].map((i) => <span key={i} className="block h-1.5 w-1.5 rounded-full bg-border" />)}
                    </span>
                    <div className="flex h-14 w-14 items-center justify-center">
                      <img src={fnLogo} alt="FormaNova" className={`h-14 w-14 object-contain${DARK_THEMES.has(theme) ? ' invert' : ''}`} />
                    </div>
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

                <Button
                  onClick={() => {
                    setShowSuccessModal(false);
                    if (hasPendingExport) navigate('/dashboard?shopify_connected=true');
                  }}
                  className="h-12 w-full font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {hasPendingExport ? 'Continue to export' : 'Got it'}
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
          {isLoading || linkState === 'checking' ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 border border-border/30">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              {linkState === 'checking' && (
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Connecting store...
                </p>
              )}
            </div>
          ) : showLinkExpired ? (
            <LinkExpiredCard />
          ) : isError ? (
            <ErrorCard onRetry={() => invalidateStatus()} />
          ) : status?.connected ? (
            <ConnectedCard
              status={status}
              isDisconnecting={disconnectMutation.isPending}
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

/* ---------- Connect (App Store listing flow — no domain input) ---------- */

// INTEGRATION POINT: set VITE_SHOPIFY_APP_LISTING_URL in .env
// Must be the public App Store listing: https://apps.shopify.com/<your-handle>
// NEVER a custom-app or single-store install link (admin.shopify.com/store/.../install_custom_app):
// those are store-locked, signed, and expire; anyone else gets Shopify "Unauthorized Access".
// During app review, leave unset (button disables); reviewers install via Shopify's review flow.
const SHOPIFY_LISTING_URL = import.meta.env.VITE_SHOPIFY_APP_LISTING_URL as string | undefined;

function ConnectCard() {
  return (
    <div className="border border-foreground px-8 py-10 md:px-10 md:py-14">
      <div className="flex flex-col items-center text-center">

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
        >
          <ShopifyBagIcon className="h-14 w-14" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.35 }}
          className="mt-7 space-y-3"
        >
          <h2 className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
            Connect your Shopify store
          </h2>
          <p className="mx-auto max-w-[22rem] text-sm leading-relaxed text-muted-foreground">
            Send your finished photos to Shopify as drafts.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.30, duration: 0.35 }}
          className="mt-8 w-full max-w-xs space-y-4"
        >
          <Button
            onClick={() => { if (SHOPIFY_LISTING_URL) window.location.href = SHOPIFY_LISTING_URL; }}
            disabled={!SHOPIFY_LISTING_URL}
            className="h-12 w-full gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em]"
            aria-label="Connect with Shopify — opens the App Store listing"
          >
            <ShopifyBagIcon className="h-4 w-4 shrink-0" />
            Connect your Shopify store
          </Button>


        </motion.div>

      </div>
    </div>
  );
}

/* ---------- Connected ---------- */

function ConnectedCard({
  status,
  isDisconnecting,
  onDisconnect,
}: {
  status: { shop_name?: string; shop_domain?: string };
  isDisconnecting: boolean;
  onDisconnect: () => void;
}) {
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  return (
    <>
      <div className="border border-border">

        {/* Card header: icon + title + toggle */}
        <div className="flex items-start gap-5 border-b border-border px-8 py-6">
          <ShopifyBagIcon className="mt-1 h-9 w-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-foreground">Store connection</p>
            <p className="mt-1 text-sm text-muted-foreground">Manage your Shopify store connection.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-primary">Connected</span>
            <button
              type="button"
              role="switch"
              aria-checked
              aria-label="Disconnect Shopify"
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={isDisconnecting}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-primary transition-colors disabled:opacity-50"
            >
              <span className="inline-block h-5 w-5 translate-x-[22px] rounded-full bg-primary-foreground shadow transition-transform" />
            </button>
          </div>
        </div>

        {/* Connected store */}
        <div className="px-8 py-6">
          <p className="flex items-center gap-2 text-base text-foreground">
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">Connected to </span>
              <span className="font-medium">{status.shop_name || status.shop_domain}</span>
            </span>
          </p>
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-2 border-t border-border px-8 py-4">
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
            Turning the toggle off will ask for confirmation.
          </p>
        </div>
      </div>

      {/* Disconnect confirmation modal */}
      <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <DialogContent className="border-foreground sm:max-w-md">
          <div className="flex flex-col items-center pt-2">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <ShopifyBagIcon className="h-12 w-12" />
              <DialogTitle className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
                Disconnect Shopify
              </DialogTitle>
            </div>

            <div className="w-full space-y-5">
              <div className="border border-border bg-muted/20 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  What changes
                </p>
                <DialogDescription className="mt-2 text-sm leading-6 text-foreground">
                  Exports stop until you reconnect.
                </DialogDescription>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={isDisconnecting}
                  className="h-11 w-full font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
                >
                  Keep connected
                </Button>

                <Button
                  onClick={() => {
                    setShowDisconnectConfirm(false);
                    onDisconnect();
                  }}
                  disabled={isDisconnecting}
                  className="h-11 w-full gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                  Disconnect Shopify
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Link expired ---------- */

function LinkExpiredCard() {
  return (
    <div className="border border-border/30 p-8">
      <div className="flex flex-col items-start gap-6">
        <ShopifyBagIcon className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Connection timed out</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your Shopify connection timed out. Please reinstall from the Shopify App Store.
          </p>
        </div>
        {SHOPIFY_LISTING_URL && (
          <Button
            onClick={() => { window.location.href = SHOPIFY_LISTING_URL!; }}
            className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
            aria-label="Connect with Shopify — opens the App Store listing"
          >
            <ShopifyBagIcon className="h-4 w-4 shrink-0" />
            Connect Shopify
          </Button>
        )}
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
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Status unavailable</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Could not confirm your Shopify connection right now. Check your connection and try again.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={onRetry} className="h-10 font-mono text-[10px] uppercase tracking-[0.2em]">
            Retry
          </Button>
          <Button
            onClick={() => { if (SHOPIFY_LISTING_URL) window.location.href = SHOPIFY_LISTING_URL; }}
            disabled={!SHOPIFY_LISTING_URL}
            className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            <ShopifyBagIcon className="h-4 w-4 shrink-0" />
            Connect Shopify
          </Button>
        </div>
      </div>
    </div>
  );
}
