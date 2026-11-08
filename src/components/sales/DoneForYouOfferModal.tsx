// Owner, 2026-11-08: one plain, calm pop-up for paying users: our team can make your whole collection for you.
// "Talk to our AI" opens the Ruby call on /pricing (?talk=ruby), so the dashboard needs no call window of its own.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
    if (!chose.current) trackDfyOffer('closed', moment); // on the dashboard it comes back next visit; after an image it was the one chance
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
      <DialogContent
        // No focus ring on the button when it opens (owner, 2026-11-08); Tab still shows it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-[420px] border-2 border-[hsl(var(--formanova-hero-accent))] p-8 text-center">
        {declined ? (
          <>
            <DialogTitle className="sr-only">Done For You</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              Okay! It's always on the Pricing page.
            </DialogDescription>
            <Button onClick={onClose} className="mt-6 w-full">
              Close
            </Button>
          </>
        ) : (
          <>
            <DialogTitle asChild>
              <h2 className="font-display text-3xl leading-tight tracking-wide sm:text-4xl">Let FormaNova creatives make your photos</h2>
            </DialogTitle>
            <DialogDescription className="mt-3 text-base text-muted-foreground">
              You made them one by one. We can make them in bulk.
            </DialogDescription>
            {/* The site's own primary button (theme aware), with the call icon the Done For You card uses. */}
            <Button onClick={talk} size="lg" className="mt-8 w-full">
              <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
              Talk to our AI
            </Button>
            <button type="button" onClick={noThanks} className="mt-4 text-sm text-muted-foreground underline">
              No thanks
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
