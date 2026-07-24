# Nova Onboarding Intro Screen — Design

## Summary

Replace the current first screen of the "Jewelry Brand" onboarding modal (today: a form appears immediately) with a new Nova introduction screen. This screen introduces "Nova," FormaNova's creative-consultant persona, and lets the user choose to proceed by voice or by text. It must look like a native part of the FormaNova product, not a bolted-on AI widget, and must stay visually consistent across all 12 UI themes.

This spec covers **only** the intro screen and its two hardcoded, dead-end transition states (`voice`, `text`). It does not build a URL-scanning step, live insights, or any continuation of the onboarding flow beyond this screen — that is explicitly out of scope and left for a future spec.

## Current state (from codebase research)

- `src/pages/RolePicker.tsx` — role-selection screen. Selecting "Jewelry Brand" opens `JewelryBrandModal` with `source="onboarding"`.
- `src/components/JewelryBrandModal.tsx` — the modal in question. Currently renders the brand-details form immediately, in a `grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]` layout: form on the left (`order-2 lg:order-1`), `BrandCard` live preview on the right (`order-1 lg:order-2`, sticky).
- `src/components/brand/BrandCard.tsx` — the landscape bespoke card (Front/Back tabs, FormaNova logo, cream template, placeholder pendant image). Already reads `websiteUrl` etc. from the form to live-update. **Untouched by this work.**
- `src/contexts/ThemeContext.tsx` + `src/index.css` — 12 themes via `data-theme` attribute and CSS variable tokens (`--foreground`, `--card`, `--primary`, `--formanova-glow`, `--formanova-hero-accent`, `--border`, etc.), mapped into Tailwind (`tailwind.config.ts`).
- `src/components/ThemeLogo.tsx` — defines `DARK_THEMES = {dark, cyberpunk, retro, fashion, luxury, synthwave, neon}`, used to branch behavior that can't be pure CSS-variable-driven (asset swaps, hardcoded palette branches).
- `src/components/brand/BrandCard.tsx` (lines ~185-202) — the precedent for "hardcoded literal palette for light themes, CSS-variable palette for dark themes," used because the cream card must stay cream regardless of which light-family theme is active. The Nova orb follows the same pattern.
- Framer Motion is already a dependency (`package.json`), used in ~32 files. No existing "orb" component; closest precedent is `src/components/FloatingElements.tsx` (blurred CSS blob shapes, ambient background use, not a defined orb).
- No scanner/live-insight/URL-scanning feature exists anywhere in the codebase today.

## Architecture

`JewelryBrandModal.tsx` becomes an orchestration shell:

```ts
type NovaStep = "intro" | "voice" | "text" | "form";
const [step, setStep] = useState<NovaStep>("intro");
```

- The existing 50/50 grid layout is kept. The right column (`BrandCard` + `BrandCardFaceToggle`) renders unchanged for every step — it is never touched by this work.
- The left column renders `NovaIntroPanel` for `step` in `{"intro", "voice", "text"}`, and today's existing form JSX for `step === "form"`.
- Nothing in this task transitions `step` to `"form"` — that branch is preserved as-is (dead code path for now) so a future task can wire the real continuation without re-touching this screen.

### New files

- `src/components/brand/NovaIntroPanel.tsx` — presentational component for the left column. Props:
  ```ts
  interface NovaIntroPanelProps {
    step: "intro" | "voice" | "text";
    onSelectVoice: () => void;
    onSelectText: () => void;
  }
  ```
  Renders: eyebrow, subhead, `VoiceOrb`, name block, supporting line, and (only in `step === "intro"`) the two CTAs. In `step === "voice"`, renders the orb in `speaking` state plus an animated caption line. In `step === "text"`, renders the orb at rest plus a chat-bubble-styled message with the same line. No internal data fetching, no timers beyond local Framer Motion animation and one short state-machine delay (see Interaction below).

- `src/components/brand/VoiceOrb.tsx` — the animated orb. Props:
  ```ts
  interface VoiceOrbProps {
    state: "idle" | "hover" | "connecting" | "speaking" | "listening";
  }
  ```
  Pure/controlled: given a `state`, renders the matching Framer Motion variant. No internal timers or business logic — the parent (`NovaIntroPanel`) owns state transitions.

### Modified files

- `src/components/JewelryBrandModal.tsx` — add `step` state, branch left-column rendering, wire `onSelectVoice`/`onSelectText` callbacks. No changes to the existing form JSX or to any props passed to `BrandCard`.

## Interaction / state machine

