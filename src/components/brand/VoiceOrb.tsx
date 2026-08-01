import { motion, useReducedMotion } from 'framer-motion';
import { CSSProperties, useId } from 'react';

export type VoiceOrbState = 'idle' | 'connecting' | 'listening' | 'speaking';

interface VoiceOrbProps {
  state?: VoiceOrbState;
  size?: number;
  audioLevel?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

const FILAMENTS = [
  { d: 'M18 178 C55 128 91 218 132 179 C174 139 196 119 231 157 C260 188 282 190 306 160', opacity: 0.72, width: 1.15 },
  { d: 'M15 184 C58 138 92 224 137 184 C178 147 202 132 235 164 C267 195 285 190 309 167', opacity: 0.62, width: 1 },
  { d: 'M16 190 C54 151 95 228 141 191 C185 155 205 144 240 173 C271 199 288 194 310 174', opacity: 0.48, width: 0.9 },
  { d: 'M24 166 C64 112 101 211 146 168 C188 127 215 119 247 151 C274 178 293 172 311 145', opacity: 0.58, width: 0.95 },
  { d: 'M26 157 C65 108 105 199 151 158 C194 120 218 111 251 143 C276 168 294 163 310 138', opacity: 0.44, width: 0.8 },
  { d: 'M27 200 C67 167 104 232 148 202 C192 172 219 163 249 184 C275 202 293 201 309 187', opacity: 0.42, width: 0.8 },
  { d: 'M31 207 C74 178 111 235 157 208 C201 181 226 177 255 194 C279 208 297 206 312 196', opacity: 0.32, width: 0.75 },
  { d: 'M35 147 C73 105 111 183 153 150 C195 117 220 106 251 132 C277 153 296 151 311 127', opacity: 0.36, width: 0.75 },
  { d: 'M28 172 C71 140 103 188 141 174 C183 159 203 143 235 158 C270 176 291 173 312 154', opacity: 0.38, width: 0.72 },
  { d: 'M25 195 C65 168 101 210 140 198 C179 186 207 166 242 181 C271 193 291 190 310 176', opacity: 0.34, width: 0.68 },
  { d: 'M37 218 C78 193 111 233 151 220 C195 206 221 195 252 207 C278 218 297 216 310 207', opacity: 0.27, width: 0.65 },
  { d: 'M36 137 C75 103 113 166 153 139 C195 111 222 101 253 122 C277 139 296 138 309 118', opacity: 0.25, width: 0.65 },
];

const PARTICLES = Array.from({ length: 54 }, (_, index) => ({
  x: 43 + ((index * 47) % 234),
  y: 111 + ((index * 31) % 117),
  radius: 0.45 + (index % 4) * 0.22,
  delay: (index % 12) * 0.18,
  duration: 3.5 + (index % 6) * 0.45,
}));

const STATE_SPEED: Record<VoiceOrbState, number> = {
  idle: 10,
  connecting: 4.5,
  listening: 5.5,
  speaking: 3.4,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, '');
}

/**
 * Glass-sphere orb: layered flowing filaments, pearl highlights, a
 * champagne/blush centre and cool-blue iridescence, drifting particles.
 * Deliberately fixed-palette (not theme-token-driven) per the approved
 * reference mockup — no outer shadow, ground shadow, or halo.
 */
