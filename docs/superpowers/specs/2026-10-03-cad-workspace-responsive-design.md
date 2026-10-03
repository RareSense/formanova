# CAD workspace on tablets and phones

Date: 2026-10-03 · Approved by the user in session · Builds after the part-families change lands.

## Problem

Phase 2 of `TextToCAD.tsx` / `ImageToCAD.tsx` (the left panel / 3D view / right panel
workspace) has no responsive rules. At 390 px the three columns squash (one word per
line, a ~70 px material panel); at 820 px panel content truncates. The two pages repeat
~260 near-identical lines of this layout.

## Breakpoints

New hook `useCadBreakpoint(): "desktop" | "tablet" | "phone"` beside
`src/hooks/use-mobile.tsx` (matchMedia): phone < 768 px, tablet 768–1279 px,
desktop ≥ 1280 px.

## Shared layout

New `src/components/text-to-cad/CadWorkspaceLayout.tsx` with slots `left`,
`viewport`, `right`, `actions`, plus `hasModel`, and controlled `leftOpen` / `rightOpen`.
Both pages render their phase 2 through it (removes the duplicated layout).

- **Desktop:** today's `ResizablePanelGroup` unchanged — same ids, sizes, collapse
  behaviour, toggle buttons and the auto-expand of the right panel when a model arrives.
- **Tablet:** viewport full width. Left panel opens as a left slide-in (Sheet) from the
  existing toggle. Right panel (Material / Parts) is an absolutely positioned drawer
  inside the viewport container (not portalled, so it works in fullscreen), ~360 px
  wide, closes on outside tap or Esc.
- **Phone:** viewport on top (~60% of `100dvh` minus header). Below it a non-modal
  bottom sheet (vaul `Drawer`, `modal={false}`, `snapPoints` peek / half / full,
  `shouldScaleBackground={false}`) with Tabs **Material · Parts · Versions** (Versions
  only where the page has versions). Improve + Download pinned under the viewport,
  side by side, equal size.
- The viewport subtree stays at the same tree position in every mode, so `CADCanvas`
  never remounts on rotation or resize (no lost WebGL context, edits or undo).
- Heights use `dvh` so mobile Safari's address bar can't hide the bottom.

## Viewport overlays

- `ViewportToolbar` gains `compact` (icon-only buttons; lucide icons for Orbit / Move /
  Rotate / Scale) and `modes` (phone: Orbit only). Tablet and desktop keep all modes.
- `CadResultActions` gains `layout="row"` for the phone's side-by-side pair (keeps the
  equal-size rule and its tests).
- Toggle buttons, Gem toggle, Ready pill and side tools don't overlap the sheet or the
  pinned actions (checked by screenshot at each breakpoint).

## Input and focus

- `useCADKeyboardShortcuts` gets an `enabled` flag, false while a sheet/drawer is open,
  so Esc closes the sheet and Backspace/Delete/G/R/S never act on parts behind it.
- Touch: no hover. Tap selects the family; a single part is chosen from its row in the
  Parts tab (double-tap is unreliable in iOS Safari, so not relied on).

## Out of scope

The protected `CADCanvas.tsx` (only its container size changes), prompt screens
(already responsive), Generations page.

## Verification

Unit tests for `useCadBreakpoint`, the layout's mode switching (slot placement per
breakpoint, open/close, Esc), `ViewportToolbar compact/modes`, `CadResultActions
layout="row"`, shortcuts `enabled`. Browser checks with Playwright in Chromium, Firefox
and WebKit (Safari engine), desktop 1440×900, iPad, iPhone 14 and Pixel 7 emulation:
no overlap, no horizontal scroll, sheet snaps, actions reachable, canvas not
remounted across a resize, fullscreen still shows panels.
