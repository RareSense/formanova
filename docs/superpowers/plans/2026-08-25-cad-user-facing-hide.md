# CAD hidden from user-facing UI (temporary)

**Status:** ACTIVE (hidden), on `main`.

**Why:** Production is being updated for a while and CAD might break mid-update.
Hiding the entry points keeps users out of a broken flow without touching any
CAD code, route, or component.

**What changed (single flag, 3 files):**
- `src/lib/feature-flags.ts` — added `CAD_USER_FACING_HIDDEN = true`.
- `src/components/CADGate.tsx` — when the flag is true, redirects
  `/text-to-cad` and `/image-to-cad` to `/dashboard` instead of rendering the
  page (covers bookmarked/typed URLs, not just card clicks). `/studio-cad`
  already redirects to `/dashboard` unconditionally in App.tsx, unrelated to
  this flag.
- `src/pages/Dashboard.tsx` — the merged studio hub shows two adjacent
  sections, "Photography" and "CAD" (2 cards each). The CAD section is hidden
  and the grid collapses to a single centered column when the flag is true.

Nothing in `src/pages/TextToCAD.tsx`, `src/pages/ImageToCAD.tsx`,
`src/components/text-to-cad/`, `src/components/cad/`, or any CAD API/lib file
was touched. `src/pages/Dashboard.test.tsx` got one new test asserting the
hidden-state DOM (2 Continue buttons, no "CAD" text) via a fresh module
re-import with the flag flipped; the 4 existing tests were pinned to
`CAD_USER_FACING_HIDDEN: false` via `vi.mock` so they keep testing normal
(flag-off) behavior.

Note: this doc/flag was first written against an older Dashboard layout (a
2-tile "Photo Studio" / "CAD Studio" page, plus a separate header nav link).
Main was reset to sync with 20 upstream commits that merged Photo Studio and
CAD Studio into one hub page and removed the separate CAD nav link entirely -
the flag was reapplied fresh against that current layout. If Dashboard.tsx
changes shape again before this is undone, redo the hide against whatever it
looks like then; the flag mechanism (CADGate + one Dashboard section) is the
part that matters, not this exact diff.

## To undo (restore exactly as before)

1. In `src/lib/feature-flags.ts`, set `CAD_USER_FACING_HIDDEN = false`
   (or delete the constant and its 2 call sites - either works, since both
   call sites are a no-op when the flag is false).
2. That's it. `CADGate` and `Dashboard` both read the same flag, so flipping
   it back restores the CAD section, the two-column grid, and direct route
   access simultaneously - no other file needs a change.

To verify after undoing: `npx vitest run src/pages/Dashboard.test.tsx` and
manually load `/dashboard` and `/text-to-cad` to confirm both render
normally again.