export function VoiceOrb({ state = 'idle', size = 320, audioLevel = 0, className, style, onClick }: VoiceOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const uid = cleanId(useId());

  const audio = clamp(audioLevel);
  const speed = STATE_SPEED[state];

  const sphereClipId = `sphere-clip-${uid}`;
  const glassGradientId = `glass-gradient-${uid}`;
  const rimGradientId = `rim-gradient-${uid}`;
  const warmGlowId = `warm-glow-${uid}`;
  const pinkGlowId = `pink-glow-${uid}`;
  const blueGlowId = `blue-glow-${uid}`;
  const filamentGradientId = `filament-gradient-${uid}`;
  const filamentWarmGradientId = `filament-warm-${uid}`;
  const internalBlurId = `internal-blur-${uid}`;
  const mediumBlurId = `medium-blur-${uid}`;
  const highlightBlurId = `highlight-blur-${uid}`;

  const reactiveScale = state === 'speaking' ? 1 + audio * 0.025 : state === 'listening' ? 1 + audio * 0.014 : 1;
  const waveMovement = state === 'speaking' ? 5 + audio * 9 : state === 'listening' ? 3 + audio * 5 : 2;

  return (
    <motion.button
      type="button"
      data-testid="voice-orb"
      data-orb-state={state}
      className={className}
      onClick={onClick}
      disabled={!onClick}
      aria-label="Talk to Nova"
      animate={{ scale: prefersReducedMotion ? 1 : reactiveScale }}
      whileHover={prefersReducedMotion ? undefined : { scale: reactiveScale * 1.018 }}
      whileTap={prefersReducedMotion ? undefined : { scale: reactiveScale * 0.985 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      style={{
        width: size,
        height: size,
        padding: 0,
        border: 0,
        outline: 0,
        display: 'block',
        cursor: onClick ? 'pointer' : 'default',
        background: 'transparent',
        boxShadow: 'none',
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 320 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <clipPath id={sphereClipId}>
            <circle cx="160" cy="160" r="128" />
          </clipPath>

          <radialGradient
            id={glassGradientId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(116 86) rotate(56) scale(222)"
          >
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="0.17" stopColor="#FCF9F6" stopOpacity="0.8" />
            <stop offset="0.42" stopColor="#FAE9DA" stopOpacity="0.34" />
            <stop offset="0.67" stopColor="#F6CDD0" stopOpacity="0.25" />
            <stop offset="0.86" stopColor="#C9DFF0" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.76" />
          </radialGradient>

          <linearGradient id={rimGradientId} x1="68" y1="49" x2="262" y2="274" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="0.18" stopColor="#F9EDE4" stopOpacity="0.8" />
            <stop offset="0.43" stopColor="#F3D2C0" stopOpacity="0.43" />
            <stop offset="0.65" stopColor="#FFFFFF" stopOpacity="0.75" />
            <stop offset="0.82" stopColor="#C8E0EE" stopOpacity="0.56" />
            <stop offset="1" stopColor="#F8D6DB" stopOpacity="0.68" />
          </linearGradient>

          <radialGradient id={warmGlowId}>
            <stop offset="0" stopColor="#FFE2AE" stopOpacity="0.98" />
            <stop offset="0.42" stopColor="#FBCB9F" stopOpacity="0.6" />
            <stop offset="1" stopColor="#FBCB9F" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={pinkGlowId}>
            <stop offset="0" stopColor="#F6B5C2" stopOpacity="0.9" />
            <stop offset="0.48" stopColor="#F6CBD4" stopOpacity="0.54" />
            <stop offset="1" stopColor="#F6CBD4" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={blueGlowId}>
            <stop offset="0" stopColor="#BFDDEC" stopOpacity="0.92" />
            <stop offset="0.42" stopColor="#D9ECF5" stopOpacity="0.55" />
            <stop offset="1" stopColor="#D9ECF5" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={filamentGradientId} x1="24" y1="150" x2="300" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="0.18" stopColor="#FFF7EF" stopOpacity="0.92" />
            <stop offset="0.46" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="0.7" stopColor="#FFF0DC" stopOpacity="0.87" />
            <stop offset="0.88" stopColor="#E8F5FA" stopOpacity="0.86" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.14" />
          </linearGradient>

          <linearGradient id={filamentWarmGradientId} x1="35" y1="183" x2="289" y2="176" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F7CCD0" stopOpacity="0.12" />
            <stop offset="0.25" stopColor="#FFDDB4" stopOpacity="0.75" />
            <stop offset="0.51" stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="0.73" stopColor="#F5CDD5" stopOpacity="0.68" />
            <stop offset="0.9" stopColor="#D7ECF5" stopOpacity="0.7" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.08" />
          </linearGradient>

          <filter id={internalBlurId} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="26" />
          </filter>

          <filter id={mediumBlurId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="11" />
          </filter>

          <filter id={highlightBlurId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Glass body */}
        <circle cx="160" cy="160" r="128" fill={`url(#${glassGradientId})`} />

        <g clipPath={`url(#${sphereClipId})`}>
          {/* Transparent inner atmosphere */}
          <circle cx="160" cy="160" r="126" fill="#FFFDFB" fillOpacity="0.18" />

          {/* Blush region */}
          <motion.ellipse
            cx="104"
            cy="212"
            rx="86"
            ry="73"
            fill={`url(#${pinkGlowId})`}
            filter={`url(#${internalBlurId})`}
            animate={prefersReducedMotion ? undefined : { x: [0, 14, -5, 0], y: [0, -8, 7, 0], scale: [1, 1.08, 0.97, 1] }}
            transition={{ duration: speed * 1.25, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '104px 212px' }}
          />

          {/* Warm champagne centre */}
          <motion.ellipse
            cx="164"
            cy="191"
            rx="97"
            ry="70"
            fill={`url(#${warmGlowId})`}
            filter={`url(#${internalBlurId})`}
            animate={prefersReducedMotion ? undefined : { x: [0, -9, 12, 0], y: [0, 6, -7, 0], scale: [0.98, 1.09, 1, 0.98] }}
            transition={{ duration: speed, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '164px 191px' }}
          />

          {/* Cool blue lower-right region */}
          <motion.ellipse
            cx="231"
            cy="224"
            rx="73"
            ry="62"
            fill={`url(#${blueGlowId})`}
            filter={`url(#${internalBlurId})`}
            animate={prefersReducedMotion ? undefined : { x: [0, -13, 6, 0], y: [0, -6, 8, 0], scale: [1, 1.1, 0.96, 1] }}
            transition={{ duration: speed * 1.18, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '231px 224px' }}
          />

          {/* Main moving filament system */}
          <motion.g
            animate={
              prefersReducedMotion
                ? undefined
                : { x: [-2, 4, -3, -2], y: [-waveMovement, waveMovement, -waveMovement * 0.45, -waveMovement] }
            }
            transition={{ duration: speed, repeat: Infinity, ease: 'easeInOut' }}
          >
            {FILAMENTS.map((filament, index) => (
              <motion.path
                key={filament.d}
                d={filament.d}
                fill="none"
                stroke={index % 3 === 0 ? `url(#${filamentWarmGradientId})` : `url(#${filamentGradientId})`}
                strokeWidth={filament.width}
                strokeLinecap="round"
                opacity={filament.opacity}
                animate={
                  prefersReducedMotion
                    ? undefined
                    : {
                        opacity: [filament.opacity * 0.58, filament.opacity, filament.opacity * 0.7],
                        x: index % 2 === 0 ? [0, 6, 0] : [0, -5, 0],
                      }
                }
                transition={{ duration: speed * (0.72 + index * 0.027), delay: index * 0.07, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </motion.g>

          {/* Brighter central wave ribbons */}
          <motion.path
            d="M17 183 C61 123 96 223 143 177 C185 136 211 129 244 164 C273 195 294 189 311 160"
            fill="none"
            stroke={`url(#${filamentGradientId})`}
            strokeWidth="2.15"
            strokeLinecap="round"
            opacity="0.76"
            filter={`url(#${highlightBlurId})`}
            animate={prefersReducedMotion ? undefined : { y: [-2, 4 + audio * 5, -2], opacity: [0.55, 0.88, 0.55] }}
            transition={{ duration: speed * 0.72, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.path
            d="M24 194 C65 145 100 226 145 191 C190 156 214 148 247 176 C276 200 296 196 311 177"
            fill="none"
            stroke={`url(#${filamentWarmGradientId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.64"
            animate={prefersReducedMotion ? undefined : { y: [3, -4 - audio * 4, 3], opacity: [0.42, 0.78, 0.42] }}
            transition={{ duration: speed * 0.83, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Tiny suspended particles */}
          {PARTICLES.map((particle, index) => (
            <motion.circle
              key={`${particle.x}-${particle.y}`}
              cx={particle.x}
              cy={particle.y}
              r={particle.radius}
              fill="#FFFFFF"
              opacity="0.58"
              animate={
                prefersReducedMotion
                  ? undefined
                  : { y: [0, -3 - (index % 4), 0], opacity: [0.18, 0.88, 0.18], scale: [0.7, 1.35, 0.7] }
              }
              transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}

          {/* Lower iridescent glow */}
          <ellipse cx="165" cy="258" rx="93" ry="28" fill="#F5C8CE" fillOpacity="0.24" filter={`url(#${mediumBlurId})`} />
          <ellipse cx="220" cy="253" rx="59" ry="24" fill="#C9E8F5" fillOpacity="0.28" filter={`url(#${mediumBlurId})`} />
        </g>

        {/* Top glass reflection */}
        <motion.path
          d="M80 112 C95 66 139 40 187 47 C211 50 229 61 243 77 C216 63 190 59 162 63 C127 67 100 84 80 112Z"
          fill="#FFFFFF"
          opacity="0.45"
          filter={`url(#${highlightBlurId})`}
          animate={prefersReducedMotion ? undefined : { opacity: [0.32, 0.56, 0.32], x: [0, 3, 0], y: [0, -2, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Crisp upper reflection */}
        <path d="M75 117 C92 69 130 43 173 41" fill="none" stroke="#FFFFFF" strokeWidth="3.1" strokeLinecap="round" opacity="0.72" />
        <path d="M197 48 C221 55 240 70 251 89" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.52" />

        {/* Glass rim */}
        <circle cx="160" cy="160" r="128" fill="none" stroke={`url(#${rimGradientId})`} strokeWidth="2.4" />
        <circle cx="160" cy="160" r="124.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.36" strokeWidth="0.8" />

        {/* Small glass glints */}
        <motion.g
          animate={prefersReducedMotion ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '239px 189px' }}
        >
          <path
            d="M239 181 C240 187 243 190 249 191 C243 192 240 195 239 201 C238 195 235 192 229 191 C235 190 238 187 239 181Z"
            fill="#FFFFFF"
            opacity="0.9"
          />
        </motion.g>

        <motion.circle
          cx="102"
          cy="83"
          r="2.3"
          fill="#FFFFFF"
          animate={prefersReducedMotion ? undefined : { opacity: [0.3, 1, 0.3], scale: [0.8, 1.35, 0.8] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '102px 83px' }}
        />
      </svg>
    </motion.button>
  );
}
