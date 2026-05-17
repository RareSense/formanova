# Formanova — Claude Code Instructions

Use AI_RULES.md before touching any code at all. These rules are binding; do not bypass them. If there's a conflict of opinion, you can ask the human to verify. But in most cases, it is wise to follow the standardization of AI_RULES.md.

## Commands

```bash
npm run dev        # Development server on port 8080
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build
npx vitest run     # Run all tests
npx vitest run src/path/to/test.test.ts  # Run single test file
```

## Environment Variables

Required in `.env`:
```
VITE_PIPELINE_API_URL=
VITE_PIPELINE_ADMIN_SECRET=
VITE_ADMIN_EMAILS=   # Comma-separated list of admin emails
```

## Asset Rules

- **Always use WebP for images**: All images used in the app must be in `.webp` format. If an asset is provided as `.jpg`, `.jpeg`, or `.png`, convert it to `.webp` first (`cwebp -q 82 input.jpg -o output.webp`) before importing or referencing it. Never import `.jpg`, `.jpeg`, or `.png` files directly in components.

## UI & Design Principles

Follow UX best practices as established by designers like Don Norman:

- **Alignment**: Parallel elements (canvases, containers, cards) must align top and bottom. Never let siblings sit at different vertical positions.
- **Consistent sizing**: Buttons or controls sitting side-by-side must be the same size and height — no mismatched siblings. Example: "New Photoshoot" and "Regenerate" buttons must always be equal size.
- **Justified text**: Use justified text alignment for body copy and descriptive text.
- **No cramped text**: Give text breathing room. Avoid tight padding or lines that feel compressed.
- **No overflowing text**: Text must never overflow its container. Truncate or wrap as needed.
- **Button inner padding**: Button content must never touch the button's outer edge. Always use sufficient horizontal padding (`px-4` minimum, `px-6` for larger buttons) so text and icons have breathing room.
- **Button text centered**: Text or icons inside buttons must always be perfectly centered horizontally and vertically.
- **Dominant CTAs**: For main upload actions, use striking, dominant buttons — not subtle or secondary-styled ones.
- **Popups centered**: Any modal, popup, or dialog must appear centered on screen.
- **Icon consistency**: New icons must match the existing theme — standard, unique, meaningful. Don't introduce random icon styles.
- **New UI must fit the theme**: Anything newly designed must be visually consistent with the rest of the app — colors, spacing, typography, component style.
- **Equidistant grid spacing**: In image grids, vertical and horizontal gaps must be equal for uniform spacing. Use a single `gap-*` class, never separate `gap-x-*` / `gap-y-*` with different values. Parallel columns (e.g. Do / Avoid) must always have the same number of rows so they align top and bottom as a single block.
- **Inline rename UX (Don Norman)**: Editable names must have clear signifiers (pencil icon + hover highlight), explicit Save/Cancel buttons (not silent blur-save), a brief "Saved!" confirmation with a checkmark, and keyboard support (Enter to save, Escape to cancel). The pattern must be consistent across all cards (ModelCard, AssetCard). Never use tiny cramped icons or rely on auto-save without feedback.
- **Upload icon — Diamond**: Always use the lucide-react `Diamond` icon (`h-9 w-9 text-primary`) for upload trigger areas across the app (step one drop zone, My Models upload card, etc.). Never substitute a custom rotated-div or any other icon for upload actions.
- **Cursor affordance (NNG standard)**: `cursor-pointer` (hand) is reserved for links and navigation elements only. Buttons and action controls use the default cursor — their visual design is their affordance. Drop zones and drag targets may use `cursor-pointer`. Never add `cursor-pointer` to `<button>` elements or the base Button component.
- **Cross-device & cross-browser compatibility**: Every UI element must be designed mobile-first using Tailwind responsive prefixes (`sm:`, `md:`, `lg:`). All layouts must be tested and functional across all screen sizes, all major browsers (Chrome, Firefox, Safari, Edge), and all device types (mobile, tablet, desktop). No layout, interaction, or feature may break at any viewport size.

