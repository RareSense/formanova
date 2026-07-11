import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThemeLogo } from '@/components/ThemeLogo';

export interface BrandCardProps {
  brandName: string;
  websiteUrl: string;
  basedIn: string;
  targetMarkets: string[];
  className?: string;
}

function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

/** Shared card face frame: border, background, subtle blueprint grid. */
function CardFace({ back, children }: { back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col border border-border bg-card p-5 sm:p-6 [backface-visibility:hidden]',
        back && '[transform:rotateY(180deg)]',
      )}
      style={{
        backgroundImage:
          'linear-gradient(hsl(var(--border) / 0.35) 1px, transparent 1px),' +
          'linear-gradient(90deg, hsl(var(--border) / 0.35) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
      }}
    >
      {children}
    </div>
  );
}

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
      {children}
    </p>
  );
}

const BACK_BENEFITS = [
  'Photoshoots shaped around your brand, not a template.',
  'Models, sets and moods matched to your identity.',
  'Strictly confidential. Never sold, never used to train AI. Used solely to shape FormaNova around your brand.',
];

/**
 * Premium flippable brand card that fills live as the user types.
 * Front: FormaNova wordmark, brand name, presence details.
 * Back: the FormaNova Bespoke promise. Click / Enter flips it.
 */
export function BrandCard({ brandName, websiteUrl, basedIn, targetMarkets, className }: BrandCardProps) {
  const [flipped, setFlipped] = useState(false);

  const name = brandName.trim();
  const site = displayUrl(websiteUrl.trim());
  const markets = targetMarkets.filter(Boolean);
  const initial = (name || 'F').charAt(0).toUpperCase();

  return (
    <div className={cn('w-full select-none [perspective:1400px]', className)}>
      {/* Drift and flip live on separate elements so their transforms compose. */}
      <div className="brand-card-tilt [transform-style:preserve-3d]">
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Show card front' : 'Show card back'}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        className="relative aspect-[7/4] w-full outline-none transition-transform duration-700 ease-out [transform-style:preserve-3d] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{
          transform: flipped ? 'rotateY(180deg)' : undefined,
          boxShadow: '0 18px 40px -18px hsl(var(--foreground) / 0.35)',
        }}
      >
        {/* Front */}
        <CardFace>
          {/* Watermark initial */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 font-display text-[7rem] leading-none text-foreground/[0.05] sm:text-[9rem]"
          >
            {initial}
          </span>

          {/* Top row */}
          <div className="flex items-start justify-between">
            <ThemeLogo variant="plain" className="h-4 sm:h-5" width={100} height={24} />
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground">
              Bespoke / 01
            </p>
          </div>

          {/* Identity block */}
          <div className="mt-auto min-w-0">
            <MonoLabel>Jewelry Brand Experience</MonoLabel>
            <p
              className={cn(
                'mt-1 truncate font-script text-4xl leading-[1.15] sm:text-5xl',
                name ? 'text-foreground' : 'text-muted-foreground/50',
              )}
            >
              {name || 'Your Brand'}
            </p>
            <p
              className={cn(
                'mt-1 truncate font-mono text-[10px] uppercase tracking-[0.2em]',
                site ? 'text-foreground' : 'text-muted-foreground/60',
              )}
            >
              {site || 'yourbrand.com'}
            </p>
          </div>

          {/* Bottom row */}
          <div className="mt-5 flex items-end justify-between gap-4 border-t border-border pt-3">
            <div className="flex min-w-0 gap-8">
              <div className="min-w-0">
                <MonoLabel>Based in</MonoLabel>
                <p className={cn(
                  'mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.12em]',
                  basedIn.trim() ? 'text-foreground' : 'text-muted-foreground/60',
                )}>
                  {basedIn.trim() || 'Not set'}
                </p>
              </div>
              <div className="min-w-0">
                <MonoLabel>Target</MonoLabel>
                <p className={cn(
                  'mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.12em]',
                  markets.length ? 'text-foreground' : 'text-muted-foreground/60',
                )}>
                  {markets.length ? markets.join(' / ') : 'Global'}
                </p>
              </div>
            </div>
            <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              FN / {new Date().getFullYear()}
            </p>
          </div>
        </CardFace>

        {/* Back */}
        <CardFace back>
          <div className="flex items-start justify-between">
            <ThemeLogo variant="plain" className="h-4 sm:h-5" width={100} height={24} />
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground">
              Bespoke
            </p>
          </div>

          <div className="mt-auto">
            <p className="font-script text-3xl leading-[1.15] text-foreground sm:text-4xl">
              The Bespoke Experience
            </p>
            <ul className="mt-4 space-y-2.5">
              {BACK_BENEFITS.map((line) => (
                <li key={line} className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="h-px w-4 shrink-0 translate-y-[-3px] bg-foreground" />
                  <span className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex items-end justify-between border-t border-border pt-3">
            <MonoLabel>formanova.ai</MonoLabel>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              FN / {new Date().getFullYear()}
            </p>
          </div>
        </CardFace>
      </div>
      </div>

      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
        Tap card to flip
      </p>
    </div>
  );
}
