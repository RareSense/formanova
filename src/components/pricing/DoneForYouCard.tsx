import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallEnabled } from '@/lib/feature-flags';
import { useDoneForYouVisible } from '@/hooks/use-done-for-you-visible';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

const SELLING_POINTS = [
  'Bulk product, model & editorial shots',
  'Catalog photos straight from your CAD',
  'Website & catalog refresh',
  'Your price on the call, built for your volume',
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

  // Same box, rows and button size as the plan cards it sits beside. Gold
  // border and tint (FormaNova's accent) set it apart without leaving the palette.
  return (
    <section
      aria-labelledby="done-for-you-title"
      className="relative flex flex-col p-6 xl:p-8 border-2 border-[hsl(var(--formanova-hero-accent))] bg-gradient-to-b from-[hsl(var(--formanova-hero-accent))]/15 to-[hsl(var(--formanova-hero-accent))]/5 shadow-[6px_6px_0_hsl(var(--formanova-hero-accent))]"
    >
      <div className="flex h-7 items-center justify-between gap-2">
        <h2
          id="done-for-you-title"
          className="font-mono text-xs tracking-[0.25em] uppercase font-bold text-[hsl(var(--formanova-hero-accent))]"
        >
          Done For You
        </h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-foreground">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--formanova-success))] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--formanova-success))]" />
          </span>
          Live now
        </span>
      </div>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="font-display text-5xl uppercase tracking-tight text-foreground">Custom</span>
        <span className="font-mono text-xs tracking-wider uppercase text-muted-foreground">Package</span>
      </div>

      <div className="mt-6 border-t border-[hsl(var(--formanova-hero-accent))]/30 pt-6">
        <p className="font-mono text-2xl text-foreground">Your whole catalog</p>
        <ul className="mt-3 space-y-2 font-mono text-sm leading-snug text-muted-foreground">
          {SELLING_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-8">
        <Button
          onClick={handleClick}
          size="lg"
          className="w-full px-4 font-mono text-xs tracking-[0.2em] uppercase"
        >
          <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
          Get my price now
        </Button>
        <p className="mt-2 text-center font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
          Instant voice call with Ruby, our AI sales advisor.
          <br />
          In your browser · no booking · any language
        </p>
      </div>
    </section>
  );
}