## Code & Engineering Rules

- **Minimal blast radius**: Before fixing a bug or adding a feature, check if it can be done with the smallest possible change. Avoid touching unrelated code. Prefer surgical edits to avoid regressions.

## Architecture Overview

**FormaNova** is a React + TypeScript SPA for AI-powered jewelry image processing and 3D CAD generation.

### Provider Stack

`App.tsx` wraps the app in: `QueryClient → ThemeProvider → AuthProvider → CreditsProvider`

All pages are lazy-loaded (`React.lazy()`). Route guards:
- `ProtectedRoute` — requires authenticated user + valid token
- `AdminRouteGuard` — requires email in `VITE_ADMIN_EMAILS`
- `CADGate` — feature gate for CAD routes (currently always passes)

### State Management

Three Context API providers (no Redux/Zustand):

1. **AuthContext** (`src/contexts/AuthContext.tsx`) — User auth state, Google OAuth flow, token storage in localStorage (`formanova_auth_token`, `formanova_auth_user`). Cross-tab sync via storage events.
2. **ThemeContext** (`src/contexts/ThemeContext.tsx`) — One of 12 themes (light, dark, neon, nostalgia, cutie, cyberpunk, retro, vintage, fashion, kawaii, luxury, synthwave), persisted to localStorage.
3. **CreditsContext** (`src/contexts/CreditsContext.tsx`) — Credit balance, `canAfford(toolName)`, `getToolCost(toolName)`. Tool costs defined in `src/lib/credits-api.ts`.

TanStack Query is used for server state (admin components, generation workflows).

### API Layer

`src/lib/authenticated-fetch.ts` — All authenticated API calls go through this. Attaches the JWT Bearer token and handles 401 redirects (clears localStorage, dispatches an auth state change event, redirects to `/login?redirect=<current_path>`).

**Request chain:** `Browser → nginx (formanova.ai) → Python API backend`

Relative URLs like `/api/run/...` resolve to `formanova.ai/api/run/...` and are reverse-proxied by nginx directly to the Python backend. There are no Supabase edge functions.

### CAD Module Boundaries

Three separate CAD features with strict import boundaries:
- **Text-to-CAD**: `src/components/text-to-cad/` + `src/pages/TextToCAD.tsx`
- **CAD Studio**: `src/components/cad/` + `src/pages/CADStudio.tsx`
- **CAD-to-Catalog**: `src/pages/CADToCatalog.tsx`

**Protected files — do not modify:**
- `src/components/text-to-cad/CADCanvas.tsx` — 3D canvas, GLB loading, mesh selection
- `src/components/cad-studio/materials.ts` — Material definitions (sealed constants)

**Rule:** Non-CAD features must not import from CAD component folders. Shared utilities must live in `src/lib/`.

### Styling

Tailwind CSS with `class`-based dark mode. Custom fonts: Bebas Neue (display), Inter (body), Space Mono (mono). Custom color tokens: `formanova-glow`, `formanova-success`, `formanova-warning`, `formanova-hero-accent`.

TypeScript is configured loosely (`noImplicitAny: false`, `strictNullChecks: false`). Path alias: `@/*` → `./src/*`.

### Feature Flags

`src/lib/feature-flags.ts` controls per-email feature access:
- `isCADEnabled(email)` — always `true`
- `CAD_EDIT_TOOLS_ENABLED` — `false` (Edit/Rebuild tools hidden)
- `CAD_MODEL_SELECTOR_ENABLED` — `false` (model quality selector hidden)
- `isWeightStlEnabled(email)` / `isCadUploadEnabled(email)` — small allow lists

## PostHog Rules

**Architecture: single-file event API.** All PostHog events are defined and exported from `src/lib/posthog-events.ts`. Pages and components import from there — never from `posthog-js` directly. An ESLint rule enforces this and will fail the build if violated.

