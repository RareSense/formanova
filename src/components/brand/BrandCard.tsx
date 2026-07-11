import { Link } from 'react-router-dom';
import { Check, Globe, ShoppingBag, MapPin, Compass, ArrowRight } from 'lucide-react';
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

const BACK_BENEFITS = [
  'Your brand details remembered',
  'Every generation shaped to your aesthetic',
  'Collections stay consistent across every shoot',
];

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
 * Approved title rules — never split a word, keep the block width and
 * vertical centre constant, and never shrink below the readable minimum:
 *  - up to 18 chars: one line, full size (48px cap)
 *  - 19-28 chars: one line, slightly smaller responsive size
 *  - 29-42 chars: two balanced lines, reduced size and line-height
 *  - over 42 chars: two lines maximum, then ellipsis
 */
function titleStyle(name: string): React.CSSProperties {
  const len = name.length;
  if (len <= 28) {
    // One line: responsive fit against the container, capped at 48px,
    // never below the 34px readable minimum.
    const cap = len <= 18 ? 48 : 42;
    return {
      whiteSpace: 'nowrap',
      fontSize: `clamp(34px, min(${cap}px, ${(120 / len).toFixed(1)}cqw), ${cap}px)`,
      lineHeight: 1.1,
    };
  }
  return {
    fontSize: len <= 42 ? '36px' : '34px',
    lineHeight: 1.15,
    textWrap: 'balance',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  };
}

interface Palette {
  surface: string;
  ink: string;
  support: string;
  accent: string;
  emboss: string;
  line: string;
}

interface DetailRowProps {
  Icon: React.ComponentType<{ className?: string }>;
  value: string;
  pal: Palette;
  href?: string;
}

function DetailRow({ Icon, value, pal, href }: DetailRowProps) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="h-5 w-px shrink-0" style={{ backgroundColor: pal.line }} />
      <span className="min-w-0 truncate text-[13px]">{value}</span>
    </>
  );
  const rowClass = 'flex min-w-0 items-center gap-2.5 border-b pb-2';
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(rowClass, 'hover:opacity-60 transition-opacity')}
        style={{ borderColor: pal.line, color: pal.ink }}
      >
        {content}
      </a>
    );
  }
  return (
    <div className={rowClass} style={{ borderColor: pal.line, color: pal.ink }}>
      {content}
    </div>
  );
}

