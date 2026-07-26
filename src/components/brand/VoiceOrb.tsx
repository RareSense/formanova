import { motion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening';

interface VoiceOrbProps {
  state: OrbState;
  className?: string;
}

/**
 * Soft, blurred, morphing blob (ChatGPT voice-mode style) rather than a
 * hard-edged ring. Colors are pulled straight from the app's own theme
 * tokens so the orb automatically matches every theme (light/dark/neon/etc)
 * without a separate light/dark branch.
 */
const coreVariants: Variants = {
  idle: {
    scale: [1, 1.06, 1],
    borderRadius: ['42% 58% 61% 39% / 45% 40% 60% 55%', '58% 42% 39% 61% / 55% 60% 40% 45%', '42% 58% 61% 39% / 45% 40% 60% 55%'],
    transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
  },
  hover: {
    scale: 1.1,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
  connecting: {
    scale: [1, 1.08, 1],
    rotate: [0, 360],
    transition: {
      rotate: { duration: 4, repeat: Infinity, ease: 'linear' },
      scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  speaking: {
    scale: [1, 1.14, 0.97, 1.1, 1],
    borderRadius: ['48% 52% 55% 45% / 50% 45% 55% 50%', '55% 45% 48% 52% / 45% 55% 45% 55%', '48% 52% 55% 45% / 50% 45% 55% 50%'],
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.05, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
  },
};

const glowVariants: Variants = {
  idle: { opacity: 0.55, scale: 1, transition: { duration: 1 } },
  hover: { opacity: 0.65, scale: 1.05, transition: { duration: 0.3 } },
  connecting: { opacity: 0.7, scale: 1.05, transition: { duration: 0.3 } },
  speaking: { opacity: 0.85, scale: 1.1, transition: { duration: 0.3 } },
  listening: { opacity: 0.75, scale: 1.05, transition: { duration: 0.6 } },
};

const spinVariants: Variants = {
  idle: { rotate: 360, transition: { duration: 26, repeat: Infinity, ease: 'linear' } },
  hover: { rotate: 360, transition: { duration: 18, repeat: Infinity, ease: 'linear' } },
  connecting: { rotate: 360, transition: { duration: 10, repeat: Infinity, ease: 'linear' } },
  speaking: { rotate: 360, transition: { duration: 9, repeat: Infinity, ease: 'linear' } },
  listening: { rotate: 360, transition: { duration: 16, repeat: Infinity, ease: 'linear' } },
};

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function VoiceOrb({ state, className }: VoiceOrbProps) {
  return (
    <div
      data-testid="voice-orb"
      data-orb-state={state}
      className={cn('relative', className)}
      style={{ width: 160, height: 160 }}
    >
      {/* Ambient halo, bleeds outside the core */}
      <motion.div
        aria-hidden="true"
        variants={glowVariants}
        animate={state}
        initial="idle"
        className="absolute rounded-full"
        style={{
          inset: -34,
          background:
            'radial-gradient(circle, hsl(var(--formanova-glow) / 0.35) 0%, hsl(var(--formanova-hero-accent) / 0.18) 45%, transparent 72%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Rotating conic wash, blurred so it reads as color motion, not a hard edge */}
      <motion.div
        aria-hidden="true"
        variants={spinVariants}
        animate={state}
        initial="idle"
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, hsl(var(--formanova-glow) / 0.85), hsl(var(--formanova-hero-accent) / 0.85), hsl(var(--accent) / 0.7), hsl(var(--formanova-hero-accent) / 0.85), hsl(var(--formanova-glow) / 0.85))',
          filter: 'blur(14px)',
        }}
      />

      {/* Soft morphing core blob — colorful, no flat white/gray/black fill */}
      <motion.div
        aria-hidden="true"
        variants={coreVariants}
        animate={state}
        initial="idle"
        className="absolute inset-[18px]"
        style={{
          background:
            'radial-gradient(circle at 32% 28%, hsl(var(--formanova-glow) / 0.95) 0%, hsl(var(--formanova-hero-accent) / 0.9) 55%, hsl(var(--formanova-hero-accent) / 0.65) 100%)',
          borderRadius: '50%',
          filter: 'blur(3px)',
          boxShadow: '0 0 26px hsl(var(--formanova-glow) / 0.45)',
        }}
      />

      {/* Glossy specular highlight for depth */}
      <motion.div
        aria-hidden="true"
        variants={coreVariants}
        animate={state}
        initial="idle"
        className="absolute inset-[18px] mix-blend-screen"
        style={{
          background: 'radial-gradient(circle at 32% 26%, hsl(0 0% 100% / 0.55) 0%, transparent 32%)',
          borderRadius: '50%',
          filter: 'blur(4px)',
        }}
      />

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
