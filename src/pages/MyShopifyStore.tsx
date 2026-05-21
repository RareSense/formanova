import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Unplug } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ShopifyConnectDialog } from '@/components/shopify/ShopifyConnectDialog';
import { useInvalidateShopifyStatus, useShopifyStatus } from '@/hooks/useShopify';
import { disconnectShopify, updateShopifySettings } from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeShopifyTime } from '@/lib/shopify-utils';

function ShopifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 9a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1l-1 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 9z" fill="currentColor" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
      <div className="mx-auto max-w-xl">
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
              Connect once. Publish finished photos straight to your store as draft products.
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
        </motion.div>
      </div>

      <ShopifyConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}

/* ---------- sub-cards ---------- */

function DisconnectedCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
          <ShopifyIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Not connected</p>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-xs">
            No store linked yet. Connect your store and every export is one click away.
          </p>
        </div>
        <Button
          onClick={onConnect}
          className="h-11 gap-2 px-6 font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          <ShopifyIcon className="h-4 w-4" />
          Connect Shopify Store
        </Button>
      </div>
    </div>
  );
}

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
    <div className="rounded-2xl border border-[#008060]/30 bg-card overflow-hidden">
      {/* Green header band */}
      <div className="flex items-center gap-3 bg-[#008060] px-6 py-4">
        <ShopifyIcon className="h-5 w-5 text-white" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/90">Connected</span>
        <Check className="ml-auto h-4 w-4 text-white" />
      </div>

      {/* Store info */}
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">{status.shop_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{status.shop_domain}</p>
          <p className="text-xs text-muted-foreground">
            Last used: {formatRelativeShopifyTime(status.last_used_at)}
          </p>
        </div>

        {/* Auto-suggest toggle */}
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

        {/* Disconnect */}
        <Button
          type="button"
          variant="outline"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-destructive hover:border-destructive"
        >
          {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Disconnect store
        </Button>
      </div>
    </div>
  );
}

function ErrorCard({ onConnect, onRetry }: { onConnect: () => void; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
          <ShopifyIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Can't reach Shopify</p>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-xs">
            We couldn't check your connection status. You can retry or start the connect flow.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onRetry}
            className="h-10 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Retry
          </Button>
          <Button
            onClick={onConnect}
            className="h-10 gap-2 px-5 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            <ShopifyIcon className="h-4 w-4" />
            Connect Store
          </Button>
        </div>
      </div>
    </div>
  );
}
