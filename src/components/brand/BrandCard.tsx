import { Globe, ShoppingBag, MapPin, Compass, Tag, Info, Users } from 'lucide-react';
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
  /** Overrides the default italic tagline. Pass '' to hide it entirely (used while it's still being revealed during onboarding). */
  descriptor?: string;
  /** Small pill row under the descriptor, e.g. ['Minimalist', 'Everyday Luxury']. */
  styleTags?: string[];
  /** Small color-dot row representing the brand's derived palette. */
  paletteSwatches?: string[];
  /** Gates the pendant photo so it can be its own progressive-reveal step. Defaults to true. */
  showImagery?: boolean;
  /** Back-face detail row, e.g. "Fine gold & diamond jewelry". */
  productFocus?: string;
  /** Back-face detail row for any other business fact. */
  otherInfo?: string;
  /** Back-face detail row, e.g. "Women 25-45, gift shoppers". */
  audience?: string;
  /**
   * Opt-in override for the card's decorative accent color (sparkles, rule
   * lines) — used to reflect a detected brand palette without touching ink
   * or surface contrast. Leave unset for the default approved accent.
   */
  accentColor?: string;
  /** Back-face row key to briefly pulse-highlight, e.g. right after it's discovered. */
  highlightField?: 'website' | 'store' | 'basedIn' | 'targetMarkets' | 'productFocus' | 'audience' | 'otherInfo' | 'social' | null;
}

/** Bare domains, www., or full URLs all become a proper clickable href. */
function toHref(url: string): string {
  const v = url.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

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
/** Desktop spec size capped, scaling proportionally on narrower cards. */
function fluid(px: number, cqwFactor: number): string {
  return `min(${px}px, ${cqwFactor}cqw)`;
}

function titleStyle(name: string): React.CSSProperties {
  const len = name.length;
  if (len <= 28) {
    // One line: responsive fit against the container, capped at 48px.
    // The readable floor itself scales on small cards so the fitted size
    // is never overridden into an overflow.
    const cap = len <= 18 ? 48 : 42;
    return {
      whiteSpace: 'nowrap',
      fontSize: `clamp(${fluid(34, 8)}, min(${cap}px, ${(120 / len).toFixed(1)}cqw), ${cap}px)`,
      lineHeight: 1.1,
    };
  }
  return {
    fontSize: len <= 42 ? fluid(36, 8.5) : fluid(34, 8),
    lineHeight: 1.15,
    textWrap: 'balance',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  };
}

export type CardFace = 'front' | 'back' | 'both';

/** Segmented Front/Back(/Both) switch shared by every card preview. */
export function BrandCardFaceToggle({
  face,
  onFaceChange,
  showBoth,
  className,
}: {
  face: CardFace;
  onFaceChange: (face: CardFace) => void;
  /** Offer the Both option (desktop, once the card is complete). */
  showBoth?: boolean;
  className?: string;
}) {
  const options: CardFace[] = showBoth ? ['front', 'back', 'both'] : ['front', 'back'];
  return (
    <div className={cn('grid border border-border', showBoth ? 'grid-cols-3' : 'grid-cols-2', className)}>
      {options.map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => onFaceChange(side)}
          className={cn(
            'py-2 text-xs font-medium capitalize transition-colors',
            face === side
              ? 'bg-foreground text-background'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          {side}
        </button>
      ))}
    </div>
  );
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
  highlighted?: boolean;
}

