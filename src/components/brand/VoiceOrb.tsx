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
  /** Two accent tones used by the internal drifting blobs. */
  driftA: string;
  driftB: string;
}

/**
 * Light-family themes get the approved pearl/ivory/champagne/blush palette
 * exactly (never drifts per light theme). Dark-family themes shift the same
 * conceptual palette onto theme tokens (charcoal base, muted-gold/plum/cool-blue
 * drift) so it still reads as "the same orb" without going neon or muddy.
 */
function getOrbPalette(isDark: boolean): OrbPalette {
  if (!isDark) {
    return {
      stops: ['#FDFBF6', '#F7EFDD', '#F2DCC9', '#F0CBD3', '#D3E3ED'],
      driftA: '#F0CBD3',
      driftB: '#D3E3ED',
    };
  }
  return {
    stops: [
      'hsl(var(--card))',
      'hsl(var(--muted))',
      'hsl(var(--formanova-hero-accent) / 0.5)',
      'hsl(var(--formanova-glow) / 0.4)',
      'hsl(var(--accent) / 0.5)',
    ],
    driftA: 'hsl(var(--formanova-hero-accent) / 0.55)',
    driftB: 'hsl(var(--formanova-glow) / 0.5)',
  };
}

const orbVariants: Variants = {
  idle: {
    scale: [1, 1.025, 1],
    transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    scale: 1.04,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  connecting: {
    scale: [1, 1.02, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    scale: [1, 1.035, 0.99, 1.025, 1],
    transition: { duration: 1.7, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.02, 1],
    transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
  },
};

/** Slow internal drift for the two accent blobs — this is the "fluid motion inside the orb". */
const driftAVariants: Variants = {
  idle: {
    x: [-8, 10, -8],
    y: [-6, 8, -6],
    scale: [1, 1.12, 1],
    transition: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    x: [-8, 10, -8],
    y: [-6, 8, -6],
    scale: [1.05, 1.16, 1.05],
    transition: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
  },
  connecting: {
    x: [-10, 12, -10],
    y: [10, -10, 10],
    rotate: [0, 180, 360],
    transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    x: [-14, 16, -10, 12, -14],
    y: [-10, 12, -8, 10, -10],
    scale: [1, 1.22, 0.95, 1.15, 1],
    transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    x: [-6, 8, -6],
    y: [8, -6, 8],
    scale: [1, 1.08, 1],
    transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
  },
};

const driftBVariants: Variants = {
  idle: {
    x: [8, -10, 8],
    y: [10, -8, 10],
    scale: [1, 1.08, 1],
    transition: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    x: [8, -10, 8],
    y: [10, -8, 10],
    scale: [1.05, 1.14, 1.05],
    transition: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
  },
  connecting: {
    x: [10, -12, 10],
    y: [-8, 10, -8],
    rotate: [360, 180, 0],
    transition: { duration: 6.5, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    x: [12, -14, 10, -12, 12],
    y: [10, -12, 8, -10, 10],
    scale: [1, 1.18, 0.96, 1.1, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    x: [6, -8, 6],
    y: [-8, 6, -8],
    scale: [1, 1.06, 1],
    transition: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
  },
};

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function VoiceOrb({ state, className, size = 208 }: VoiceOrbProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const pal = getOrbPalette(isDark);
  const blobSize = size * 0.62;

  return (
    <div
      data-testid="voice-orb"
      data-orb-state={state}
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* Soft contact shadow directly beneath the orb — no outer halo/glow */}
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          bottom: -size * 0.1,
          left: '12%',
          right: '12%',
          height: size * 0.14,
          background: isDark ? 'hsl(0 0% 0% / 0.45)' : 'hsl(30 15% 30% / 0.18)',
          filter: `blur(${size * 0.06}px)`,
        }}
      />

      {/* Crisp circular silhouette — everything inside is clipped, so drift never blurs the edge */}
      <motion.div
        variants={orbVariants}
        animate={state}
        initial="idle"
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 30%, ${pal.stops[0]} 0%, ${pal.stops[1]} 32%, ${pal.stops[2]} 58%, ${pal.stops[3]} 80%, ${pal.stops[4]} 100%)`,
          boxShadow: isDark
            ? 'inset 0 0 0 1px hsl(var(--formanova-hero-accent) / 0.35), inset 0 -14px 24px hsl(0 0% 0% / 0.35)'
            : 'inset 0 0 0 1px hsl(0 0% 100% / 0.6), inset 0 -14px 22px hsl(30 20% 70% / 0.25)',
        }}
      >
        {/* Internal drifting accent — fluid motion, fully clipped to the silhouette */}
        <motion.div
          aria-hidden="true"
          variants={driftAVariants}
          animate={state}
          initial="idle"
          className="absolute rounded-full"
          style={{
            width: blobSize,
            height: blobSize,
            left: '10%',
            top: '46%',
            background: pal.driftA,
            filter: `blur(${size * 0.11}px)`,
            opacity: isDark ? 0.9 : 0.55,
          }}
        />
        <motion.div
          aria-hidden="true"
          variants={driftBVariants}
          animate={state}
          initial="idle"
          className="absolute rounded-full"
          style={{
            width: blobSize * 0.85,
            height: blobSize * 0.85,
            right: '8%',
            top: '18%',
            background: pal.driftB,
            filter: `blur(${size * 0.11}px)`,
            opacity: isDark ? 0.85 : 0.5,
          }}
        />

        {/* Glossy specular highlight — subtle, gives the sphere dimension */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 22%, hsl(0 0% 100% / 0.65) 0%, transparent 30%)',
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
