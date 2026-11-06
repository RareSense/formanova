import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallEnabled } from '@/lib/feature-flags';
import { useDoneForYouVisible } from '@/hooks/use-done-for-you-visible';
import { RubyOrb } from '@/components/sales/RubyOrb';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

/** Said first, so nobody has to guess what Done For You is. */
export const DEFINITION = 'We create the images for you.';
/** Owner, 2026-11-06: even someone who is not tech savvy must see the call is with an AI: instant, no person, no prep. */
export const AI_LINE = 'Not a person: an AI that answers right away. No booking, no waiting, no prep. Your custom price in about 2 minutes.';


const SELLING_POINTS = [
  'Bulk product, model & editorial shots',
  'Catalog photos straight from your CAD',
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
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(TALK_RETURN_PATH)}`);
      return;
    }
    onOpenCall();
  };

  // The "We do it for you" path, first in the row (2026-11-05). Same size and button as the plans, set apart subtly
  // like the earlier panel: gold border, soft gold wash and a small gold offset shadow (the shadow takes no layout space).
  return (
    <section
      aria-labelledby="done-for-you-title"
      className="flex h-full flex-col border-2 border-[hsl(var(--formanova-hero-accent))] bg-gradient-to-b from-[hsl(var(--formanova-hero-accent))]/12 to-[hsl(var(--formanova-hero-accent))]/5 p-6 shadow-[4px_4px_0_hsl(var(--formanova-hero-accent)/0.6)] xl:p-8"
    >
      <div className="flex h-7 items-center">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-[hsl(var(--formanova-hero-accent))]">AI sales agent · instant</span>
      </div>

      <div className="mt-6 flex h-12 items-end">
        <h2 id="done-for-you-title" className="font-display text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
          Done For You
        </h2>
      </div>

      <div className="mt-6 border-t border-border/40 pt-6">
        <p className="text-sm leading-relaxed text-foreground">{DEFINITION}</p>
        <div className="mt-4 flex items-center gap-3">
          {/* Ruby's own orb, gently moving: it reads as an assistant, not a person. */}
          <RubyOrb level={0.25} className="h-12 w-12 shrink-0" />
          <p className="text-sm font-semibold leading-snug text-foreground">Talk to Ruby, our AI sales agent</p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{AI_LINE}</p>
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
          <Phone className="mr-2 h-4 w-4 xl:hidden" aria-hidden="true" />
          Talk to Ruby now
        </Button>
        <p className="mt-2 text-center font-mono text-[10px] tracking-wide text-muted-foreground">Ruby is an AI · any language · calls are recorded</p>
      </div>
    </section>
  );
}
