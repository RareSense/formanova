import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

const BLOCKED_WORDS = [
  'fuck', 'shit', 'cunt', 'bitch', 'asshole', 'bastard',
  'dick', 'cock', 'pussy', 'whore', 'slut', 'nigger', 'faggot',
  'suck my', 'motherfuck',
];

const BLOCKED_RE = new RegExp(
  BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

function hasProfanity(text: string): boolean {
  return BLOCKED_RE.test(text);
}

function Thumbnail({ url, label }: { url: string | null; label: string }) {
  const resolved = useAuthenticatedImage(url);
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <div className="w-full aspect-square border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
        {resolved ? (
          <img src={resolved} alt={label} className="w-full h-full object-contain" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
        )}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (prompt: string) => void;
  jewelryDisplayUrl: string | null;
  resultImageUrl: string | null;
  isProductShot: boolean;
  generationCost?: number | null;
}

export function AIFixModal({
  open,
  onClose,
  onConfirm,
  jewelryDisplayUrl,
  resultImageUrl,
  isProductShot,
  generationCost,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [profanityError, setProfanityError] = useState(false);

  const handleClose = () => {
    setPrompt('');
    setProfanityError(false);
    onClose();
  };

  const handleChange = (v: string) => {
    setPrompt(v);
    if (profanityError && !hasProfanity(v)) setProfanityError(false);
  };

  const handleConfirm = () => {
    if (!prompt.trim()) return;
    if (hasProfanity(prompt)) {
      setProfanityError(true);
      return;
    }
    onConfirm(prompt.trim());
    handleClose();
  };

  const resultLabel = isProductShot ? 'Product shot' : 'Model shot';
  const hasImages = jewelryDisplayUrl || resultImageUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md w-full shadow-none">
        <div className="space-y-5">
          {/* Header */}
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
              Tell AI what to fix
            </p>
            <DialogTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
              What should change?
            </DialogTitle>
            <DialogDescription className="text-sm text-justify leading-relaxed text-muted-foreground mt-1">
              Tell us what's wrong and we'll fix it.
            </DialogDescription>
          </div>

          {/* Thumbnails */}
          {hasImages && (
            <div className="flex gap-3">
              <Thumbnail url={jewelryDisplayUrl} label="Your jewelry" />
              <Thumbnail url={resultImageUrl} label={resultLabel} />
            </div>
          )}

          {/* Prompt input */}
          <div className="space-y-1.5">
            <Textarea
              placeholder="e.g. The ring looks blurry, make the stone more vivid..."
              value={prompt}
              onChange={(e) => handleChange(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {profanityError && (
              <p className="text-xs text-destructive">
                Please keep your feedback constructive — we can't act on abusive language.
              </p>
            )}
          </div>

          {/* CTA */}
          <Button
            className="w-full gap-2"
            disabled={!prompt.trim()}
            onClick={handleConfirm}
          >
            <RefreshCw className="h-4 w-4" />
            Fix with AI
            <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
              <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {generationCost ?? 10}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