- **`intro`**: `VoiceOrb state="idle"`, hover over the orb only (not the whole panel) sets `"hover"`. Two CTAs shown: "Talk to Nova" (primary button) and "Continue without voice" (secondary text action).
- **Click "Talk to Nova"** → `step = "voice"`. Orb goes `idle → connecting` (~600ms) `→ speaking`, staying in `speaking` thereafter. A short hardcoded caption line renders under/beside the orb, fading in — the visual simulation of "Nova talking." No microphone access, no audio playback, no call controls.
- **Click "Continue without voice"** → `step = "text"`. Orb stays calm (`idle`/`listening`), and the same intro line renders as a chat-bubble message (small "Nova" label, left-aligned) in the left panel instead of a spoken caption.
- Both `voice` and `text` are **dead ends** for this task: no timer advances further, no URL input appears, no additional button renders. This is intentional — the continuation is future work.
- The right-hand `BrandCard` never changes across any of these steps.

## Copy (verbatim — do not alter)

- Eyebrow: `MEET NOVA`
- Subhead: `Your creative consultant for a more tailored FormaNova experience.`
- Name block: `Nova` / `Creative Consultant`
- Supporting line: `Let's make FormaNova feel more tailored to your brand.`
- Primary CTA: `Talk to Nova`
- Secondary action: `Continue without voice`

(Confirmed with user: keep this wording as-is, no Krug-style rewrite.)

## Visual requirements

**Do not use** as the orb/avatar: a microphone, a human face, robot imagery, sparkle icons, AI emojis, neon gradients, or generic futuristic visuals. No particles, no liquid distortion, no heavy blur.

**Orb construction**: layered SVG —
1. Outer soft-blur glow circle, low opacity, theme-mapped gradient.
2. Inner gradient-filled circle using pearl / ivory / champagne / blush / cool-blue tones.
3. Thin ring accent at low opacity using the `formanova-hero-accent` gold token, for the "premium jewelry" touch.

**Theme consistency**: define the gradient stops as a local palette object inside `VoiceOrb.tsx`, branching on `DARK_THEMES.has(theme)` — same pattern as `BrandCard.tsx`:
- Light-family themes: literal pearl/ivory/champagne/blush hex palette (matches spec exactly, doesn't drift per light theme).
- Dark-family themes: the same conceptual palette shifted toward cooler/deeper tonal equivalents (via CSS-variable tokens), so the orb reads as "the same orb" and never inverts into a jarring neon look under `cyberpunk`, `synthwave`, etc.

**Animation states** (Framer Motion `variants`, all calm/slow — no snappy easing):
- `idle`: slow breathing scale (~4-6s loop) + very subtle gradient drift.
- `hover`: small scale-up (~1.03-1.05x), quick transition.
- `connecting`: gentle rotation or a moving highlight sweep around the ring.
- `speaking`: subtle internal wave motion + a restrained side waveform (a handful of small animated bars, not a full audio-visualizer).
- `listening`: slower pulse, slightly brighter outer glow.

**Layout**: large centered modal, equal 50/50 split, matching current spacing/borders/typography/cream background/black controls/gold accents. Left panel content is vertically centered around the orb. No URL input, scanner state, live insights, editable fields, call controls, progress bars, status footers, or extra helper copy anywhere on this screen or its two sub-states.

## Testing

No auth/session, API client, credit-preflight, polling/retry, or result-parsing code is touched, so none of AI_RULES's mandatory test categories apply. A Vitest test file will still be added for the new behavior:

`src/components/brand/NovaIntroPanel.test.tsx`:
- Renders intro copy (`MEET NOVA`, subhead, name block, supporting line, both CTAs) when `step="intro"`.
- Clicking "Talk to Nova" calls `onSelectVoice`.
- Clicking "Continue without voice" calls `onSelectText`.
- `step="voice"` renders the caption line and does not render the CTAs.
- `step="text"` renders the chat-bubble message and does not render the CTAs.

No test is needed for `JewelryBrandModal`'s `BrandCard` props remaining unchanged across steps, since `BrandCard` itself is not modified or re-wired by this change — its props already come from form state that this task doesn't touch.

## Explicitly out of scope

- URL input / scanning / live insights / editable fields — no such feature exists today; not built here.
- Any transition into `step === "form"` — the existing form remains reachable only via its current unmodified code path (this task doesn't wire a new entry into it).
- Real voice (speech-to-text/text-to-speech, microphone access, call controls) — this is a hardcoded visual simulation only, per the prototype instruction.
- Progress bars / status footers — explicitly excluded from this screen.
