// Owner, 2026-11-08: one plain, calm pop-up for paying users: our team can make your whole collection for you.
// "Get my price" opens the Ruby call on /pricing (?talk=ruby), so the dashboard needs no call window of its own.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { trackDfyOffer } from '@/lib/posthog-events';
import { saveOfferChoice } from '@/lib/dfy-offer';

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
}

export function DoneForYouOfferModal({ userId, open, onClose }: Props) {
  const navigate = useNavigate();
  const [declined, setDeclined] = useState(false);
  const chose = useRef(false);

  useEffect(() => {
    if (open) trackDfyOffer('shown');
  }, [open]);

  const close = () => {
    if (!chose.current) {
      saveOfferChoice(userId, 'closed');
      trackDfyOffer('closed');
    }
    onClose();
  };

  const talk = () => {
    chose.current = true;
    saveOfferChoice(userId, 'talk');
    trackDfyOffer('talk_clicked');
    onClose();
    navigate('/pricing?talk=ruby');
  };

  const noThanks = () => {
    chose.current = true;
    saveOfferChoice(userId, 'no');
    trackDfyOffer('declined');
    setDeclined(true);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-[420px] border-2 border-[hsl(var(--formanova-hero-accent))] p-8 text-center">
        {declined ? (
          <>
            <DialogTitle className="sr-only">Done For You</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              No problem. You can find this any time on the Pricing page.
            </DialogDescription>
            <button type="button" onClick={onClose} className="marta-button-filled mt-6 w-full">
              Close
            </button>
          </>
        ) : (
          <>
            <DialogTitle asChild>
              <h2 className="font-display text-3xl leading-tight">Want us to make your photos for you?</h2>
            </DialogTitle>
            <DialogDescription className="mt-4 text-base leading-relaxed text-muted-foreground">
              Until now you have made your photoshoots yourself. Our creative team can make your whole collection for
              you. Get your price now in a 2-minute call with Ruby, our AI.
            </DialogDescription>
            <button
              type="button"
              onClick={talk}
              className="mt-8 w-full bg-[hsl(var(--formanova-hero-accent))] py-4 text-lg font-medium text-black"
            >
              Get my price
            </button>
            <button type="button" onClick={noThanks} className="mt-4 text-sm text-muted-foreground underline">
              No thanks
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
