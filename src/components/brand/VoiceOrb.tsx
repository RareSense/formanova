import { motion, type Transition } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening';

interface VoiceOrbProps {
  state: OrbState;
  className?: string;
  size?: number;
}

/**
 * Fully theme-token-driven — every one of the 12 themes gets its own
 * correctly-colored orb, not one hardcoded palette that only fits one theme.
 * Bands are narrow so no single hue (e.g. the amber hero-accent) dominates
 * the sphere: background core -> glow -> hero-accent -> accent -> a
 * shaded-down version of hero-accent at the rim for depth without mud.
 */
const ORB_GRADIENT =
  'radial-gradient(circle at 40% 32%, hsl(var(--background)) 0%, hsl(var(--formanova-glow) / 0.85) 20%, hsl(var(--formanova-hero-accent) / 0.9) 45%, hsl(var(--accent) / 0.85) 70%, color-mix(in srgb, hsl(var(--formanova-hero-accent)) 55%, black) 100%)';

const ORB_HIGHLIGHT = 'hsl(0 0% 100% / 0.9)';

/**
 * NOTE: these are plain `animate` targets, not `variants` + `initial="idle"`.
 * Framer Motion treats identical initial/animate *variant labels* as "already
 * at rest" and skips the keyframe loop entirely on mount — it silently
 * freezes on the first keyframe forever. Plain animate objects with array
 * values don't have that label-equality shortcut, so the loop actually runs.
 */
const ORB_SCALE: Record<OrbState, number[]> = {
  idle: [1, 1.02, 1],
  hover: [1.035, 1.035],
  connecting: [1, 1.02, 1],
  speaking: [1, 1.045, 0.985, 1.03, 1],
  listening: [1, 1.02, 1],
};

const ORB_TRANSITION: Record<OrbState, Transition> = {
  idle: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
  hover: { duration: 0.3, ease: 'easeOut' },
  connecting: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  speaking: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
  listening: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
};

/**
 * The orb's whole visual identity: a soft bright highlight that continuously
 * drifts around inside the sphere — never static, always in motion, faster
 * and wider while Nova is speaking. This is the "moving light" reference look.
 */
const HIGHLIGHT_A: Record<OrbState, { x: string[]; y: string[]; scale: number[] }> = {
  idle: { x: ['-8%', '10%', '-4%', '-8%'], y: ['-10%', '4%', '8%', '-10%'], scale: [1, 1.15, 0.95, 1] },
  hover: { x: ['-8%', '10%', '-4%', '-8%'], y: ['-10%', '4%', '8%', '-10%'], scale: [1.05, 1.2, 1, 1.05] },
  connecting: { x: ['-10%', '12%', '-6%', '-10%'], y: ['-12%', '6%', '10%', '-12%'], scale: [1, 1.2, 0.95, 1] },
  speaking: {
    x: ['-14%', '16%', '-10%', '12%', '-14%'],
    y: ['-16%', '10%', '14%', '-8%', '-16%'],
    scale: [1, 1.3, 0.9, 1.2, 1],
  },
  listening: { x: ['-8%', '10%', '-4%', '-8%'], y: ['-10%', '4%', '8%', '-10%'], scale: [1, 1.12, 0.97, 1] },
};

const HIGHLIGHT_A_TRANSITION: Record<OrbState, Transition> = {
  idle: { duration: 11, repeat: Infinity, ease: 'easeInOut' },
  hover: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
  connecting: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
  speaking: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  listening: { duration: 6.5, repeat: Infinity, ease: 'easeInOut' },
};

