import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Eye, ExternalLink, Lock, Loader2, Shield, Sparkles, Unplug } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ShopifyConnectDialog } from '@/components/shopify/ShopifyConnectDialog';
import { useInvalidateShopifyStatus, useShopifyStatus } from '@/hooks/useShopify';
import { disconnectShopify, updateShopifySettings } from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeShopifyTime } from '@/lib/shopify-utils';

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
  const [connectOpen, setConnectOpen] = useState(false);
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
    <div className="min-h-[calc(100vh-5rem)] bg-background px-6 py-8 md:px-12 lg:px-16">
      <div className="mx-auto max-w-4xl">
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
            <h1 className="font-display text-4xl uppercase tracking-tight">Shopify</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect once. Send finished photos to Shopify as draft products.
            </p>
          </div>

          {/* Card */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <ErrorCard onConnect={() => setConnectOpen(true)} onRetry={() => invalidateStatus()} />
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
            <DisconnectedCard onConnect={() => setConnectOpen(true)} />
          )}

          {/* Help link */}
          {!isLoading && !status?.connected && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              <span>Need help connecting?</span>
              <a
                href="https://help.formanova.ai/shopify"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                View guide
              </a>
            </div>
          )}
        </motion.div>
      </div>

      <ShopifyConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}

/* ---------- Disconnected ---------- */

function DisconnectedCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* Left — connect pane */}
        <div className="flex flex-col gap-6 p-8">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#008060]/10">
            <ShopifyBagIcon className="h-9 w-9 text-[#008060]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Connect Shopify</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send finished photos to your Shopify store as draft products.
            </p>
          </div>

          {/* Safety note */}
          <div className="flex gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#008060]" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Nothing goes live automatically.</p>
              <p className="text-sm text-muted-foreground">
                You'll review everything in Shopify before publishing.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              onClick={onConnect}
              className="h-12 w-full gap-2.5 bg-foreground text-background hover:bg-foreground/90 text-sm font-medium"
            >
              <ShopifyBagIcon className="h-4 w-4 shrink-0" />
              Connect store
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" />
              Takes less than a minute. You can disconnect anytime.
            </p>
          </div>
        </div>

        {/* Divider (vertical on md+, horizontal on mobile) */}
        <div className="hidden md:block w-px bg-border self-stretch" />
        <div className="block md:hidden h-px bg-border" />

        {/* Right — explainer pane */}
        <div className="flex flex-col gap-6 p-8">
          <h3 className="text-sm font-semibold text-foreground">What happens after connecting?</h3>

          {/* Step visualizer */}
          <div className="flex items-start justify-between gap-2">
            <Step
              icon={<Sparkles className="h-5 w-5 text-[hsl(var(--formanova-hero-accent))]" />}
              bg="bg-[hsl(var(--formanova-hero-accent))]/10"
              label="Finished photo"
            />
            <Dash />
            <Step
              icon={<ShopifyBagIcon className="h-5 w-5 text-[#008060]" />}
              bg="bg-[#008060]/10"
              label={<><strong>Draft product</strong><br />in Shopify</>}
            />
            <Dash />
            <Step
              icon={<Eye className="h-5 w-5 text-purple-500" />}
              bg="bg-purple-500/10"
              label={<>Review in Shopify<br />before going live</>}
            />
          </div>

          {/* Control note */}
          <div className="flex gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#008060]">
              <Check className="h-3 w-3 text-[#008060]" />
            </div>
            <p className="text-sm text-muted-foreground">
              You stay in control. Publish only when you're ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ icon, bg, label }: { icon: React.ReactNode; bg: string; label: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${bg}`}>
        {icon}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

function Dash() {
  return (
    <div className="mt-6 flex-1 border-t-2 border-dashed border-border" />
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
    <div className="overflow-hidden rounded-2xl border border-[#008060]/30 bg-card">
      {/* Green header */}
      <div className="flex items-center gap-3 bg-[#008060] px-6 py-4">
        <ShopifyBagIcon className="h-5 w-5 text-white" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/90">Connected</span>
        <Check className="ml-auto h-4 w-4 text-white" />
      </div>

      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">{status.shop_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{status.shop_domain}</p>
          <p className="text-xs text-muted-foreground">
            Last used: {formatRelativeShopifyTime(status.last_used_at)}
          </p>
        </div>

        <label className="flex cursor-default items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <input
            type="checkbox"
            checked={autoSuggestValue}
            disabled={isSavingSetting}
            onChange={(e) => onToggleAutoSuggest(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#008060]"
          />
          <div className="space-y-0.5">
            <p className="text-sm text-foreground">Auto-generate AI copy</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every time you open the export panel, AI will pre-fill title, description, and alt text.
            </p>
          </div>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:border-destructive hover:text-destructive"
        >
          {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Disconnect store
        </Button>
      </div>
    </div>
  );
}

/* ---------- Error ---------- */

function ErrorCard({ onConnect, onRetry }: { onConnect: () => void; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
          <ShopifyBagIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Can't reach Shopify</p>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-xs">
            We couldn't check your connection. You can retry or start the connect flow.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onRetry} className="h-10 font-mono text-[10px] uppercase tracking-[0.15em]">
            Retry
          </Button>
          <Button onClick={onConnect} className="h-10 gap-2 px-5 font-mono text-[10px] uppercase tracking-[0.15em]">
            <ShopifyBagIcon className="h-4 w-4" />
            Connect Store
          </Button>
        </div>
      </div>
    </div>
  );
}
