import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
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
  /** High Effort: the jewelry angles used (cover first). Overrides the single thumbnail. */
  jewelryDisplayUrls?: string[];
  /** High Effort: the model (model shot) or inspiration (product shot) reference used. */
  referenceUrl?: string | null;
  referenceLabel?: string;
  resultImageUrl: string | null;
  isProductShot: boolean;
  generationCost?: number | null;
}

export function AIFixModal({
  open,
  onClose,
  onConfirm,
  jewelryDisplayUrl,
  jewelryDisplayUrls,
  referenceUrl,
  referenceLabel,
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

  // Reference thumbnails shown above the prompt. High Effort surfaces every input the
  // fix uses: each jewelry angle, then the model/inspiration reference, then the result.
  const angles = (jewelryDisplayUrls && jewelryDisplayUrls.length)
    ? jewelryDisplayUrls
    : (jewelryDisplayUrl ? [jewelryDisplayUrl] : []);
  const refItems: { url: string | null; label: string }[] = [];
  angles.forEach((u, i) => refItems.push({ url: u, label: angles.length > 1 ? `Jewelry ${i + 1}` : 'Your jewelry' }));
  if (referenceUrl) refItems.push({ url: referenceUrl, label: referenceLabel ?? (isProductShot ? 'Inspiration' : 'Model') });
  if (resultImageUrl) refItems.push({ url: resultImageUrl, label: resultLabel });
  const hasImages = refItems.length > 0;

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
              What's wrong and what do you want instead?
            </DialogDescription>
          </div>

          {/* Thumbnails - up to 3 per row so an angle set + reference + result stay uncramped */}
          {hasImages && (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(refItems.length, 3)}, minmax(0, 1fr))` }}
            >
              {refItems.map((r, i) => (
                <Thumbnail key={`${r.label}-${i}`} url={r.url} label={r.label} />
              ))}
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
            Fix it with AI
            <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
              <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {generationCost ?? 10}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
