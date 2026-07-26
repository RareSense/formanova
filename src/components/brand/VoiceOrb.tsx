import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening';

interface VoiceOrbProps {
  state: OrbState;
  className?: string;
  size?: number;
  /** 0-1 smoothed amplitude; only used in the listening/speaking states. */
  audioLevel?: number;
}

/**
 * Every color is a theme CSS variable (not a hardcoded hex), so all 12
 * FormaNova themes get their own correctly-colored orb for free — the
 * browser resolves the var() at paint time from whatever theme class is on
 * <html>, no JS branching needed. "champagne" is a shaded-down version of
 * the hero-accent (via color-mix) rather than an unrelated hue, so the rim
 * reads as depth, not mud.
 */
const PALETTE = {
  pearl: 'hsl(var(--background))',
  blush: 'hsl(var(--formanova-glow))',
  lavender: 'hsl(var(--formanova-hero-accent))',
  blue: 'hsl(var(--accent))',
  champagne: 'color-mix(in srgb, hsl(var(--formanova-hero-accent)) 55%, black)',
};

const STATE_CONFIG: Record<
  OrbState,
  { duration: number; displacement: number; frequency: number; scale: number; brightness: number; innerSpeed: number }
> = {
  idle: { duration: 9, displacement: 9, frequency: 0.011, scale: 1, brightness: 1, innerSpeed: 1 },
  hover: { duration: 7, displacement: 11, frequency: 0.012, scale: 1.03, brightness: 1.05, innerSpeed: 1.1 },
  connecting: { duration: 2.8, displacement: 8, frequency: 0.014, scale: 0.98, brightness: 1.04, innerSpeed: 1.35 },
  listening: { duration: 4.2, displacement: 13, frequency: 0.015, scale: 1.01, brightness: 1.06, innerSpeed: 1.6 },
  speaking: { duration: 2.3, displacement: 17, frequency: 0.018, scale: 1.025, brightness: 1.1, innerSpeed: 2.1 },
};

