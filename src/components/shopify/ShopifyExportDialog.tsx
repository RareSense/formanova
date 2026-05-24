import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useShopifyStatus } from '@/hooks/useShopify';
import { exportToShopify, suggestShopifyMetadata } from '@/services/shopify-api';

interface ShopifyExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetName: string;
  workflowId?: string | null;
  autoSuggest?: boolean;
}

function ShopifyBagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-18 0 292 292" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46"/>
      <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E"/>
      <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF"/>
    </svg>
  );
}

export function ShopifyExportDialog({
  open,
  onOpenChange,
  assetId,
  assetName,
  workflowId,
  autoSuggest = false,
}: ShopifyExportDialogProps) {
  const { toast } = useToast();
  const { data: shopifyStatus } = useShopifyStatus();
  const shopName = shopifyStatus?.shop_name ?? shopifyStatus?.shop_domain ?? 'Shopify';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [altText, setAltText] = useState('');
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const didAutoSuggestRef = useRef(false);

  const resetDefaults = () => {
    setTitle(assetName || 'Untitled');
    setDescription('Photographed by Formanova.');
    setAltText('');
  };

  const suggestMutation = useMutation({
    mutationFn: async () => suggestShopifyMetadata(assetId, workflowId),
    onSuccess: (result) => {
      if (result.error === 'suggest_timeout') {
        resetDefaults();
        setSuggestError("Couldn't generate suggestions. You can fill these in manually or try again.");
        return;
      }

      setTitle(result.title);
      setDescription(result.description);
      setAltText(result.alt_text);
      setSuggestError(null);
    },
    onError: () => {
      resetDefaults();
      setSuggestError("Couldn't generate suggestions. You can fill these in manually or try again.");
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportToShopify({
      assetId,
      title: title.trim(),
      description: description.trim(),
      altText: altText.trim(),
    }),
    onSuccess: (result) => {
      onOpenChange(false);

      if (result.success && result.shopify_admin_url) {
        toast({
          title: `Draft product created in ${shopName}.`,
          action: (
            <ToastAction
              altText="Open in Shopify"
              onClick={() => window.open(result.shopify_admin_url, '_blank', 'noopener,noreferrer')}
            >
              Open in Shopify
            </ToastAction>
          ),
        });
        return;
      }

      const errorToMessage: Record<string, string> = {
        not_connected: 'Connect your Shopify store first.',
        reconnect_required: 'Your Shopify connection expired. Reconnect in Settings.',
        rate_limited: 'Shopify is busy. Try again in a moment.',
        shopify_error: 'Export failed. Try again.',
      };

      toast({
        title: errorToMessage[result.error ?? 'shopify_error'] ?? 'Export failed. Try again.',
        variant: result.error === 'not_connected' ? 'default' : 'destructive',
      });
    },
    onError: () => {
      onOpenChange(false);
      toast({
        title: 'Export failed. Try again.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!open) {
      didAutoSuggestRef.current = false;
      setSuggestError(null);
      suggestMutation.reset();
      exportMutation.reset();
      return;
    }

    resetDefaults();

    if (autoSuggest && !didAutoSuggestRef.current) {
      didAutoSuggestRef.current = true;
      suggestMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoSuggest, assetId, assetName, workflowId]);

  const isSuggesting = suggestMutation.isPending;
  const isExporting = exportMutation.isPending;

  const handleExport = () => {
    if (!title.trim()) return;
    exportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-foreground sm:max-w-md">
        <div className="flex flex-col items-center pt-2">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <ShopifyBagIcon className="h-12 w-12" />
            <DialogTitle className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
              Export to Shopify
            </DialogTitle>
          </div>

          <div className="w-full space-y-5">
            <div className="border border-border bg-muted/20 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Draft product
              </p>
              <DialogDescription className="mt-2 text-sm leading-6 text-foreground">
                This will create a draft product in {shopName}. Review it in Shopify before making it live.
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <label htmlFor="shopify-title" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
                Product title
              </label>
              <p className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
                Keep it short and recognizable.
              </p>
              {isSuggesting ? (
                <div className="h-11 animate-pulse rounded-md border border-input bg-muted/30" />
              ) : (
                <Input
                  id="shopify-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-11"
                />
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="shopify-description" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
                Description
              </label>
              <p className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
                Add the key details customers should see first.
              </p>
              {isSuggesting ? (
                <div className="min-h-[112px] animate-pulse rounded-md border border-input bg-muted/30" />
              ) : (
                <Textarea
                  id="shopify-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[112px] text-sm leading-6"
                />
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="shopify-alt-text" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
                Alt text
              </label>
              <p className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
                Describe what is visible in the image.
              </p>
              {isSuggesting ? (
                <div className="h-11 animate-pulse rounded-md border border-input bg-muted/30" />
              ) : (
                <Input
                  id="shopify-alt-text"
                  value={altText}
                  onChange={(event) => setAltText(event.target.value)}
                  className="h-11 text-sm"
                />
              )}
            </div>

            {suggestError && (
              <p className="font-mono text-[10px] tracking-[0.1em] text-destructive">
                {suggestError}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={handleExport}
                disabled={isSuggesting || isExporting || !title.trim()}
                className="h-11 w-full gap-2.5 px-3 font-mono text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em]"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <ShopifyBagIcon className="h-4 w-4 shrink-0" />}
                <span className="hidden whitespace-nowrap sm:inline">Export to Shopify</span>
                <span className="whitespace-nowrap sm:hidden">Export</span>
                {!isExporting && <ArrowRight className="h-4 w-4 shrink-0" />}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isExporting}
                className="h-11 w-full font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