const HIGHLIGHT_B: Record<OrbState, { x: string[]; y: string[]; scale: number[] }> = {
  idle: { x: ['12%', '-6%', '8%', '12%'], y: ['10%', '-8%', '-4%', '10%'], scale: [1, 0.9, 1.1, 1] },
  hover: { x: ['12%', '-6%', '8%', '12%'], y: ['10%', '-8%', '-4%', '10%'], scale: [1.05, 0.95, 1.15, 1.05] },
  connecting: { x: ['14%', '-8%', '10%', '14%'], y: ['12%', '-10%', '-6%', '12%'], scale: [1, 0.9, 1.15, 1] },
  speaking: {
    x: ['16%', '-12%', '14%', '-8%', '16%'],
    y: ['14%', '-14%', '-8%', '10%', '14%'],
    scale: [1, 0.85, 1.25, 0.95, 1],
  },
  listening: { x: ['12%', '-6%', '8%', '12%'], y: ['10%', '-8%', '-4%', '10%'], scale: [1, 0.93, 1.08, 1] },
};

const HIGHLIGHT_B_TRANSITION: Record<OrbState, Transition> = {
  idle: { duration: 13, repeat: Infinity, ease: 'easeInOut' },
  hover: { duration: 9.5, repeat: Infinity, ease: 'easeInOut' },
  connecting: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
  speaking: { duration: 3.3, repeat: Infinity, ease: 'easeInOut' },
  listening: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
};

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function VoiceOrb({ state, className, size = 224 }: VoiceOrbProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const highlightSize = size * 0.7;

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

      {/* Crisp circular silhouette — the moving highlights below are clipped to this circle */}
      <motion.div
        animate={{ scale: ORB_SCALE[state] }}
        transition={ORB_TRANSITION[state]}
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: ORB_GRADIENT,
          boxShadow: isDark
            ? 'inset 0 0 0 1px hsl(var(--formanova-hero-accent) / 0.35), inset 0 -16px 26px hsl(0 0% 0% / 0.4)'
            : 'inset 0 0 0 1px hsl(0 0% 100% / 0.65), inset 0 -16px 24px hsl(30 20% 70% / 0.25)',
        }}
      >
        {/* Two soft bright blobs that continuously drift — this is the orb's motion */}
        <motion.div
          aria-hidden="true"
          animate={HIGHLIGHT_A[state]}
          transition={HIGHLIGHT_A_TRANSITION[state]}
          className="absolute rounded-full"
          style={{
            width: highlightSize,
            height: highlightSize,
            left: '18%',
            top: '10%',
            background: `radial-gradient(circle, ${ORB_HIGHLIGHT} 0%, transparent 55%)`,
            filter: `blur(${size * 0.035}px)`,
            opacity: 0.85,
          }}
        />
        <motion.div
          aria-hidden="true"
          animate={HIGHLIGHT_B[state]}
          transition={HIGHLIGHT_B_TRANSITION[state]}
          className="absolute rounded-full"
          style={{
            width: highlightSize * 0.75,
            height: highlightSize * 0.75,
            right: '8%',
            bottom: '6%',
            background: `radial-gradient(circle, ${ORB_HIGHLIGHT} 0%, transparent 58%)`,
            filter: `blur(${size * 0.04}px)`,
            opacity: 0.55,
          }}
        />
      </motion.div>

      {state === 'speaking' && (
        <>
          <div
            aria-hidden="true"
            data-testid="voice-orb-waveform"
            className="absolute top-1/2 flex items-center gap-[5px]"
            style={{ right: -size * 0.24, transform: 'translateY(-50%)' }}
          >
            {WAVEFORM_BARS.map((i) => (
              <motion.span
                key={`right-${i}`}
                className="block w-[5px] rounded-full"
                style={{ background: 'hsl(var(--formanova-hero-accent))', height: 18 }}
                animate={{ height: [18, 40, 14, 32, 18] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
              />
            ))}
          </div>
          <div
            aria-hidden="true"
            data-testid="voice-orb-waveform-left"
            className="absolute top-1/2 flex items-center gap-[5px]"
            style={{ left: -size * 0.24, transform: 'translateY(-50%)' }}
          >
            {WAVEFORM_BARS.map((i) => (
              <motion.span
                key={`left-${i}`}
                className="block w-[5px] rounded-full"
                style={{ background: 'hsl(var(--formanova-hero-accent))', height: 18 }}
                animate={{ height: [18, 40, 14, 32, 18] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
