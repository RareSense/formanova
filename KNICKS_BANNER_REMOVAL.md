# Knicks Campaign Banner — Removal Instructions

All banner code touches exactly 3 files. Do these steps in order.

## Step 1 — Delete the component file
```
src/components/KnicksBanner.tsx
```

## Step 2 — Edit `src/App.tsx`, remove these 2 lines

The import (around line 21):
```ts
import { KnicksBanner } from '@/components/KnicksBanner'; // KNICKS CAMPAIGN — remove per KNICKS_BANNER_REMOVAL.md
```

The render (just above `<Header />`):
```tsx
<KnicksBanner />{/* KNICKS CAMPAIGN — remove per KNICKS_BANNER_REMOVAL.md */}
```

## Step 3 — Edit `src/components/layout/Header.tsx`, revert these 2 lines

Change header `top-9` back to `top-0`:
```tsx
// before
className={`fixed top-9 left-0 right-0 z-50 ...`}
// after
className={`fixed top-0 left-0 right-0 z-50 ...`}
```

Change the spacer back to original heights:
```tsx
// before
<div className="h-[6.25rem] lg:h-[7.25rem]" />
// after
<div className="h-16 lg:h-20" />
```

That's it. Nothing else in the codebase references the banner.
