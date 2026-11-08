// Owner, 2026-11-08: one plain, calm pop-up for paying users: our team can make your whole collection for you.
// "Talk to our AI" opens the Ruby call on /pricing (?talk=ruby), so the dashboard needs no call window of its own.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { trackDfyOffer } from '@/lib/posthog-events';
import { saveOfferChoice, type OfferMoment } from '@/lib/dfy-offer';

interface Props {
  userId: string;
  /** Where it was offered (dashboard, or after an image was made), for analytics. */
  moment: OfferMoment;
  open: boolean;
  onClose: () => void;
}

export function DoneForYouOfferModal({ userId, moment, open, onClose }: Props) {
  const navigate = useNavigate();
  const [declined, setDeclined] = useState(false);
  const chose = useRef(false);

  useEffect(() => {
    if (open) trackDfyOffer('shown', moment);
  }, [open, moment]);

  const close = () => {
    if (!chose.current) trackDfyOffer('closed', moment); // that moment is used; the other one may still come
    onClose();
  };

  const talk = () => {
    chose.current = true;
    saveOfferChoice(userId, 'talk');
    trackDfyOffer('talk_clicked', moment);
    onClose();
    navigate('/pricing?talk=ruby');
  };

  const noThanks = () => {
    chose.current = true;
    saveOfferChoice(userId, 'no');
    trackDfyOffer('declined', moment);
    setDeclined(true);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-[420px] border-2 border-[hsl(var(--formanova-hero-accent))] p-8 text-center">
        {declined ? (
          <>
            <DialogTitle className="sr-only">Done For You</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              Okay! It's always on the Pricing page.
            </DialogDescription>
            <button type="button" onClick={onClose} className="marta-button-filled mt-6 w-full">
              Close
            </button>
          </>
        ) : (
          <>
            <DialogTitle asChild>
              <h2 className="font-display text-3xl leading-tight">Let our team make your photos</h2>
            </DialogTitle>
            <DialogDescription className="mt-4 text-lg leading-relaxed text-muted-foreground">
              You made them yourself so far. We can make all of them for you.
            </DialogDescription>
            <button type="button" onClick={talk} className="marta-button-filled mt-8 w-full py-4 text-lg">
              Talk to our AI
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
