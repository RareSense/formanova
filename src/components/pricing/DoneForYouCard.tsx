import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallConfigured, isRubyCallEnabled } from '@/lib/feature-flags';

const TALK_RETURN_PATH = '/pricing?talk=ruby';

interface DoneForYouCardProps {
  /** Opens the Ruby call window (owned by the page). */
  onOpenCall: () => void;
}

export function DoneForYouCard({ onOpenCall }: DoneForYouCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Signed-in: only allowlisted emails. Signed-out: email unknown, so show the
  // card only while the feature is configured; login decides who keeps it.
  if (user ? !enabled : !isRubyCallConfigured()) return null;

  const handleClick = () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(TALK_RETURN_PATH)}`);
      return;
    }
    onOpenCall();
  };

  return (
    <section
      aria-labelledby="done-for-you-title"
      className="mt-10 border border-border p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
    >
      <div>
        <p className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
          Custom
        </p>
        <h2
          id="done-for-you-title"
          className="font-display text-2xl md:text-3xl uppercase tracking-wide text-foreground leading-none"
        >
          Done For You
        </h2>
        <p className="mt-3 text-sm text-foreground">
          Bulk shoots, editorial, CAD to catalog, website refresh.
        </p>
        <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
          Get a deal built around you.
        </p>
      </div>
      <Button onClick={handleClick} className="md:shrink-0">
        Talk to Ruby
      </Button>
    </section>
  );
}
