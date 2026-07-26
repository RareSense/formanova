import { motion, type Variants } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening';

interface VoiceOrbProps {
  state: OrbState;
  className?: string;
  size?: number;
}

interface OrbPalette {
  /** Base radial-gradient stops, center to edge. */
  stops: [string, string, string, string, string];
  /** Translucent wave-band + sparkle tone. */
  wave: string;
  glow: string;
}

/**
 * Light-family themes get the approved pearl/ivory/champagne/blush palette
 * exactly. Dark-family themes shift the same glossy-sphere treatment onto
 * theme tokens (charcoal base, muted-gold/plum wave) so every theme gets the
 * same orb design, just recolored.
 */
function getOrbPalette(isDark: boolean): OrbPalette {
  if (!isDark) {
    return {
      stops: ['#FDFBF6', '#F7EFDD', '#F2DCC9', '#F0CBD3', '#D3E3ED'],
      wave: 'hsl(0 0% 100% / 0.8)',
      glow: 'hsl(35 70% 82% / 0.35)',
    };
  }
  return {
    stops: [
      'hsl(var(--card))',
      'hsl(var(--muted))',
      'hsl(var(--formanova-hero-accent) / 0.55)',
      'hsl(var(--formanova-glow) / 0.45)',
      'hsl(var(--accent) / 0.5)',
    ],
    wave: 'hsl(var(--formanova-hero-accent) / 0.75)',
    glow: 'hsl(var(--formanova-glow) / 0.35)',
  };
}

const orbVariants: Variants = {
  idle: {
    scale: [1, 1.02, 1],
    transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    scale: 1.035,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  connecting: {
    scale: [1, 1.02, 1],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    scale: [1, 1.045, 0.985, 1.03, 1],
    transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.02, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
  },
};

/** Wave-band motion: near-still at idle, a clearly visible flow while speaking. */
const waveOneVariants: Variants = {
  idle: { y: [-4, 4, -4], rotate: [-8, -5, -8], transition: { duration: 9, repeat: Infinity, ease: 'easeInOut' } },
  hover: { y: [-4, 4, -4], rotate: [-8, -5, -8], transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' } },
  connecting: { y: [-6, 6, -6], rotate: [-10, -2, -10], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' } },
  speaking: { y: [-10, 12, -8, 10, -10], rotate: [-12, 4, -14, 2, -12], transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' } },
  listening: { y: [-6, 6, -6], rotate: [-9, -4, -9], transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } },
};

const waveTwoVariants: Variants = {
  idle: { y: [5, -3, 5], rotate: [6, 3, 6], transition: { duration: 10.5, repeat: Infinity, ease: 'easeInOut' } },
  hover: { y: [5, -3, 5], rotate: [6, 3, 6], transition: { duration: 8, repeat: Infinity, ease: 'easeInOut' } },
  connecting: { y: [7, -7, 7], rotate: [10, 2, 10], transition: { duration: 4.4, repeat: Infinity, ease: 'easeInOut' } },
  speaking: { y: [10, -12, 8, -10, 10], rotate: [14, -4, 12, -2, 14], transition: { duration: 2.3, repeat: Infinity, ease: 'easeInOut' } },
  listening: { y: [6, -6, 6], rotate: [8, 3, 8], transition: { duration: 3.9, repeat: Infinity, ease: 'easeInOut' } },
};

const SPARKLES = [
  { top: '30%', left: '38%', delay: 0, size: 3 },
  { top: '54%', left: '60%', delay: 0.6, size: 2.5 },
  { top: '66%', left: '32%', delay: 1.1, size: 2 },
  { top: '42%', left: '70%', delay: 1.6, size: 2.5 },
];

const SPARKLE_DURATION: Record<OrbState, number> = {
  idle: 4,
  hover: 3.4,
  connecting: 2,
  speaking: 1.1,
  listening: 2.6,
};

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function VoiceOrb({ state, className, size = 224 }: VoiceOrbProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const pal = getOrbPalette(isDark);

  return (
    <div
      data-testid="voice-orb"
      data-orb-state={state}
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* Soft contact shadow directly beneath the orb */}
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          bottom: -size * 0.09,
          left: '14%',
          right: '14%',
          height: size * 0.12,
          background: isDark ? 'hsl(0 0% 0% / 0.5)' : 'hsl(30 15% 30% / 0.2)',
          filter: `blur(${size * 0.05}px)`,
        }}
      />

      {/* Restrained ambient bloom — soft, contained, not an oversized halo */}
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ inset: -size * 0.06, background: pal.glow, filter: `blur(${size * 0.09}px)` }}
      />

      {/* Crisp circular silhouette — everything below is clipped to this circle */}
      <motion.div
        variants={orbVariants}
        animate={state}
        initial="idle"
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 28%, ${pal.stops[0]} 0%, ${pal.stops[1]} 32%, ${pal.stops[2]} 58%, ${pal.stops[3]} 80%, ${pal.stops[4]} 100%)`,
          boxShadow: isDark
            ? 'inset 0 0 0 1px hsl(var(--formanova-hero-accent) / 0.35), inset 0 -16px 26px hsl(0 0% 0% / 0.4)'
            : 'inset 0 0 0 1px hsl(0 0% 100% / 0.65), inset 0 -16px 24px hsl(30 20% 70% / 0.25)',
        }}
      >
        {/* Flowing internal wave bands — the "liquid light" reference look */}
        <motion.div
          aria-hidden="true"
          variants={waveOneVariants}
          animate={state}
          initial="idle"
          className="absolute"
          style={{
            left: '-15%',
            top: '46%',
            width: '130%',
            height: size * 0.24,
            background: `linear-gradient(90deg, transparent 0%, ${pal.wave} 45%, transparent 100%)`,
            filter: `blur(${size * 0.02}px)`,
            mixBlendMode: 'overlay',
          }}
        />
        <motion.div
          aria-hidden="true"
          variants={waveTwoVariants}
          animate={state}
          initial="idle"
          className="absolute"
          style={{
            left: '-15%',
            top: '62%',
            width: '130%',
            height: size * 0.2,
            background: `linear-gradient(90deg, transparent 5%, ${pal.wave} 50%, transparent 95%)`,
            filter: `blur(${size * 0.025}px)`,
            mixBlendMode: 'overlay',
            opacity: 0.85,
          }}
        />

        {/* Sparkle glints riding the wave bands */}
        {SPARKLES.map((s, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{
              duration: SPARKLE_DURATION[state],
              repeat: Infinity,
              ease: 'easeInOut',
              delay: s.delay,
            }}
            className="absolute rounded-full bg-white"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              boxShadow: '0 0 4px 1px hsl(0 0% 100% / 0.9)',
            }}
          />
        ))}

        {/* Glossy specular highlight — gives the sphere its glass dimension */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 22%, hsl(0 0% 100% / 0.7) 0%, transparent 34%)',
          }}
        />
      </motion.div>

      {state === 'speaking' && (
        <div
          aria-hidden="true"
          data-testid="voice-orb-waveform"
          className="absolute top-1/2 flex items-center gap-[3px]"
          style={{ right: -size * 0.18, transform: 'translateY(-50%)' }}
        >
          {WAVEFORM_BARS.map((i) => (
            <motion.span
              key={i}
              className="block w-[3px] rounded-full"
              style={{ background: 'hsl(var(--formanova-hero-accent))', height: 10 }}
              animate={{ height: [10, 22, 8, 18, 10] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
