import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallEnabled } from '@/lib/feature-flags';
import { useDoneForYouVisible } from '@/hooks/use-done-for-you-visible';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

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

  // Same box, rows and button size as the plan cards it sits beside, but
  // filled in the foreground colour so it reads as the standout option.
  return (
    <section
      aria-labelledby="done-for-you-title"
      className="flex flex-col p-6 xl:p-8 border-2 border-foreground bg-foreground text-background"
    >
      <div className="flex h-7 items-center gap-2">
        <Camera className="h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
        <h2
          id="done-for-you-title"
          className="font-mono text-xs tracking-[0.25em] uppercase text-[hsl(var(--formanova-hero-accent))]"
        >
          Done For You
        </h2>
      </div>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="font-display text-5xl uppercase tracking-tight">Custom</span>
        <span className="font-mono text-xs tracking-wider uppercase text-background/60">Quote</span>
      </div>

      <div className="mt-6 border-t border-background/20 pt-6">
        <p className="font-mono text-2xl">Your whole catalog</p>
        <p className="mt-2 font-mono text-sm leading-relaxed text-background/70">
          We create it for you, in bulk.
          <br />
          Looks like a real studio shoot.
        </p>
      </div>

      <div className="mt-auto pt-8">
        <Button
          onClick={handleClick}
          size="lg"
          className="w-full px-4 font-mono text-xs tracking-[0.2em] uppercase bg-background text-foreground hover:bg-background/90"
        >
          <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
          Talk to Ruby
        </Button>
      </div>
    </section>
  );
}
