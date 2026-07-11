import { Check, Globe, ShoppingBag, MapPin, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeLogo, DARK_THEMES } from '@/components/ThemeLogo';
import { socialIconFor, extractHandle } from '@/components/brand/social-icons';
import pendant from '@/assets/brand-card-pendant.webp';

export interface BrandCardProps {
  brandName: string;
  websiteUrl: string;
  storeUrl?: string;
  basedIn: string;
  targetMarkets: string[];
  /** Rendered as clickable platform icons with @handles (never raw links). */
  socialLinks?: string[];
  /**
   * 'front' / 'back' show one large face (3D-flips on change);
   * 'both' stacks the two faces.
   */
  face?: 'front' | 'back' | 'both';
  className?: string;
}

/*
 * The card follows the active theme, mapped for guaranteed visibility:
 * separation comes from the palette's own surface hierarchy
 * (background -> stage -> card -> border) rather than a foreign color.
 * Body text and the brand name always use foreground; the theme's
 * personality comes from decorative accents; vivid primary-colored type
 * only on dark themes so pale accents never wash out on light ones.
 */
const INK = 'hsl(var(--foreground))';
const ACCENT = 'hsl(var(--formanova-hero-accent))';
const EMBOSS = 'hsl(var(--foreground) / 0.07)';
const LINE = 'hsl(var(--border))';

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

/**
 * Full name always visible, never truncated and never broken mid-word.
 * Spec sizes by length (64/52/42/36px), and the longest word must also fit
 * one line, so single long words shrink instead of wrapping.
 */
function nameFontCss(name: string): string {
  let spec = 36;
  if (name.length <= 11) spec = 64;
  else if (name.length <= 17) spec = 52;
  else if (name.length <= 24) spec = 42;
  const longestWord = Math.max(...name.split(/\s+/).map((w) => w.length), 1);
  const wordFit = (95 / longestWord).toFixed(1);
  return `min(${spec}px, ${wordFit}cqw)`;
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

function CardFrame({ abs, back, children }: { abs?: boolean; back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border p-6 sm:p-8',
        abs ? 'absolute inset-0 [backface-visibility:hidden]' : 'relative aspect-[3/2] w-full',
        abs && back && '[transform:rotateY(180deg)]',
      )}
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: LINE,
        color: INK,
        boxShadow: '0 24px 50px -20px hsl(var(--foreground) / 0.45)',
        containerType: 'inline-size',
      }}
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
 * Premium bespoke brand card that fills live as the user types.
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
  face = 'both',
  className,
}: BrandCardProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  // Vivid theme color for supporting type on dark themes only; quiet ink on light.
  const supportColor = isDark ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.75)';

  const name = brandName.trim();
  const site = displayUrl(websiteUrl.trim());
  const store = displayUrl(storeUrl.trim());
  const markets = targetMarkets.filter(Boolean);
  const links = socialLinks.filter(Boolean);

  const front = (
    <>
      {/* Embossed initial behind the pendant */}
      {name && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[17%] top-1/2 -translate-y-1/2 font-card text-[10rem] leading-none sm:text-[12rem]"
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
        className="pointer-events-none absolute right-4 top-1/2 h-[76%] w-auto -translate-y-1/2 object-contain sm:right-6"
      />

      {/* Top row */}
      <div className="relative flex items-start justify-between">
        <span className="flex items-center gap-1">
          <ThemeLogo variant="plain" className="h-4 sm:h-5" width={100} height={24} />
          <Sparkle className="-translate-y-1 text-[9px]" />
        </span>
        <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.28em] sm:text-[9px]" style={{ color: INK }}>
          Private Brand Space
          <Sparkle className="text-[9px]" />
        </p>
      </div>

      {/* Identity block */}
      <div className="relative mt-auto min-w-0 max-w-[70%] pb-4">
        {name && (
          <p
            className="line-clamp-2 font-card font-medium uppercase leading-[1.1] tracking-[0.06em]"
            style={{ fontSize: nameFontCss(name), textWrap: 'balance' }}
          >
            {name}
          </p>
        )}
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.3em] sm:text-[9px]" style={{ color: supportColor }}>
          Bespoke Jewelry Brand Experience
        </p>
        <div className="mt-3">
          <SparkleRule />
        </div>
        <p className="mt-3 font-card text-sm italic" style={{ color: supportColor }}>
          Designed around your brand, every time.
        </p>
      </div>

      {/* Bottom-right pairing */}
      <p className="relative min-w-0 max-w-full self-end truncate font-card text-[10px] uppercase tracking-[0.28em]" style={{ color: INK }}>
        {name ? `${name} × FormaNova` : 'FormaNova'}
      </p>
    </>
  );

  const back = (
    <>
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
    </>
  );

  if (face === 'both') {
    return (
      <div className={cn('w-full select-none space-y-5 [perspective:1400px]', className)}>
        <div className="brand-card-tilt [transform-style:preserve-3d]">
          <CardFrame>{front}</CardFrame>
        </div>
        <div className="brand-card-tilt [transform-style:preserve-3d]">
          <CardFrame>{back}</CardFrame>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full select-none [perspective:1400px]', className)}>
      <div className="brand-card-tilt [transform-style:preserve-3d]">
        <div
          className="relative aspect-[3/2] w-full transition-transform duration-700 ease-out [transform-style:preserve-3d]"
          style={{ transform: face === 'back' ? 'rotateY(180deg)' : undefined }}
        >
          <CardFrame abs>{front}</CardFrame>
          <CardFrame abs back>{back}</CardFrame>
        </div>
      </div>
    </div>
  );
}
