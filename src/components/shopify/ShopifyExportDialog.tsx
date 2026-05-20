import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { exportToShopify, suggestShopifyMetadata } from '@/services/shopify-api';

interface ShopifyExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetName: string;
  workflowId?: string | null;
  autoSuggest?: boolean;
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
          title: 'Draft product created in Shopify.',
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

  const handleGenerateSuggestions = () => {
    setSuggestError(null);
    suggestMutation.mutate();
  };

  const handleExport = () => {
    if (!title.trim()) return;
    exportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="font-display text-2xl uppercase tracking-wide">
            Export to Shopify
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Create a Shopify draft product from this asset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="shopify-title" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Title
            </label>
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
            <label htmlFor="shopify-description" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Description
            </label>
            {isSuggesting ? (
              <div className="min-h-[140px] animate-pulse rounded-md border border-input bg-muted/30" />
            ) : (
              <Textarea
                id="shopify-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[140px] text-sm"
              />
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="shopify-alt-text" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Alt text
            </label>
            {isSuggesting ? (
              <div className="min-h-[96px] animate-pulse rounded-md border border-input bg-muted/30" />
            ) : (
              <Textarea
                id="shopify-alt-text"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                className="min-h-[96px] text-sm"
              />
            )}
          </div>

          {suggestError && (
            <p className="text-sm text-muted-foreground">
              {suggestError}
            </p>
          )}

          {!autoSuggest && (
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateSuggestions}
              disabled={isSuggesting || isExporting}
              className="h-10 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              {isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI Generate suggestions
            </Button>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={handleExport}
              disabled={isSuggesting || isExporting || !title.trim()}
              className="h-11 flex-1 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Export to Shopify
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
              className="h-11 flex-1 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
