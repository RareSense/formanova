import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallEnabled } from '@/lib/feature-flags';
import { useDoneForYouVisible } from '@/hooks/use-done-for-you-visible';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

/** Said first, so nobody has to guess what Done For You is. */
export const DEFINITION =
  'We create the images for you. Tell us what you need on a quick call and get your price, for any order size.';

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

  // Its own panel above the plans, not a fifth card after them: in that row it read as a tier above the
  // biggest plan, while it suits any order size. The gold border and tint are FormaNova's accent.
  return (
    <section
      aria-labelledby="done-for-you-title"
      className="grid gap-6 border-2 border-[hsl(var(--formanova-hero-accent))] bg-gradient-to-b from-[hsl(var(--formanova-hero-accent))]/15 to-[hsl(var(--formanova-hero-accent))]/5 p-6 shadow-[6px_6px_0_hsl(var(--formanova-hero-accent))] md:grid-cols-[minmax(0,1fr)_16rem] md:items-center md:gap-10 xl:p-8"
    >
      <div className="min-w-0">
        <h2
          id="done-for-you-title"
          className="font-display text-4xl uppercase leading-none tracking-tight text-foreground"
        >
          Done For You
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground">
          {DEFINITION}
        </p>
        <ul className="mt-5 grid gap-x-6 gap-y-2 font-mono text-sm leading-snug text-muted-foreground sm:grid-cols-2">
          {SELLING_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleClick}
          size="lg"
          className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 font-mono text-xs uppercase leading-tight tracking-[0.2em]"
        >
          <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
          Get my price now
        </Button>
        <p className="text-center text-sm text-muted-foreground">A quick call with our AI sales agent</p>
      </div>
    </section>
  );
}

/** Heads the credit plans when Done For You is shown above them, so the page reads as two choices. */
export function DoItYourselfHeading() {
  return (
    <div className="mb-6 mt-12">
      <h2 className="font-display text-3xl uppercase leading-none tracking-tight text-foreground">Do It Yourself</h2>
      <p className="mt-2 text-base text-muted-foreground">Buy credits and create the images yourself in Photo Studio and CAD Studio.</p>
    </div>
  );
}
