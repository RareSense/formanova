import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardKicker } from '@/components/pricing/CardKicker';
import { trackRubyCtaClicked } from '@/lib/posthog-events';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallEnabled } from '@/lib/feature-flags';
import { useDoneForYouVisible } from '@/hooks/use-done-for-you-visible';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

/** Owner, 2026-11-06: anyone must see the call is with an AI, not a person. "Our AI", not "sales agent": lay people read
 *  "sales agent" as a person making a pitch. */
export const AI_LINE = 'Get your custom price from our AI, not a person, on a 2-minute call. No booking, no prep.';


const SELLING_POINTS = [
  'Bulk product, model & editorial shots',
  'Photos from your CAD files',
  'Website & catalog refresh',
] as const;

interface DoneForYouCardProps {
  /** Opens the Ruby call window (owned by the page). */
  onOpenCall: () => void;
}

export function DoneForYouCard({ onOpenCall }: DoneForYouCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const visible = useDoneForYouVisible();
  const enabled = isRubyCallEnabled(user?.email);
  const autoOpened = useRef(false);

  // Returning from login with ?talk=ruby: open the call window once.
  useEffect(() => {
    if (!enabled || !user || autoOpened.current) return;
    if (searchParams.get('talk') !== 'ruby') return;
    autoOpened.current = true;
    onOpenCall();
    const next = new URLSearchParams(searchParams);
    next.delete('talk');
    setSearchParams(next, { replace: true });
  }, [enabled, user, searchParams, setSearchParams, onOpenCall]);

  if (!visible) return null;

  const handleClick = () => {
    trackRubyCtaClicked({ signed_in: !!user });
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(TALK_RETURN_PATH)}`);
      return;
    }
    onOpenCall();
  };

  // First in the row, laid out like a plan card: kicker, name slot ("Custom"), then "Done for you" where the price
  // sits, so the dividers and buttons line up. Gold border, soft gradient, hard offset shadow, sharp corners.
  return (
    <section
      aria-labelledby="done-for-you-title"
      className="flex h-full flex-col border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 p-6 shadow-[4px_4px_0_hsl(var(--formanova-hero-accent)/0.6)] xl:p-8"
    >
      <CardKicker gold>We do it for you</CardKicker>
      <div className="flex h-7 items-center">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Custom</span>
      </div>

      {/* Same height as a plan's price (text-5xl, one line). */}
      <div className="mt-6 flex h-12 items-end">
        <h2
          id="done-for-you-title"
          className="whitespace-nowrap font-display text-4xl uppercase leading-none tracking-tight text-foreground xl:text-3xl 2xl:text-4xl"
        >
          Done for you
        </h2>
      </div>

      <div className="mt-6 border-t border-border/40 pt-6">
        <p className="text-sm leading-relaxed text-foreground">{AI_LINE}</p>
        <ul className="mt-4 space-y-2 font-mono text-xs leading-snug text-muted-foreground">
          {SELLING_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-8">
        <Button
          onClick={handleClick}
          size="lg"
          className="h-auto min-h-11 w-full whitespace-normal px-3 py-2.5 font-mono text-xs uppercase leading-tight tracking-[0.2em] xl:px-2 xl:text-[11px] xl:tracking-[0.06em]"
        >
          <Phone className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          Get my price
        </Button>
      </div>
    </section>
  );
}
