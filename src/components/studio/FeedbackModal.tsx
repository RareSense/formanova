import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';
import creditCoinIcon from '@/assets/icons/credit-coin.png';
import { submitFeedback, type FeedbackCategory } from '@/lib/feedback-api';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { azureUriToUrl } from '@/lib/azure-utils';
import { trackFeedbackSubmitted } from '@/lib/posthog-events';

// ─── Profanity filter ─────────────────────────────────────────────────────────
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

// ─── Thumbnail ────────────────────────────────────────────────────────────────
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  workflowId: string | null;
  jewelryImageUrl: string | null;   // Azure/API URL — used in the feedback payload
  jewelryDisplayUrl: string | null; // Local data/blob URL — used for the thumbnail
  modelImageUrl: string | null;
  resultImageUrl: string | null;
  category: FeedbackCategory;
  userEmail?: string | null;
  humanFixCost?: number | null;
}

export function FeedbackModal({
  open,
  onClose,
  workflowId,
  jewelryImageUrl,
  jewelryDisplayUrl,
  modelImageUrl,
  resultImageUrl,
  category,
  userEmail,
  humanFixCost,
}: Props) {
  const [text, setText] = useState('');
  const [profanityError, setProfanityError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedReferenceUrl = modelImageUrl ? (azureUriToUrl(modelImageUrl) || modelImageUrl) : null;

  const handleClose = () => {
    if (submitting) return;
    setText('');
    setProfanityError(false);
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const handleChange = (v: string) => {
    setText(v);
    if (profanityError && !hasProfanity(v)) setProfanityError(false);
  };

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    if (hasProfanity(text)) {
      setProfanityError(true);
      return;
    }
    if (!workflowId || !resultImageUrl) {
      setError('Generation data is missing — please try refreshing and submitting again.');
      return;
    }

    const inputUrls: string[] = [];
    if (jewelryImageUrl) inputUrls.push(jewelryImageUrl);
    if (normalizedReferenceUrl) inputUrls.push(normalizedReferenceUrl);

    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        workflow_id: workflowId,
        generation_type: 'photoshoot',
        input_image_urls: inputUrls,
        output_image_url: resultImageUrl,
        complaint: text.trim(),
        category,
      });
      trackFeedbackSubmitted({
        category,
        generation_type: 'photoshoot',
        complaint_length: text.trim().length,
        workflow_id: workflowId,
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasImages = jewelryDisplayUrl || modelImageUrl || resultImageUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md w-full shadow-none">
        {submitted ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle2 className="h-9 w-9 text-formanova-success" />
            <div className="space-y-1">
              <DialogTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
                Request received
              </DialogTitle>
              <DialogDescription className="text-sm text-justify leading-relaxed text-muted-foreground">
                Our creative team is working on fixing your result. You'll receive the result in your email within 24 hours.
                Please check {userEmail ?? 'your email'} soon. Delays might happen, up to a maximum of 48 hours.
              </DialogDescription>
            </div>
            <Button className="mt-1 w-full sm:w-auto sm:min-w-[140px]" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          /* ── Feedback form ── */
          <div className="space-y-5">
            {/* Header */}
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                Report an issue
              </p>
              <DialogTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
                What went wrong?
              </DialogTitle>
            </div>

            {/* Images */}
            {hasImages && (
              <div className="flex gap-3">
                <Thumbnail url={jewelryDisplayUrl} label="Jewelry input" />
                <Thumbnail url={normalizedReferenceUrl} label="Reference input" />
                <Thumbnail url={resultImageUrl} label="Result" />
              </div>
            )}

            {/* Text input */}
            <div className="space-y-1.5">
              <Textarea
                placeholder="What problem do you see in the result?"
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                rows={4}
                className="resize-none"
              />
              {profanityError && (
                <p className="text-xs text-destructive">
                  Please keep your feedback constructive — we can't act on abusive language.
                </p>
              )}
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              disabled={!text.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request Fix
              {humanFixCost != null && (
                <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
                  <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {humanFixCost}
                </span>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
