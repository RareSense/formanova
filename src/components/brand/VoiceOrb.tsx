import { motion, type Variants } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening';

interface VoiceOrbProps {
  state: OrbState;
  className?: string;
}

interface OrbPalette {
  /** Gradient stops from center to edge: pearl, ivory, champagne, blush, cool-blue. */
  stops: [string, string, string, string, string];
  ring: string;
  glow: string;
}

/**
 * Light-family themes get the literal approved pearl/ivory/champagne/blush
 * palette (matches spec exactly, never drifts per light theme). Dark-family
 * themes shift the same conceptual palette onto CSS-variable tokens so it
 * reads as "the same orb" without inverting into neon under cyberpunk/synthwave.
 * Mirrors the light/dark palette-branch pattern in BrandCard.tsx.
 */
function getOrbPalette(isDark: boolean): OrbPalette {
  if (!isDark) {
    return {
      stops: ['#FDFBF6', '#F7EFDD', '#F2DCC9', '#F0CBD3', '#D3E3ED'],
      ring: 'hsl(var(--formanova-hero-accent) / 0.55)',
      glow: 'hsl(var(--formanova-hero-accent) / 0.22)',
    };
  }
  return {
    stops: [
      'hsl(var(--card))',
      'hsl(var(--muted))',
      'hsl(var(--primary) / 0.4)',
      'hsl(var(--formanova-hero-accent) / 0.4)',
      'hsl(var(--formanova-glow) / 0.4)',
    ],
    ring: 'hsl(var(--formanova-hero-accent) / 0.6)',
    glow: 'hsl(var(--formanova-glow) / 0.3)',
  };
}

const orbVariants: Variants = {
  idle: {
    scale: [1, 1.035, 1],
    transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    scale: 1.05,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  connecting: {
    scale: 1.02,
    rotate: [0, 360],
    transition: {
      rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
      scale: { duration: 0.3, ease: 'easeOut' },
    },
  },
  speaking: {
    scale: [1, 1.02, 0.99, 1.015, 1],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.015, 1],
    transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
  },
};

const glowVariants: Variants = {
  idle: { opacity: 0.5, transition: { duration: 1 } },
  hover: { opacity: 0.55, transition: { duration: 0.3 } },
  connecting: { opacity: 0.6, transition: { duration: 0.3 } },
  speaking: { opacity: 0.65, transition: { duration: 0.3 } },
  listening: { opacity: 0.78, transition: { duration: 0.6 } },
};

const WAVEFORM_BARS = [0, 1, 2, 3, 4];
const GRADIENT_ID = 'nova-orb-gradient';

export function VoiceOrb({ state, className }: VoiceOrbProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const pal = getOrbPalette(isDark);

  return (
    <div
      data-testid="voice-orb"
      data-orb-state={state}
      className={cn('relative', className)}
      style={{ width: 160, height: 160 }}
    >
      <motion.div
        aria-hidden="true"
        variants={glowVariants}
        animate={state}
        initial="idle"
        className="absolute rounded-full"
        style={{
          inset: -20,
          background: `radial-gradient(circle, ${pal.glow} 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
      />
      <motion.svg
        width={160}
        height={160}
        viewBox="0 0 160 160"
        variants={orbVariants}
        animate={state}
        initial="idle"
        className="relative"
      >
        <defs>
          <radialGradient id={GRADIENT_ID} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={pal.stops[0]} />
            <stop offset="30%" stopColor={pal.stops[1]} />
            <stop offset="60%" stopColor={pal.stops[2]} />
            <stop offset="85%" stopColor={pal.stops[3]} />
            <stop offset="100%" stopColor={pal.stops[4]} />
          </radialGradient>
        </defs>
        <circle cx={80} cy={80} r={70} fill={`url(#${GRADIENT_ID})`} />
        <circle cx={80} cy={80} r={70} fill="none" stroke={pal.ring} strokeWidth={1.5} />
      </motion.svg>
      {state === 'speaking' && (
        <div
          aria-hidden="true"
          data-testid="voice-orb-waveform"
          className="absolute top-1/2 flex items-center gap-[3px]"
          style={{ right: -28, transform: 'translateY(-50%)' }}
        >
          {WAVEFORM_BARS.map((i) => (
            <motion.span
              key={i}
              className="block w-[3px] rounded-full"
              style={{ background: pal.ring, height: 10 }}
              animate={{ height: [10, 22, 8, 18, 10] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
