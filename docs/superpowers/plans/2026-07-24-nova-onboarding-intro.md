# Nova Onboarding Intro Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first screen of the "Jewelry Brand" onboarding modal with a Nova introduction screen (orb + voice/text choice), while leaving the existing brand-details form and bespoke card preview otherwise untouched.

**Architecture:** Two new presentational components (`VoiceOrb`, `NovaIntroPanel`) added under `src/components/brand/`, composed into the existing `JewelryBrandModal.tsx` via a new `step` state (`'intro' | 'voice' | 'text' | 'form'`, default `'intro'`). The right-hand `BrandCard` column is never modified. `voice` and `text` are dead-end states for this task — nothing transitions to `'form'` yet.

**Tech Stack:** React + TypeScript, Tailwind CSS (semantic tokens + `DARK_THEMES` branching), Framer Motion (already a dependency), Vitest + Testing Library.

## Global Constraints

- Copy is verbatim, do not alter: eyebrow `MEET NOVA`, subhead `Your creative consultant for a more tailored FormaNova experience.`, name block `Nova` / `Creative Consultant`, line `Let's make FormaNova feel more tailored to your brand.`, primary CTA `Talk to Nova`, secondary action `Continue without voice`.
- Do not use as the orb/avatar: a microphone, a human face, robot imagery, sparkle icons, AI emojis, neon gradients, or generic futuristic visuals. No particles, no liquid distortion, no heavy blur.
- Orb tones: pearl, ivory, champagne, blush, and cool-blue, mapped so the same conceptual palette holds across all 12 themes (light-family: literal hex values; dark-family, per `DARK_THEMES` in `src/components/ThemeLogo.tsx`: CSS-variable tokens).
- Animation states required on the orb: `idle` (slow breathing + gradient drift), `hover` (subtle scale-up), `connecting` (gentle rotation/highlight sweep), `speaking` (internal waves + restrained side waveform), `listening` (slower pulse + brighter glow). All calm/slow, no snappy easing.
- Do not show on this screen or its `voice`/`text` sub-states: URL input, scanner states, live insights, editable fields, call controls, progress bars, status footers, extra helper copy.
- `BrandCard` (`src/components/brand/BrandCard.tsx`) and its props are out of scope — do not modify.
- No new npm dependency — Framer Motion is already installed.
- Follow `AI_RULES.md` file-size/concern-boundary rule: keep the orb, the intro panel, and the modal-orchestration logic in separate files.
- Assets rule (`CLAUDE.md`): if any new raster image asset is added, it must be `.webp`. (This plan uses no new image assets — SVG only.)

---

### Task 1: `VoiceOrb` component

**Files:**
- Create: `src/components/brand/VoiceOrb.tsx`
- Test: `src/components/brand/VoiceOrb.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `src/contexts/ThemeContext.tsx` (returns `{ theme: ThemeName }`); `DARK_THEMES` (a `Set<string>`) from `src/components/ThemeLogo.tsx`.
- Produces: `export type OrbState = 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening'` and `export function VoiceOrb({ state, className }: { state: OrbState; className?: string })`. Task 2 imports both.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/brand/VoiceOrb.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { VoiceOrb } from '@/components/brand/VoiceOrb';

function renderOrb(state: 'idle' | 'hover' | 'connecting' | 'speaking' | 'listening') {
  return render(
    <ThemeProvider>
      <VoiceOrb state={state} />
    </ThemeProvider>,
  );
}