/**
 * Premium bespoke brand card that fills live as the user types.
 * Light themes use the approved cream paper + burgundy accents; dark themes
 * keep their own surfaces with the theme accent, so the card is always a
 * distinct luxury object on top of the page.
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

  const pal: Palette = isDark
    ? {
        surface: 'hsl(var(--card))',
        ink: 'hsl(var(--foreground))',
        support: 'hsl(var(--primary))',
        accent: 'hsl(var(--formanova-hero-accent))',
        emboss: 'hsl(var(--foreground) / 0.07)',
        line: 'hsl(var(--border))',
      }
    : {
        // Approved cream paper + burgundy accent on all light themes.
        surface: '#F7F2E9',
        ink: '#1B1710',
        support: 'rgba(27, 23, 16, 0.78)',
        accent: '#7A2233',
        emboss: 'rgba(27, 23, 16, 0.08)',
        line: '#E0D8C5',
      };

  const name = brandName.trim();
  const site = displayUrl(websiteUrl.trim());
  const store = displayUrl(storeUrl.trim());
  const markets = targetMarkets.filter(Boolean);
  const links = socialLinks.filter(Boolean);

  const Sparkle = ({ className: c }: { className?: string }) => (
    <span aria-hidden="true" className={c} style={{ color: pal.accent }}>&#10022;</span>
  );

  const sparkleRule = (
    <div className="flex items-center gap-2">
      <Sparkle className="text-xs" />
      <span className="h-px w-9" style={{ backgroundColor: pal.accent }} />
    </div>
  );

  const frame = (children: React.ReactNode, opts?: { abs?: boolean; back?: boolean }) => (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border p-6 sm:p-8',
        opts?.abs ? 'absolute inset-0 [backface-visibility:hidden]' : 'relative aspect-[3/2] w-full',
        opts?.abs && opts?.back && '[transform:rotateY(180deg)]',
      )}
      style={{
        backgroundColor: pal.surface,
        borderColor: pal.line,
        color: pal.ink,
        boxShadow: '0 24px 50px -20px hsl(var(--foreground) / 0.45)',
        containerType: 'inline-size',
      }}
    >
      {children}
    </div>
  );

  const front = (
    <>
      {/* Embossed initial behind the pendant */}
      {name && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[17%] top-1/2 -translate-y-1/2 font-card text-[10rem] leading-none sm:text-[12rem]"
          style={{ color: pal.emboss }}
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
          <ThemeLogo variant="plain" className="h-6 sm:h-7" width={140} height={28} />
          <Sparkle className="-translate-y-1.5 text-[11px]" />
        </span>
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: pal.ink }}>
          Private Brand Space
          <Sparkle className="text-[10px]" />
        </p>
      </div>

      {/* Identity block: constant width, vertically centred regardless of name length */}
      <div className="relative flex min-h-0 w-[70%] flex-1 flex-col justify-center">
        {name && (
          <p className="font-card font-medium tracking-[0.01em]" style={titleStyle(name)}>
            {name}
          </p>
        )}
        <p className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: pal.support }}>
          Bespoke Jewelry Brand Experience
        </p>
        <div className="mt-3.5">{sparkleRule}</div>
        <p className="mt-3.5 font-card text-[15px] italic" style={{ color: pal.support }}>
          Designed around your brand, every time.
        </p>
      </div>

      {/* Bottom-right pairing */}
      <p className="relative min-w-0 max-w-full self-end truncate font-card text-[11px] uppercase tracking-[0.25em]" style={{ color: pal.ink }}>
        {name ? `${name} × FormaNova` : 'FormaNova'}
      </p>
    </>
  );

  const back = (
    <>
      <p className="font-card text-xl font-medium uppercase tracking-[0.16em] sm:text-2xl">
        Your FormaNova Experience
      </p>
      <div className="mt-2.5">{sparkleRule}</div>

      <ul className="mt-5 space-y-2.5">
        {BACK_BENEFITS.map((line) => (
          <li key={line} className="flex items-center gap-3">
            <Check className="h-4 w-4 shrink-0" style={{ color: pal.accent }} />
            <span className="text-[13px] sm:text-sm">{line}</span>
          </li>
        ))}
      </ul>

      {(site || store || basedIn.trim() || markets.length > 0 || links.length > 0) && (
        <div className="mt-6 grid grid-cols-2 content-start gap-x-8 gap-y-3.5">
          {site && <DetailRow Icon={Globe} value={site} pal={pal} />}
          {store && <DetailRow Icon={ShoppingBag} value={store} pal={pal} />}
          {basedIn.trim() && <DetailRow Icon={MapPin} value={basedIn.trim()} pal={pal} />}
          {markets.length > 0 && <DetailRow Icon={Compass} value={markets.join(' · ')} pal={pal} />}
          {links.map((link) => (
            <DetailRow
              key={link}
              Icon={socialIconFor(link)}
              value={handleLabel(link)}
              pal={pal}
              href={link}
            />
          ))}
        </div>
      )}

      {/* Bottom-right safe-area action */}
      <Link
        to="/brand-details"
        className="mt-auto flex items-center gap-2 self-end font-card text-[15px] italic hover:opacity-60 transition-opacity"
        style={{ color: pal.ink }}
      >
        Edit in Brand Settings
        <ArrowRight className="h-4 w-4" />
      </Link>
    </>
  );

  if (face === 'both') {
    return (
      <div className={cn('w-full select-none space-y-5 [perspective:1400px]', className)}>
        <div className="brand-card-tilt [transform-style:preserve-3d]">{frame(front)}</div>
        <div className="brand-card-tilt [transform-style:preserve-3d]">{frame(back)}</div>
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
          {frame(front, { abs: true })}
          {frame(back, { abs: true, back: true })}
        </div>
      </div>
    </div>
  );
}
