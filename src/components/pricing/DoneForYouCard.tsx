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
      <div className="flex h-7 items-center">
        <span className="font-mono text-xs tracking-[0.25em] uppercase font-bold text-[hsl(var(--formanova-hero-accent))]">
          Custom
        </span>
      </div>

      {/* Fixed line box at the price row's height, so the divider lines up with the plan cards. */}
      <div className="mt-6 flex h-12 items-end">
        <h2
          id="done-for-you-title"
          className="whitespace-nowrap font-display text-4xl uppercase leading-none tracking-tight text-foreground"
        >
          Done For You
        </h2>
      </div>

      <div className="mt-6 border-t border-[hsl(var(--formanova-hero-accent))]/30 pt-6">
        <ul className="space-y-2 font-mono text-sm leading-snug text-muted-foreground">
          {SELLING_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
          Get your custom plan and a great deal for your campaign or bulk order. Instant AI call with Ruby.
        </p>
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
      </div>
    </section>
  );
}