**Identity init — DO NOT REVERT.** `src/main.tsx` calls `posthog.init()` eagerly at startup with a `bootstrap` option:
```ts
posthog.init('phc_...', {
  bootstrap: storedUser ? { distinctID: storedUser.id, isIdentifiedID: true } : undefined,
});
```
This fixes a race condition where returning users appeared as anonymous UUIDs in session replay. Do not move this call, make it conditional, or revert to lazy loading.

**`distinctID` in bootstrap is capital D.** Verified against posthog-js SDK source (`posthog-core.js`): the bootstrap object is read as `config.bootstrap.distinctID` (capital D). Do not change it to lowercase — `distinctId` in the bootstrap is silently ignored. `posthog.identify()` takes a plain string argument (no property name), so case sensitivity is not relevant there.

**Adding a new event:** Add a typed function to `posthog-events.ts`, export its props interface, write a Vitest test in `posthog-events.test.ts` first (TDD), then call it from the component.

**Adding a new page or flow with generation/paywall:**
- Credit gate fails → `trackPaywallHit({ category, steps_completed: N })`
- Generation succeeds → `trackGenerationComplete(...)` or `trackCadGenerationCompleted(...)`
- Download → `trackDownloadClicked({ context, category })`

**`TO_SINGULAR` map** is in `src/lib/jewelry-utils.ts`. All PostHog event `category` values must be singular (`'ring'` not `'rings'`). Use `TO_SINGULAR[jewelryType] ?? jewelryType` wherever `jewelryType` comes from a URL param.

**Tests:** `npx vitest run src/lib/posthog-events.test.ts` — 20 tests, must stay green. Do not delete or weaken them.

## Async Generation Architecture (keep-browsing)

`GenerationsContext` (`src/contexts/GenerationsContext.tsx`) owns all background polling. Never poll inside a page component.

### Invariants — violations cause silent regressions:

**1. `extractResultImages` must return early on the first valid URL per item.**
Do not collect all candidate fields (output_url, image_url, result_url, url, image_b64) from the same item into an array. If you do, items that have both a URL and a base64 field will produce duplicate entries → same image shown twice in the result grid. Always return `[url]` on the first match and exit.

**2. Any navigation to `/studio/:jewelryType` that should restore async context MUST include `mode` in state.**
```ts
navigate(`/studio/${jewelryType}`, {
  state: { asyncResult: { workflowId, resultImages }, mode: isProductShot ? 'product-shot' : 'model-shot' },
});
```
`isProductShot` in `UnifiedStudio` reads `location.state?.mode` first, then URL `?mode=`, then sessionStorage. If you omit `mode`, sessionStorage is stale and the wrong shot type is restored. This applies to: GenerationsContext toast action, Header indicator click (completed + running).

**3. `TrackedGeneration` carries `isProductShot` — use it for navigation.**
Never reconstruct shot type from the URL or infer it from `jewelryType`. Read it from `gen.isProductShot`.

**4. Workflow name tables exist in three places — keep them in sync.**
`src/lib/photoshoot-api.ts` (canonical), `src/hooks/useStudioGeneration.ts`, `src/pages/UnifiedStudio.tsx`. If you add a new resolution or workflow variant, update all three.

**5. `hasNavigatedAway` ref controls whether the on-page effect shows results.**
`handleKeepBrowsing()` sets it to `true`. `restoreAsyncResult()` / `resumeGeneration()` / `resetGeneration()` reset it to `false`. Do not add navigation inside `useStudioGeneration` without updating this ref.

### Supported workflow variants
| Mode | 1K | 2K | 4K |
|---|---|---|---|
| Model shot | `jewelry_photoshoots_generator` | `jewelry_photoshoots_generator_2k` | `jewelry_photoshoots_generator_4k` |
| Product shot | `Product_shot_pipeline` | `Product_shot_pipeline_2k` | `Product_shot_pipeline_4k` |

All six variants go through the same `GenerationsContext` polling path. The workflow name only matters at start time (`startPhotoshoot` / `startPdpShot`). Polling uses `workflowId` only.
