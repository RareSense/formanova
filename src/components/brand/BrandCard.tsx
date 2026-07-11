import { useState } from 'react';
import { Check, Globe, ShoppingBag, MapPin, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { socialIconFor, extractHandle } from '@/components/brand/social-icons';
import wordmark from '@/assets/formanova-logo-black.webp';
import pendant from '@/assets/brand-card-pendant.webp';

export interface BrandCardProps {
  brandName: string;
  websiteUrl: string;
  storeUrl?: string;
  basedIn: string;
  targetMarkets: string[];
  /** Rendered as clickable platform icons with @handles (never raw links). */
  socialLinks?: string[];
  /** Controlled flip state; leave undefined for tap-to-flip. */
  flipped?: boolean;
  onFlippedChange?: (flipped: boolean) => void;
  /** Caption under the card; null hides it. */
  caption?: string | null;
  className?: string;
}

/*
 * The card is a fixed ivory keepsake, deliberately NOT theme-tokened so it
 * looks identical across all 12 app themes.
 */
const INK = '#1B1710';
const ACCENT = '#7A2233';
const EMBOSS = '#EAE2D0';
const LINE = '#E0D8C5';

function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

function handleLabel(link: string): string {
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    return `@${extractHandle(link, host)}`;
  } catch {
    return displayUrl(link);
  }
}

function Sparkle({ className }: { className?: string }) {
  return <span aria-hidden="true" className={className} style={{ color: ACCENT }}>&#10022;</span>;
}

function SparkleRule() {
  return (
    <div className="flex items-center gap-2">
      <Sparkle className="text-[10px]" />
      <span className="h-px w-8" style={{ backgroundColor: ACCENT }} />
    </div>
  );
}

function CardFace({ back, children }: { back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col overflow-hidden rounded-2xl border p-5 sm:p-7 [backface-visibility:hidden]',
        back && '[transform:rotateY(180deg)]',
      )}
      style={{ backgroundColor: '#F6F1E6', borderColor: LINE, color: INK }}
    >
      {children}
    </div>
  );
}

const BACK_BENEFITS = [
  'Your brand details remembered',
  'Every generation shaped to your aesthetic',
  'Collections stay consistent across every shoot',
];

interface DetailRowProps {
  Icon: React.ComponentType<{ className?: string }>;
  value: string;
  href?: string;
}

function DetailRow({ Icon, value, href }: DetailRowProps) {
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="h-4 w-px shrink-0" style={{ backgroundColor: LINE }} />
      <span className="min-w-0 truncate text-[11px] sm:text-xs">{value}</span>
    </>
  );
  const rowClass = 'flex min-w-0 items-center gap-2 border-b pb-1.5';
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(rowClass, 'hover:opacity-60 transition-opacity')}
        style={{ borderColor: LINE, color: INK }}
      >
        {content}
      </a>
    );
  }
  return (
    <div className={rowClass} style={{ borderColor: LINE, color: INK }}>
      {content}
    </div>
  );
}

/**
 * Premium flippable bespoke brand card that fills live as the user types.
 * Front: wordmark, serif brand name, pendant over an embossed initial.
 * Back: the FormaNova experience promise plus the brand's details.
 */
export function BrandCard({
  brandName,
  websiteUrl,
  storeUrl = '',
  basedIn,
  targetMarkets,
  socialLinks = [],
  flipped,
  onFlippedChange,
  caption = 'Tap card to flip',
  className,
}: BrandCardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = flipped ?? internalFlipped;
  const toggle = () => {
    setInternalFlipped(!isFlipped);
    onFlippedChange?.(!isFlipped);
  };

  const name = brandName.trim();
  const site = displayUrl(websiteUrl.trim());
  const store = displayUrl(storeUrl.trim());
  const markets = targetMarkets.filter(Boolean);
  const links = socialLinks.filter(Boolean);

  return (
    <div className={cn('w-full select-none [perspective:1400px]', className)}>
      {/* Drift and flip live on separate elements so their transforms compose. */}
      <div className="brand-card-tilt [transform-style:preserve-3d]">
      <div
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? 'Show card front' : 'Show card back'}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className="relative aspect-[3/2] w-full outline-none transition-transform duration-700 ease-out [transform-style:preserve-3d] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : undefined,
          boxShadow: '0 18px 40px -18px rgba(27, 23, 16, 0.45)',
        }}
      >
        {/* Front */}
        <CardFace>
          {/* Embossed initial behind the pendant */}
          {name && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-[17%] top-1/2 -translate-y-1/2 font-card text-[9rem] leading-none sm:text-[11rem]"
              style={{ color: EMBOSS }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}

          {/* Pendant cutout: contained, aspect preserved, anchored center-right */}
          <img
            src={pendant}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-[72%] w-auto -translate-y-1/2 object-contain sm:right-5"
          />

          {/* Top row */}
          <div className="relative flex items-start justify-between">
            <span className="flex items-center gap-1">
              <img src={wordmark} alt="FormaNova" className="h-4 w-auto sm:h-5" />
              <Sparkle className="-translate-y-1 text-[9px]" />
            </span>
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.28em] sm:text-[9px]" style={{ color: INK }}>
              Private Brand Space
              <Sparkle className="text-[9px]" />
            </p>
          </div>

          {/* Identity block */}
          <div className="relative mt-auto max-w-[62%] min-w-0 pb-4">
            {name && (
              <p className="truncate font-card text-3xl font-medium uppercase tracking-[0.06em] sm:text-4xl">
                {name}
              </p>
            )}
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.3em] sm:text-[9px]" style={{ color: INK }}>
              Bespoke Jewelry Brand Experience
            </p>
            <div className="mt-3">
              <SparkleRule />
            </div>
            <p className="mt-3 font-card text-sm italic" style={{ color: INK }}>
              Designed around your brand, every time.
            </p>
          </div>

          {/* Bottom-right pairing */}
          <p className="relative self-end font-card text-[10px] uppercase tracking-[0.28em]" style={{ color: INK }}>
            {name ? `${name} × FormaNova` : 'FormaNova'}
          </p>
        </CardFace>

        {/* Back */}
        <CardFace back>
          <p className="font-card text-lg font-medium uppercase tracking-[0.18em] sm:text-xl">
            Your FormaNova Experience
          </p>
          <div className="mt-2">
            <SparkleRule />
          </div>

          <ul className="mt-4 space-y-2">
            {BACK_BENEFITS.map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: ACCENT }} />
                <span className="text-xs sm:text-sm">{line}</span>
              </li>
            ))}
          </ul>

          {(site || store || basedIn.trim() || markets.length > 0 || links.length > 0) && (
            <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-2.5 pt-4">
              {site && <DetailRow Icon={Globe} value={site} />}
              {store && <DetailRow Icon={ShoppingBag} value={store} />}
              {basedIn.trim() && <DetailRow Icon={MapPin} value={basedIn.trim()} />}
              {markets.length > 0 && <DetailRow Icon={Compass} value={markets.join(' · ')} />}
              {links.map((link) => (
                <DetailRow
                  key={link}
                  Icon={socialIconFor(link)}
                  value={handleLabel(link)}
                  href={link}
                />
              ))}
            </div>
          )}
        </CardFace>
      </div>
      </div>

      {caption && (
        <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
