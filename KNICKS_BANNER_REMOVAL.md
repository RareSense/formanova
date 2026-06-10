# Knicks Campaign Banner — Removal Instructions

The announcement banner ("Everybody's chasing a ring...") lives in two places only.

## To remove

**Step 1 — Delete the component file:**
```
src/components/KnicksBanner.tsx
```

**Step 2 — Edit `src/App.tsx` and remove these two lines:**

The import (around line 21):
```ts
import { KnicksBanner } from '@/components/KnicksBanner'; // KNICKS CAMPAIGN — remove per KNICKS_BANNER_REMOVAL.md
```

The render (inside the `min-h-screen` div, just above `<Header />`):
```tsx
<KnicksBanner />{/* KNICKS CAMPAIGN — remove per KNICKS_BANNER_REMOVAL.md */}
```

That's it. Nothing else in the codebase references the banner.

## To change the copy or colors

Open `src/components/KnicksBanner.tsx`:
- **Text**: edit the string inside the `<span>` elements.
- **Background color**: change `backgroundColor: "#006BB6"` (Knicks blue).
- **Arrow accent color**: change `color: "#F58426"` (Knicks orange).