describe('VoiceOrb', () => {
  it('renders the orb with the given state', () => {
    renderOrb('idle');
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', 'idle');
  });

  it('renders the side waveform only in the speaking state', () => {
    renderOrb('speaking');
    expect(screen.getByTestId('voice-orb-waveform')).toBeInTheDocument();
  });

  it('does not render the waveform in the idle state', () => {
    renderOrb('idle');
    expect(screen.queryByTestId('voice-orb-waveform')).not.toBeInTheDocument();
  });

  it('does not render the waveform in the listening state', () => {
    renderOrb('listening');
    expect(screen.queryByTestId('voice-orb-waveform')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/brand/VoiceOrb.test.tsx`
Expected: FAIL — `Cannot find module '@/components/brand/VoiceOrb'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/brand/VoiceOrb.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/brand/VoiceOrb.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/brand/VoiceOrb.tsx src/components/brand/VoiceOrb.test.tsx
git commit -m "feat(brand): add VoiceOrb animated orb component"
```

---

### Task 2: `NovaIntroPanel` component

**Files:**
- Create: `src/components/brand/NovaIntroPanel.tsx`
- Test: `src/components/brand/NovaIntroPanel.test.tsx`

**Interfaces:**
- Consumes: `VoiceOrb` and `type OrbState` from Task 1 (`src/components/brand/VoiceOrb.tsx`); `useTheme()`/`DARK_THEMES` as in Task 1; `cn` from `@/lib/utils`.
- Produces: `export type NovaLeftStep = 'intro' | 'voice' | 'text'` and `export function NovaIntroPanel({ step, onSelectVoice, onSelectText }: { step: NovaLeftStep; onSelectVoice: () => void; onSelectText: () => void })`. Task 3 imports both, plus extends `NovaLeftStep` with `'form'` for its own local step union.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/brand/NovaIntroPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { NovaIntroPanel } from '@/components/brand/NovaIntroPanel';

function renderPanel(step: 'intro' | 'voice' | 'text', onSelectVoice = vi.fn(), onSelectText = vi.fn()) {
  render(
    <ThemeProvider>
      <NovaIntroPanel step={step} onSelectVoice={onSelectVoice} onSelectText={onSelectText} />
    </ThemeProvider>,
  );
  return { onSelectVoice, onSelectText };
}

describe('NovaIntroPanel', () => {
  it('renders the intro copy and both CTAs on the intro step', () => {
    renderPanel('intro');
    expect(screen.getByText('Meet Nova')).toBeInTheDocument();
    expect(
      screen.getByText('Your creative consultant for a more tailored FormaNova experience.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('Creative Consultant')).toBeInTheDocument();
    expect(
      screen.getByText("Let's make FormaNova feel more tailored to your brand."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Talk to Nova' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without voice' })).toBeInTheDocument();
  });

  it('calls onSelectVoice when Talk to Nova is clicked', async () => {
    const { onSelectVoice } = renderPanel('intro');
    screen.getByRole('button', { name: 'Talk to Nova' }).click();
    expect(onSelectVoice).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectText when Continue without voice is clicked', async () => {
    const { onSelectText } = renderPanel('intro');
    screen.getByRole('button', { name: 'Continue without voice' }).click();
    expect(onSelectText).toHaveBeenCalledTimes(1);
  });

  it('renders the spoken caption and no CTAs on the voice step', () => {
    renderPanel('voice');
    expect(screen.getByTestId('nova-voice-caption')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });

  it('renders the chat message and no CTAs on the text step', () => {
    renderPanel('text');
    expect(screen.getByTestId('nova-text-message')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/brand/NovaIntroPanel.test.tsx`
Expected: FAIL — `Cannot find module '@/components/brand/NovaIntroPanel'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/brand/NovaIntroPanel.tsx
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { cn } from '@/lib/utils';
import { VoiceOrb, type OrbState } from '@/components/brand/VoiceOrb';

export type NovaLeftStep = 'intro' | 'voice' | 'text';

interface NovaIntroPanelProps {
  step: NovaLeftStep;
  onSelectVoice: () => void;
  onSelectText: () => void;
}

const INTRO_LINE = "Hi, I'm Nova. Let's make FormaNova feel more tailored to your brand.";

export function NovaIntroPanel({ step, onSelectVoice, onSelectText }: NovaIntroPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const [orbHovered, setOrbHovered] = useState(false);

  let orbState: OrbState = 'idle';
  if (step === 'voice') orbState = 'speaking';
  else if (step === 'text') orbState = 'listening';
  else if (orbHovered) orbState = 'hover';

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <p className="font-card text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Meet Nova
      </p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
        Your creative consultant for a more tailored FormaNova experience.
      </p>

      <div
        className="mt-8"
        onMouseEnter={() => setOrbHovered(true)}
        onMouseLeave={() => setOrbHovered(false)}
      >
        <VoiceOrb state={orbState} />
      </div>

      <h2 className="mt-6 font-display text-3xl text-foreground sm:text-4xl">Nova</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Creative Consultant</p>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
        Let's make FormaNova feel more tailored to your brand.
      </p>

      {step === 'intro' && (
        <div className="mt-8 flex w-full max-w-xs flex-col items-center gap-4">
          <button
            type="button"
            onClick={onSelectVoice}
            className={cn(
              'w-full py-4 text-sm font-medium transition-colors',
              isDark
                ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
                : 'bg-foreground text-background hover:opacity-90',
            )}
          >
            Talk to Nova
          </button>
          <button
            type="button"
            onClick={onSelectText}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Continue without voice
          </button>
        </div>
      )}

      {step === 'voice' && (
        <p
          data-testid="nova-voice-caption"
          className="mt-8 max-w-sm animate-fade-in text-sm italic leading-relaxed text-muted-foreground"
        >
          {INTRO_LINE}
        </p>
      )}

      {step === 'text' && (
        <div
          data-testid="nova-text-message"
          className="mt-8 w-full max-w-sm animate-fade-in border border-border bg-background px-4 py-3 text-left text-sm leading-relaxed text-foreground"
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nova
          </p>
          {INTRO_LINE}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/brand/NovaIntroPanel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/brand/NovaIntroPanel.tsx src/components/brand/NovaIntroPanel.test.tsx
git commit -m "feat(brand): add NovaIntroPanel with voice/text choice"
```

---

### Task 3: Wire `NovaIntroPanel` into `JewelryBrandModal`

**Files:**
- Modify: `src/components/JewelryBrandModal.tsx:1-10` (imports), `:70-73` (state), `:202-473` (render)
- Test: `src/components/JewelryBrandModal.test.tsx`

**Interfaces:**
- Consumes: `NovaIntroPanel`, `type NovaLeftStep` from Task 2 (`src/components/brand/NovaIntroPanel.tsx`).
- Produces: no new exports — this task only changes `JewelryBrandModal`'s internal rendering. Nothing later depends on new symbols from this task.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/JewelryBrandModal.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';

vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));

function renderModal() {
  return render(
    <ThemeProvider>
      <JewelryBrandModal
        open
        onClose={vi.fn()}
        onContinue={vi.fn()}
        source="onboarding"
      />
    </ThemeProvider>,
  );
}

describe('JewelryBrandModal', () => {
  it('opens on the Nova intro step, not the brand-details form', () => {
    renderModal();
    expect(screen.getByText('Meet Nova')).toBeInTheDocument();
    expect(screen.queryByText('Tell us about your jewelry brand')).not.toBeInTheDocument();
  });

  it('shows the spoken caption after choosing Talk to Nova, and hides the intro CTAs', () => {
    renderModal();
    screen.getByRole('button', { name: 'Talk to Nova' }).click();
    expect(screen.getByTestId('nova-voice-caption')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk to Nova' })).not.toBeInTheDocument();
  });

  it('shows the chat message after choosing Continue without voice, and hides the intro CTAs', () => {
    renderModal();
    screen.getByRole('button', { name: 'Continue without voice' }).click();
    expect(screen.getByTestId('nova-text-message')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue without voice' })).not.toBeInTheDocument();
  });

  it('still renders the bespoke card stage on the intro step', () => {
    renderModal();
    expect(screen.getByText('Your Bespoke Card')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/JewelryBrandModal.test.tsx`
Expected: FAIL — first test fails because today the modal renders "Tell us about your jewelry brand" immediately (no "Meet Nova" text yet).

- [ ] **Step 3: Add the import and step state**

In `src/components/JewelryBrandModal.tsx`, add the import after the existing `BrandBookUpload` import (line 10):

```tsx
import { BrandBookUpload } from '@/components/brand/BrandBookUpload';
import { NovaIntroPanel, type NovaLeftStep } from '@/components/brand/NovaIntroPanel';
```

Add the step state right after the `autoBothShown` ref declaration (after line 108, before the `overlayRef` declaration):

```tsx
  const [step, setStep] = useState<NovaLeftStep | 'form'>('intro');
```

- [ ] **Step 4: Replace the left column with the step branch**

Replace this block (current lines 224-439):

```tsx
            {/* Form */}
            <div className="order-2 lg:order-1 lg:pr-10">
              <h2 className="font-display text-3xl text-foreground sm:text-4xl">
                Tell us about your jewelry brand
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The more we know about your brand, the more bespoke your FormaNova experience becomes.
              </p>

              <div className="mt-8 space-y-6">
```

with:

```tsx
            {/* Left column: Nova intro/voice/text, or (once wired) the brand form */}
            <div className="order-2 lg:order-1 lg:pr-10">
            {step === 'form' ? (
              <>
              <h2 className="font-display text-3xl text-foreground sm:text-4xl">
                Tell us about your jewelry brand
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The more we know about your brand, the more bespoke your FormaNova experience becomes.
              </p>

              <div className="mt-8 space-y-6">
```

Then find the closing of that same column (current lines 436-439):

```tsx
            </button>
              </div>
            </div>

            {/* Live bespoke card stage */}
```

and replace with:

```tsx
            </button>
              </div>
              </>
            ) : (
              <NovaIntroPanel
                step={step}
                onSelectVoice={() => setStep('voice')}
                onSelectText={() => setStep('text')}
              />
            )}
            </div>

            {/* Live bespoke card stage */}
```

This wraps the existing `form` JSX (unchanged) in a `step === 'form'` branch and renders `NovaIntroPanel` for every other step, without touching the `BrandCard` column that follows.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/JewelryBrandModal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: All existing tests still PASS (no other file references the replaced JSX block or assumes the form renders immediately).

- [ ] **Step 7: Commit**

```bash
git add src/components/JewelryBrandModal.tsx src/components/JewelryBrandModal.test.tsx
git commit -m "feat(brand): show Nova intro before the jewelry-brand form"
```

---

### Task 4: Manual cross-theme QA in the browser

**Files:** none (verification only, per `CLAUDE.md`'s requirement to check UI changes in a real browser before reporting done)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — serves on http://localhost:8080

- [ ] **Step 2: Open the role picker and trigger the modal**

Navigate to the route that renders `RolePicker` (sign-up/onboarding flow), select "Jewelry Brand," and confirm the modal now opens on the Nova intro screen (not the form) with:
- Equal 50/50 split, orb centered on the left, bespoke card unchanged on the right.
- No URL input, scanner state, progress bar, or status footer visible.

- [ ] **Step 3: Exercise both CTAs**

- Click "Talk to Nova": orb should animate through `connecting` briefly into a calm `speaking` motion (internal wave + side waveform), and the caption line should fade in. No CTAs should remain visible.
- Reopen the modal (or reload), click "Continue without voice": the chat-bubble message should fade in with the "Nova" label, orb calm, no CTAs visible.

- [ ] **Step 4: Check theme consistency**

Using the app's theme switcher, check at minimum: `light`, `dark`, and `fashion` ("Stark Black & Gold" — the most literal black-controls/gold-accent theme). Confirm the orb palette shifts sensibly (pearl/ivory/champagne/blush on light, cooler CSS-variable tones on dark) and never renders a jarring neon flash, broken layout, or invisible text in any of them.

- [ ] **Step 5: Check responsiveness**

Resize to a mobile width (e.g. 375px) and a tablet width (e.g. 768px). Confirm the two-column grid collapses to a single stacked column (existing `lg:grid-cols-[...]` behavior) with the orb/CTA content above the bespoke card, no overflow, and buttons keep full-width tap targets.

- [ ] **Step 6: Confirm no console errors**

Check the browser devtools console for errors/warnings introduced by this change (Framer Motion warnings, missing keys, etc.) across the states exercised in Steps 2-4.

No commit for this task — it's a verification gate. If any issue is found, return to the relevant task above, fix it, and re-run that task's tests before re-verifying here.

---

## Self-Review Notes

- **Spec coverage:** Layout (Task 3), left-panel copy/CTAs (Task 2), orb behavior/palette (Task 1), interaction/dead-end states (Tasks 2-3), right-panel untouched (Task 3 step 4 explicitly leaves `BrandCard` alone), "do not show" list (verified in Task 4 manual QA + implicitly by Task 2/3 not rendering any of those elements), theme consistency (Task 1 palette branch + Task 4 manual check), testing (Tasks 1-3 each ship with their own Vitest coverage per AI_RULES's testing section, even though none of the mandatory categories strictly apply).
- **Placeholder scan:** No TBD/TODO; all steps contain complete, runnable code.
- **Type consistency:** `OrbState` (Task 1) is the type of `VoiceOrb`'s `state` prop and is re-used inside `NovaIntroPanel` (Task 2) to compute `orbState`. `NovaLeftStep` (Task 2) is `'intro' | 'voice' | 'text'` and is exactly the type of `NovaIntroPanel`'s `step` prop; `JewelryBrandModal` (Task 3) extends it locally to `NovaLeftStep | 'form'` for its own `step` state, matching the design's `NovaStep` union without redefining `NovaLeftStep` elsewhere.