const BLOB_PATHS = [
  `M120 17 C158 15 203 39 217 81 C232 124 213 176 176 204 C139 232 82 229 45 197 C8 165 8 106 34 65 C60 24 86 18 120 17 Z`,
  `M120 20 C164 16 206 50 216 91 C227 133 205 184 163 209 C121 234 70 219 38 184 C7 149 18 91 51 53 C83 15 96 23 120 20 Z`,
  `M120 16 C153 19 198 31 216 73 C235 115 220 168 184 199 C148 230 91 235 50 204 C9 173 2 118 29 72 C56 26 87 13 120 16 Z`,
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanSvgId(id: string) {
  return id.replace(/[^a-zA-Z0-9-_]/g, '');
}

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function VoiceOrb({ state, className, size = 224, audioLevel = 0 }: VoiceOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const generatedId = cleanSvgId(useId());
  const config = STATE_CONFIG[state];

  const turbulenceRef = useRef<SVGFETurbulenceElement | null>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const audioRef = useRef(0);

  const rawAudio = useMotionValue(clamp(audioLevel, 0, 1));
  const smoothAudio = useSpring(rawAudio, { stiffness: 150, damping: 24, mass: 0.25 });

  useEffect(() => {
    rawAudio.set(clamp(audioLevel, 0, 1));
  }, [audioLevel, rawAudio]);

  useMotionValueEvent(smoothAudio, 'change', (latest) => {
    audioRef.current = latest;
  });

  useAnimationFrame((time) => {
    if (prefersReducedMotion) return;

    const audio = state === 'listening' || state === 'speaking' ? audioRef.current : 0;
    const stateSpeed = state === 'speaking' ? 0.0024 : state === 'listening' ? 0.0017 : 0.00075;
    const organicWave = Math.sin(time * stateSpeed) * 0.0013 + Math.sin(time * stateSpeed * 0.43) * 0.0007;

    const frequency = config.frequency + organicWave + audio * (state === 'speaking' ? 0.009 : 0.005);
    const displacement =
      config.displacement + audio * (state === 'speaking' ? 24 : 14) + Math.sin(time * stateSpeed * 0.8) * 1.6;

    turbulenceRef.current?.setAttribute('baseFrequency', `${frequency} ${frequency * 1.08}`);
    displacementRef.current?.setAttribute('scale', displacement.toFixed(2));
  });

  const isReactive = state === 'listening' || state === 'speaking';
  const animatedScale = config.scale + (isReactive ? audioRef.current * 0.045 : 0);

  const fluidFilterId = `nova-fluid-${generatedId}`;
  const softBlurId = `nova-soft-blur-${generatedId}`;
  const innerBlurId = `nova-inner-blur-${generatedId}`;
  const clipId = `nova-clip-${generatedId}`;

  const mainGradientId = `nova-main-gradient-${generatedId}`;
  const blushGradientId = `nova-blush-gradient-${generatedId}`;
  const blueGradientId = `nova-blue-gradient-${generatedId}`;
  const pearlGradientId = `nova-pearl-gradient-${generatedId}`;
  const ringGradientId = `nova-ring-gradient-${generatedId}`;

  return (
    <motion.div
      data-testid="voice-orb"
      data-orb-state={state}
      className={cn('relative', className)}
      animate={{ scale: prefersReducedMotion ? 1 : animatedScale, filter: `brightness(${config.brightness})` }}
      transition={{ scale: { duration: 0.55, ease: [0.22, 1, 0.36, 1] }, filter: { duration: 0.5 } }}
      style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}
    >
      <svg width="100%" height="100%" viewBox="0 0 240 240" fill="none" style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <filter id={fluidFilterId} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feTurbulence
              ref={turbulenceRef}
              type="fractalNoise"
              baseFrequency={`${config.frequency} ${config.frequency * 1.08}`}
              numOctaves={3}
              seed={18}
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation={0.6} result="softNoise" />
            <feDisplacementMap
              ref={displacementRef}
              in="SourceGraphic"
              in2="softNoise"
              scale={config.displacement}
              xChannelSelector="R"
              yChannelSelector="B"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={0.35} result="smoothed" />
            <feComposite in="smoothed" in2="SourceGraphic" operator="over" />
          </filter>

          <filter id={softBlurId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={10} />
          </filter>

          <filter id={innerBlurId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={17} />
          </filter>

          <clipPath id={clipId}>
            <circle cx={120} cy={120} r={101} />
          </clipPath>

          <radialGradient
            id={mainGradientId}
            cx={0}
            cy={0}
            r={1}
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(98 89) rotate(47) scale(146)"
          >
            <stop offset={0} stopColor={PALETTE.pearl} />
            <stop offset={0.25} stopColor={PALETTE.blush} stopOpacity={0.96} />
            <stop offset={0.52} stopColor={PALETTE.lavender} stopOpacity={0.9} />
            <stop offset={0.75} stopColor={PALETTE.blue} stopOpacity={0.86} />
            <stop offset={1} stopColor={PALETTE.champagne} stopOpacity={0.72} />
          </radialGradient>

          <radialGradient id={blushGradientId}>
            <stop offset={0} stopColor={PALETTE.blush} stopOpacity={0.96} />
            <stop offset={0.48} stopColor={PALETTE.lavender} stopOpacity={0.65} />
            <stop offset={1} stopColor={PALETTE.lavender} stopOpacity={0} />
          </radialGradient>

          <radialGradient id={blueGradientId}>
            <stop offset={0} stopColor={PALETTE.blue} stopOpacity={0.92} />
            <stop offset={0.46} stopColor={PALETTE.pearl} stopOpacity={0.44} />
            <stop offset={1} stopColor={PALETTE.blue} stopOpacity={0} />
          </radialGradient>

          <radialGradient id={pearlGradientId}>
            <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.94} />
            <stop offset={0.38} stopColor={PALETTE.pearl} stopOpacity={0.62} />
            <stop offset={1} stopColor={PALETTE.pearl} stopOpacity={0} />
          </radialGradient>

          <linearGradient id={ringGradientId} x1={45} y1={51} x2={197} y2={199} gradientUnits="userSpaceOnUse">
            <stop stopColor={PALETTE.pearl} stopOpacity={0} />
            <stop offset={0.38} stopColor={PALETTE.lavender} stopOpacity={0.42} />
            <stop offset={0.68} stopColor={PALETTE.blue} stopOpacity={0.38} />
            <stop offset={1} stopColor={PALETTE.champagne} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Very restrained atmospheric shadow */}
        <motion.circle
          cx={120}
          cy={125}
          r={92}
          fill={PALETTE.lavender}
          opacity={0.1}
          filter={`url(#${softBlurId})`}
          animate={prefersReducedMotion ? undefined : { scale: [0.96, 1.035, 0.98], opacity: [0.07, 0.13, 0.08] }}
          transition={{ duration: config.duration * 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '120px 120px' }}
        />

        {/* Speaking waves */}
        {state === 'speaking' && !prefersReducedMotion && (
          <>
            <motion.circle
              cx={120}
              cy={120}
              r={98}
              stroke={`url(#${ringGradientId})`}
              strokeWidth={1.6}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: [0.95, 1.13, 1.22], opacity: [0, 0.28, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              style={{ transformOrigin: '120px 120px' }}
            />
            <motion.circle
              cx={120}
              cy={120}
              r={98}
              stroke={`url(#${ringGradientId})`}
              strokeWidth={1}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: [0.95, 1.1, 1.19], opacity: [0, 0.2, 0] }}
              transition={{ duration: 2.4, delay: 1.15, repeat: Infinity, ease: 'easeOut' }}
              style={{ transformOrigin: '120px 120px' }}
            />
          </>
        )}

        {/* Main displaced organic shape */}
        <motion.path
          initial={{ d: BLOB_PATHS[0] }}
          fill={`url(#${mainGradientId})`}
          filter={`url(#${fluidFilterId})`}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  d: BLOB_PATHS,
                  scale:
                    state === 'connecting'
                      ? [1, 0.95, 1]
                      : state === 'speaking'
                        ? [0.99, 1.035, 0.985, 1.02]
                        : [0.985, 1.015, 0.99],
                  rotate: state === 'speaking' ? [0, 2.4, -1.8, 0] : [0, 1.1, -0.8, 0],
                }
          }
          transition={{
            d: { duration: config.duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
            scale: { duration: state === 'connecting' ? 1.65 : config.duration * 0.7, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: config.duration * 1.35, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{ transformOrigin: '120px 120px' }}
        />

        {/* Moving internal colour field */}
        <g clipPath={`url(#${clipId})`}>
          <motion.circle
            cx={78}
            cy={83}
            r={82}
            fill={`url(#${blushGradientId})`}
            filter={`url(#${innerBlurId})`}
            style={{ mixBlendMode: 'screen', transformOrigin: '78px 83px' }}
            animate={
              prefersReducedMotion
                ? undefined
                : {
                    x: state === 'connecting' ? [0, 27, 18, 0] : [0, 28, -10, 0],
                    y: state === 'connecting' ? [0, 30, 20, 0] : [0, -15, 22, 0],
                    scale: state === 'connecting' ? [1, 0.72, 0.88, 1] : [1, 1.15, 0.92, 1],
                    opacity: [0.72, 0.95, 0.76, 0.72],
                  }
            }
            transition={{ duration: 8 / config.innerSpeed, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.circle
            cx={168}
            cy={144}
            r={88}
            fill={`url(#${blueGradientId})`}
            filter={`url(#${innerBlurId})`}
            style={{ mixBlendMode: 'screen', transformOrigin: '168px 144px' }}
            animate={
              prefersReducedMotion
                ? undefined
                : {
                    x: state === 'connecting' ? [0, -27, -18, 0] : [0, -26, 10, 0],
                    y: state === 'connecting' ? [0, -25, -16, 0] : [0, 17, -20, 0],
                    scale: state === 'connecting' ? [1, 0.76, 0.9, 1] : [0.98, 1.12, 0.94, 0.98],
                    opacity: [0.7, 0.93, 0.74, 0.7],
                  }
            }
            transition={{ duration: 9.5 / config.innerSpeed, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.circle
            cx={121}
            cy={108}
            r={57}
            fill={`url(#${pearlGradientId})`}
            filter={`url(#${innerBlurId})`}
            style={{ mixBlendMode: 'screen', transformOrigin: '121px 108px' }}
            animate={
              prefersReducedMotion
                ? undefined
                : {
                    x: [0, 14, -11, 0],
                    y: [0, -14, 10, 0],
                    scale: state === 'speaking' ? [0.88, 1.18, 0.94, 1.12] : [0.92, 1.12, 0.96, 0.92],
                    opacity: state === 'speaking' ? [0.5, 0.9, 0.62, 0.84] : [0.48, 0.75, 0.56, 0.48],
                  }
            }
            transition={{ duration: 6.5 / config.innerSpeed, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Soft reflective highlight */}
          <motion.ellipse
            cx={89}
            cy={70}
            rx={44}
            ry={28}
            fill="#FFFFFF"
            opacity={0.16}
            filter={`url(#${softBlurId})`}
            animate={
              prefersReducedMotion
                ? undefined
                : { x: [0, 18, 5, 0], y: [0, 8, -5, 0], rotate: [0, 10, -5, 0], opacity: [0.1, 0.22, 0.13, 0.1] }
            }
            transition={{ duration: 8.5 / config.innerSpeed, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '89px 70px' }}
          />
        </g>

        {/* Fine surface definition */}
        <motion.path
          initial={{ d: BLOB_PATHS[1] }}
          fill="none"
          stroke={`url(#${ringGradientId})`}
          strokeWidth={1.1}
          opacity={0.38}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  d: [BLOB_PATHS[1], BLOB_PATHS[2], BLOB_PATHS[0], BLOB_PATHS[1]],
                  opacity: state === 'speaking' ? [0.26, 0.5, 0.3] : [0.23, 0.4, 0.23],
                }
          }
          transition={{ duration: config.duration * 1.05, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>

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
    </motion.div>
  );
}
