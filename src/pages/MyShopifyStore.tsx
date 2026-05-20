import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Store, Unplug } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ShopifyConnectDialog } from '@/components/shopify/ShopifyConnectDialog';
import { useInvalidateShopifyStatus, useShopifyStatus } from '@/hooks/useShopify';
import { disconnectShopify, updateShopifySettings } from '@/services/shopify-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeShopifyTime } from '@/lib/shopify-utils';

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
      toast({
        title: 'Shopify disconnected',
        description: 'Your store has been disconnected from FormaNova.',
      });
    },
    onError: () => {
      toast({
        title: 'Disconnect failed',
        description: 'We could not disconnect your Shopify store. Please try again.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Could not update Shopify settings.',
        variant: 'destructive',
      });
    },
  });

  const autoSuggestValue = optimisticAutoSuggest ?? status?.auto_suggest ?? false;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background px-6 py-8 md:px-12 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <div>
            <Link
              to="/dashboard"
              className="mb-3 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <h1 className="font-display text-4xl uppercase tracking-tight text-foreground">
              My Shopify Store
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Manage the Shopify connection used by your publish flow in the studio and generation history.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            {isLoading ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Shopify connection status...
              </div>
            ) : isError ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">
                  We could not load your Shopify connection right now.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invalidateStatus()}
                  className="h-10 font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  Retry
                </Button>
              </div>
            ) : status?.connected ? (
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
                    <Store className="h-6 w-6 text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Shopify
                      </p>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                        Connected
                      </span>
                    </div>
                    <p className="text-base text-foreground">{status.shop_name}</p>
                    <p className="text-sm text-muted-foreground">{status.shop_domain}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Last used: {formatRelativeShopifyTime(status.last_used_at)}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-4">
                  <input
                    type="checkbox"
                    checked={autoSuggestValue}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setOptimisticAutoSuggest(next);
                      settingsMutation.mutate(next);
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-foreground">Always generate AI suggestions</span>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="h-11 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Disconnect store
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
                    <Store className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Shopify
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Publish your images directly to your Shopify store as draft products.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="h-11 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  <Store className="h-4 w-4" />
                  Connect Shopify
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <ShopifyConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