function DetailRow({ Icon, value, pal, href, highlighted }: DetailRowProps) {
  const content = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="h-6 w-px shrink-0" style={{ backgroundColor: pal.line }} />
      <span className="min-w-0 truncate" style={{ fontSize: 'clamp(11px, 2.4cqw, 14px)' }}>{value}</span>
    </>
  );
  const rowClass = cn(
    'flex min-w-0 items-center gap-2.5 rounded-sm border-b px-1 -mx-1 pb-2',
    highlighted && 'animate-highlight-flash',
  );
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
  descriptor,
  styleTags = [],
  paletteSwatches = [],
  showImagery = true,
  productFocus = '',
  otherInfo = '',
  audience = '',
  accentColor,
  highlightField = null,
}: BrandCardProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);

  const pal: Palette = isDark
    ? {
        surface: 'hsl(var(--card))',
        ink: 'hsl(var(--foreground))',
        support: 'hsl(var(--primary))',
        accent: accentColor || 'hsl(var(--formanova-hero-accent))',
        emboss: 'hsl(var(--foreground) / 0.07)',
        line: 'hsl(var(--border))',
      }
    : {
        // Approved cream paper + burgundy accent on all light themes,
        // unless a detected brand palette opts into its own accent.
        surface: '#F7F2E9',
        ink: '#1B1710',
        support: 'rgba(27, 23, 16, 0.78)',
        accent: accentColor || '#7A2233',
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
        'flex flex-col overflow-hidden rounded-2xl border',
        opts?.abs ? 'absolute inset-0 [backface-visibility:hidden]' : 'relative aspect-[3/2] w-full',
        opts?.abs && opts?.back && '[transform:rotateY(180deg)]',
      )}
      style={{
        backgroundColor: pal.surface,
        borderColor: pal.line,
        color: pal.ink,
        boxShadow: '0 24px 50px -20px hsl(var(--foreground) / 0.45)',
        containerType: 'inline-size',
        padding: 'clamp(16px, 4.8cqw, 30px)',
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
          className="pointer-events-none absolute right-[17%] top-1/2 -translate-y-1/2 font-card leading-none"
          style={{ color: pal.emboss, fontSize: '27cqw' }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}

      {/* Pendant cutout: contained, aspect preserved, anchored center-right */}
      {showImagery && (
        <img
          src={pendant}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-[38%] h-[52%] w-auto -translate-y-1/2 object-contain animate-fade-in sm:right-6"
        />
      )}

      {/* Top row */}
      <div className="relative flex items-start justify-between">
        <span className="flex items-center gap-1">
          <ThemeLogo variant="plain" className="h-6 sm:h-7" width={140} height={28} />
          <Sparkle className="-translate-y-1.5 text-[11px]" />
        </span>
        <p className="flex items-center gap-1.5 font-mono uppercase tracking-[0.25em]" style={{ color: pal.ink, fontSize: 'clamp(8px, 1.7cqw, 10px)' }}>
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
        <p className="mt-2.5 font-mono uppercase tracking-[0.28em]" style={{ color: pal.support, fontSize: 'clamp(8.5px, 1.85cqw, 11px)' }}>
          Bespoke Jewelry Brand Experience
        </p>
        <div className="mt-3.5">{sparkleRule}</div>
        {(descriptor ?? 'Designed around your brand, every time.') && (
          <p
            className="mt-3.5 animate-fade-in font-card italic"
            style={{ color: pal.support, fontSize: 'clamp(11px, 2.6cqw, 15px)' }}
          >
            {descriptor ?? 'Designed around your brand, every time.'}
          </p>
        )}
        {styleTags.length > 0 && (
          <div className="mt-3 flex animate-fade-in flex-wrap gap-1.5">
            {styleTags.map((tag) => (
              <span
                key={tag}
                className="border px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
                style={{ borderColor: pal.line, color: pal.support, fontSize: 'clamp(7px, 1.6cqw, 9px)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {paletteSwatches.length > 0 && (
          <div className="mt-3 flex animate-fade-in items-center gap-1.5">
            {paletteSwatches.map((hex, i) => (
              <span
                key={`${hex}-${i}`}
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full border"
                style={{ backgroundColor: hex, borderColor: pal.line }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom-right pairing */}
      <p className="relative min-w-0 max-w-full self-end truncate font-card uppercase tracking-[0.25em]" style={{ color: pal.ink, fontSize: 'clamp(8.5px, 1.85cqw, 11px)' }}>
        {name ? `${name} × FormaNova` : 'FormaNova'}
      </p>
    </>
  );

  const back = (
    <>
      <p className="font-card font-medium uppercase tracking-[0.16em]" style={{ fontSize: 'clamp(15px, 4.4cqw, 26px)' }}>
        A Bespoke Experience For You
      </p>
      <div className="mt-2.5">{sparkleRule}</div>

      {(site || store || basedIn.trim() || markets.length > 0 || links.length > 0 || productFocus.trim() || audience.trim() || otherInfo.trim()) && (
        <div className="mt-7 grid grid-cols-2 content-start gap-x-9 gap-y-5">
          {site && <DetailRow Icon={Globe} value={site} pal={pal} href={toHref(websiteUrl)} highlighted={highlightField === 'website'} />}
          {store && <DetailRow Icon={ShoppingBag} value={store} pal={pal} href={toHref(storeUrl)} highlighted={highlightField === 'store'} />}
          {basedIn.trim() && <DetailRow Icon={MapPin} value={basedIn.trim()} pal={pal} highlighted={highlightField === 'basedIn'} />}
          {markets.length > 0 && <DetailRow Icon={Compass} value={markets.join(' · ')} pal={pal} highlighted={highlightField === 'targetMarkets'} />}
          {productFocus.trim() && <DetailRow Icon={Tag} value={productFocus.trim()} pal={pal} highlighted={highlightField === 'productFocus'} />}
          {audience.trim() && <DetailRow Icon={Users} value={audience.trim()} pal={pal} highlighted={highlightField === 'audience'} />}
          {otherInfo.trim() && <DetailRow Icon={Info} value={otherInfo.trim()} pal={pal} highlighted={highlightField === 'otherInfo'} />}
          {links.map((link) => (
            <DetailRow
              key={link}
              Icon={socialIconFor(link)}
              value={handleLabel(link)}
              pal={pal}
              href={link}
              highlighted={highlightField === 'social'}
            />
          ))}
        </div>
      )}
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
