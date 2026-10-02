# CAD Type Cards and Download Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Text to CAD and Image to CAD, remove the admin model picker and the material dropdown, replace the jewelry-type dropdown with square cards shown as Step 1, make the wording follow the chosen piece, and turn the split Download button into one Download button that opens a format list.

**Architecture:** One new presentational component (`CadJewelryTypeCards`) fed by the existing `CAD_JEWELRY_TYPES` list, which gains a `noun` per type. The two prompt screens and two pages lose props/state; the shared `CadDownloadMenu` keeps its props and changes only its rendering. No backend or API changes.

**Tech Stack:** React 18 + TypeScript, Tailwind, Radix dropdown (`@/components/ui/dropdown-menu`), lucide-react icons, Vitest + Testing Library, Python Pillow for one-off image conversion.

Spec: `docs/superpowers/specs/2026-10-03-cad-type-cards-download-menu-design.md`

## Global Constraints

- Work in `C:\Users\Clubinternet\OneDrive\Desktop\frontend\formanova-gemini-tier`, local branch `feat/cad-type-cards-download-menu`, which tracks `origin/feature/jewelry-cad-workflows`. Commits are pushed to `feature/jewelry-cad-workflows` at the end (Task 7), not to a new remote branch.
- Minimal blast radius (CLAUDE.md): touch only the files each task lists.
- Images must be WebP (CLAUDE.md Asset Rules). Never import PNG/JPG.
- No `cursor-pointer` on `<button>` elements (CLAUDE.md).
- Grids use one `gap-*` value (CLAUDE.md).
- No new colours or gradients beyond existing tokens; the only literal colour allowed is the photo-backdrop grey `#dfdedf` for the Other card, which matches the supplied renders.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Baseline before Task 1: `npm run typecheck` exits 0; `npx vitest run` = 90 files, 1400 tests passing.

---

### Task 1: Jewelry type order, noun, and helper

**Files:**
- Modify: `src/lib/ring-cad-nurbs-api.ts:137-149`
- Test: `src/lib/ring-cad-nurbs-api.test.ts:162-166`

**Interfaces:**
- Produces: `CAD_JEWELRY_TYPES` entries now `{ value, label, noun }` in order ring, necklace, bracelet, earring, other; `cadJewelryNoun(type: CadJewelryType): string`.

- [ ] **Step 1: Update the order test and add the noun test**

In `src/lib/ring-cad-nurbs-api.test.ts`, replace the test `offers ring, bracelet, necklace, earring and other, in that order` with:

```ts
  it('offers ring, necklace, bracelet, earring and other, in that order', () => {
    expect(CAD_JEWELRY_TYPES.map((t) => t.value)).toEqual(['ring', 'necklace', 'bracelet', 'earring', 'other']);
    expect(CAD_JEWELRY_TYPES.find((t) => t.value === 'other')?.label).toBe('Other');
  });

  it('names each piece for the wording on the prompt screens', () => {
    expect(CAD_JEWELRY_TYPES.map((t) => cadJewelryNoun(t.value))).toEqual(
      ['ring', 'necklace', 'bracelet', 'earring', 'piece'],
    );
  });
```

Add `cadJewelryNoun,` to the existing import list from `'./ring-cad-nurbs-api'` (or `'@/lib/ring-cad-nurbs-api'`, whichever the file uses) at the top of the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/ring-cad-nurbs-api.test.ts`
Expected: FAIL (order mismatch, and `cadJewelryNoun` is not exported).

- [ ] **Step 3: Implement**

In `src/lib/ring-cad-nurbs-api.ts`, replace the `CAD_JEWELRY_TYPES` block (lines 137-145) with:

```ts
export const CAD_JEWELRY_TYPES = [
  { value: 'ring', label: 'Ring', noun: 'ring' },
  { value: 'necklace', label: 'Necklace', noun: 'necklace' },
  { value: 'bracelet', label: 'Bracelet', noun: 'bracelet' },
  { value: 'earring', label: 'Earring', noun: 'earring' },
  // Brooch, tiara, cufflinks, anklet, charm, watch case and the like. The
  // backend works out the actual piece from the photos and description.
  { value: 'other', label: 'Other', noun: 'piece' },
] as const;
```

Directly after `export const DEFAULT_CAD_JEWELRY_TYPE ...` (line 149) add:

```ts

/** The word the prompt screens use for the chosen piece, e.g. "Upload your necklace images". */
export function cadJewelryNoun(type: CadJewelryType): string {
  return CAD_JEWELRY_TYPES.find((t) => t.value === type)?.noun ?? 'piece';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/ring-cad-nurbs-api.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ring-cad-nurbs-api.ts src/lib/ring-cad-nurbs-api.test.ts
git commit -m "List jewelry types in card order and name each piece

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Card images and the CadJewelryTypeCards component

**Files:**
- Create: `src/assets/cad-jewelry-types/ring.webp`, `necklace.webp`, `bracelet.webp`, `earring.webp`
- Create: `src/components/text-to-cad/CadJewelryTypeCards.tsx`
- Test: `src/components/text-to-cad/CadJewelryTypeCards.test.tsx`

**Interfaces:**
- Consumes: `CAD_JEWELRY_TYPES`, `CadJewelryType` from Task 1.
- Produces: `export default function CadJewelryTypeCards(props: { value: CadJewelryType; onChange: (value: CadJewelryType) => void; disabled?: boolean })`.

- [ ] **Step 1: Convert the four renders to WebP**

Sources (user-supplied, in Downloads): ring `7e4ede41-3e82-4910-9985-a94f46a307f6.png`, earring `10dce61a-3858-43f8-97f5-d405a6220ba9.png`, necklace (pendant) `172563d3-16cc-4111-97c2-2802500acc6c.png`, bracelet `1975d06b-4f46-4638-85cd-0ed17ffc9fe7.png` (4:3, centre-cropped).

Run from the repo root:

```bash
mkdir -p src/assets/cad-jewelry-types
python - <<'EOF'
from PIL import Image
src = r'C:\Users\Clubinternet\Downloads'
files = {
    'ring': '7e4ede41-3e82-4910-9985-a94f46a307f6.png',
    'earring': '10dce61a-3858-43f8-97f5-d405a6220ba9.png',
    'necklace': '172563d3-16cc-4111-97c2-2802500acc6c.png',
    'bracelet': '1975d06b-4f46-4638-85cd-0ed17ffc9fe7.png',
}
for name, f in files.items():
    im = Image.open(fr'{src}\{f}').convert('RGB')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((480, 480), Image.LANCZOS)
    im.save(f'src/assets/cad-jewelry-types/{name}.webp', 'WEBP', quality=82, method=6)
    print(name, im.size)
EOF
ls -la src/assets/cad-jewelry-types
```

Expected: four `.webp` files, each 480x480 and roughly 10-40 KB.

- [ ] **Step 2: Write the failing component test**

Create `src/components/text-to-cad/CadJewelryTypeCards.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import CadJewelryTypeCards from './CadJewelryTypeCards';

describe('CadJewelryTypeCards', () => {
  it('offers the five pieces in order as one radio group', () => {
    render(<CadJewelryTypeCards value="ring" onChange={() => {}} />);

    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(
      ['Ring', 'Necklace', 'Bracelet', 'Earring', 'Other'],
    );
  });

  it('marks only the chosen piece as selected', () => {
    render(<CadJewelryTypeCards value="necklace" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Necklace' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Ring' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the piece that was clicked', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Bracelet' }));
    expect(onChange).toHaveBeenCalledWith('bracelet');
  });

  it('moves the choice with the arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('necklace');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('other');
  });

  it('keeps only the chosen card in the tab order', () => {
    render(<CadJewelryTypeCards value="earring" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Earring' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Ring' })).toHaveAttribute('tabindex', '-1');
  });

  it('explains what Other covers', () => {
    render(<CadJewelryTypeCards value="ring" onChange={() => {}} />);

    expect(screen.getByText('Brooches, tiaras, watches & more')).toBeInTheDocument();
  });

  it('cannot be changed while a run is generating', () => {
    const onChange = vi.fn();
    render(<CadJewelryTypeCards value="ring" onChange={onChange} disabled />);

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Necklace' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ring' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/components/text-to-cad/CadJewelryTypeCards.test.tsx`
Expected: FAIL, cannot resolve `./CadJewelryTypeCards`.

- [ ] **Step 4: Implement the component**

Create `src/components/text-to-cad/CadJewelryTypeCards.tsx`:

```tsx
/**
 * Step 1 of Text to CAD and Image to CAD: which piece is being made.
 *
 * Square picture cards rather than a dropdown, the way shop and design tools
 * ask "what are you making?" before anything else. It is a radio group, so
 * one card is always chosen, arrow keys move the choice, and only the chosen
 * card sits in the tab order.
 */

import { useRef, type KeyboardEvent } from 'react';
import { Check, Sparkles } from 'lucide-react';

import { CAD_JEWELRY_TYPES, type CadJewelryType } from '@/lib/ring-cad-nurbs-api';
import { cn } from '@/lib/utils';
import ringImage from '@/assets/cad-jewelry-types/ring.webp';
import necklaceImage from '@/assets/cad-jewelry-types/necklace.webp';
import braceletImage from '@/assets/cad-jewelry-types/bracelet.webp';
import earringImage from '@/assets/cad-jewelry-types/earring.webp';

const CARD_IMAGES: Partial<Record<CadJewelryType, string>> = {
  ring: ringImage,
  necklace: necklaceImage,
  bracelet: braceletImage,
  earring: earringImage,
};

interface CadJewelryTypeCardsProps {
  value: CadJewelryType;
  onChange: (value: CadJewelryType) => void;
  disabled?: boolean;
}

export default function CadJewelryTypeCards({ value, onChange, disabled }: CadJewelryTypeCardsProps) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + CAD_JEWELRY_TYPES.length) % CAD_JEWELRY_TYPES.length;
    onChange(CAD_JEWELRY_TYPES[next].value);
    cardRefs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Jewelry type" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {CAD_JEWELRY_TYPES.map((type, index) => {
        const selected = type.value === value;
        const image = CARD_IMAGES[type.value];
        return (
          <button
            key={type.value}
            ref={(el) => { cardRefs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={type.label}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(type.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative flex flex-col overflow-hidden border bg-background text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
              selected
                ? 'border-formanova-hero-accent ring-1 ring-formanova-hero-accent'
                : 'border-border hover:border-foreground/40',
            )}
          >
            {/* The renders share one grey backdrop; Other uses the same grey so
                all five squares read as one set. */}
            <div className="relative aspect-square w-full bg-[#dfdedf]">
              {image ? (
                <img src={image} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
                  <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-6 w-6 text-zinc-700" />
                  <span className="text-[11px] leading-snug text-zinc-700">Brooches, tiaras, watches &amp; more</span>
                </div>
              )}
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-formanova-hero-accent">
                  <Check aria-hidden="true" strokeWidth={3} className="h-3 w-3 text-background" />
                </span>
              )}
            </div>
            <span className="flex h-9 items-center justify-center font-mono text-[11px] uppercase tracking-[0.15em] text-foreground">
              {type.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

If TypeScript reports `Cannot find module '*.webp'`, check `src/vite-env.d.ts` references `vite/client` (it does in this repo; other `.webp` imports already compile).

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/text-to-cad/CadJewelryTypeCards.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/assets/cad-jewelry-types src/components/text-to-cad/CadJewelryTypeCards.tsx src/components/text-to-cad/CadJewelryTypeCards.test.tsx
git commit -m "Add the jewelry-type picture cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Text to CAD uses the cards; picker and material removed

**Files:**
- Modify: `src/components/text-to-cad/InitialPromptScreen.tsx`
- Modify: `src/pages/TextToCAD.tsx`
- Test: `src/components/text-to-cad/InitialPromptScreen.test.tsx` (create)

**Interfaces:**
- Consumes: `CadJewelryTypeCards` (Task 2), `cadJewelryNoun` (Task 1).
- Produces: `InitialPromptScreenProps` without `material`, `setMaterial`, `modelPicker`.

- [ ] **Step 1: Write the failing screen test**

Create `src/components/text-to-cad/InitialPromptScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-estimated-cost', () => ({
  useEstimatedCost: () => ({ cost: 70, loading: false }),
}));

import InitialPromptScreen from './InitialPromptScreen';
import type { CadJewelryType } from '@/lib/ring-cad-nurbs-api';

function renderScreen(jewelryType: CadJewelryType = 'ring') {
  return render(
    <InitialPromptScreen
      model="gemini"
      tier="gpt_6_astra_openai"
      setModel={vi.fn()}
      prompt=""
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={vi.fn()}
    />,
  );
}

describe('InitialPromptScreen', () => {
  it('asks what is being made with the picture cards, not a dropdown', () => {
    renderScreen();

    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows no material or model controls', () => {
    renderScreen();

    expect(screen.queryByText(/material/i)).toBeNull();
    expect(screen.queryByText(/provider/i)).toBeNull();
  });

  it('words the brief for the chosen piece', () => {
    renderScreen('necklace');

    expect(screen.getByText(/describe your necklace design/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe your necklace/i)).toBeInTheDocument();
    expect(screen.queryByText(/rings only/i)).toBeNull();
  });

  it('keeps the ring example in the placeholder for rings', () => {
    renderScreen('ring');

    expect(screen.getByPlaceholderText(/a rose ring with three blooming roses/i)).toBeInTheDocument();
  });
});
```

Use the tier string `RING_CAD_DEFAULT_TIER` resolves to if `gpt_6_astra_openai` is not the exact value; the test does not depend on it (cost is mocked).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/text-to-cad/InitialPromptScreen.test.tsx`
Expected: FAIL (no radiogroup; a combobox is present; "Rings only" text present).

- [ ] **Step 3: Update InitialPromptScreen**

In `src/components/text-to-cad/InitialPromptScreen.tsx`:

Line 1, drop `type ReactNode`:
```tsx
import { useRef, useCallback, useEffect, useState } from "react";
```
(Keep any of `useEffect`/`useState` only if still used; if `tsc`/eslint reports one unused, remove just that one.)

Lines 6-8 become:
```tsx
import { RING_CAD_NURBS_WORKFLOW, cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
```

In `InitialPromptScreenProps`, delete the `material`, `setMaterial` lines and the `modelPicker` line with its doc comment. In the destructuring, use:
```tsx
export default function InitialPromptScreen({
  model, tier, setModel, prompt, setPrompt, jewelryType, setJewelryType,
  isGenerating, onGenerate, onGlbUpload,
}: InitialPromptScreenProps) {
```
and add, right after `const textareaRef = ...`:
```tsx
  const noun = cadJewelryNoun(jewelryType);
```

Replace the subtitle paragraph `Describe your ring design · Rings only` with:
```tsx
              <p className="font-mono text-[11px] text-muted-foreground tracking-[0.15em] uppercase">
                Describe your {noun} design
              </p>
```

Immediately after the title block's closing `</div>` (the `text-center mb-6` div) and before `{/* Prompt */}`, insert:
```tsx
            {/* Step 1: which piece. Chosen before the brief, because the
                piece decides what a useful description looks like. */}
            <div className="mx-auto mb-6 max-w-[680px]">
              <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                What are you making?
              </h2>
              <CadJewelryTypeCards value={jewelryType} onChange={setJewelryType} disabled={isGenerating} />
            </div>
```

Change the textarea `placeholder` to:
```tsx
                placeholder={jewelryType === "ring"
                  ? "Describe your ring, e.g. A rose ring with three blooming roses, twisted vine band with thorns, and diamond accents"
                  : `Describe your ${noun}: shape, stones, metal details and any motif`}
```

Delete the line `{modelPicker && <div className="mx-auto mb-4 max-w-[680px]">{modelPicker}</div>}`.

In the Generate row, delete the `<CadJewelryTypeSelect ... />` and `<CadMaterialSelect ... />` lines; leave the `<Button>` and its wrapper unchanged.

- [ ] **Step 4: Update TextToCAD page**

In `src/pages/TextToCAD.tsx`:

The import at line ~39 becomes:
```tsx
import { RING_CAD_DEFAULT_TIER, RING_CAD_TIERS, DEFAULT_CAD_JEWELRY_TYPE, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
```
Delete the three imports:
```tsx
import { useIsAdmin } from "@/hooks/useIsAdmin";
import CadModelPicker from "@/components/text-to-cad/CadModelPicker";
import { DEFAULT_CAD_PICK, cadPickerTier, type CadModelPick } from "@/lib/cad-model-picker";
```

Replace lines 67-71:
```tsx
  const isAdmin = useIsAdmin();
  const [modelPick, setModelPick] = useState<CadModelPick>(DEFAULT_CAD_PICK);
  // Admins choose the model and provider; everyone else keeps the fixed default.
  const pickedTier = isAdmin ? cadPickerTier(modelPick.model, modelPick.provider) : RING_CAD_DEFAULT_TIER;
  const activeTier = requestedTier ?? pickedTier;
```
with:
```tsx
  // Every run uses the customer default (GPT-6 Astra, OpenAI direct) unless
  // the URL explicitly asks for the GPT-5.6 Sol tier.
  const activeTier = requestedTier ?? RING_CAD_DEFAULT_TIER;
```

Delete `const [material, setMaterial] = useState<CadMaterialProfile | null>(null);` and the `material,` line inside the `useImageToCADWorkflow({...})` call (the hook defaults it to `null`).

In the `<InitialPromptScreen ... />` JSX, delete `material={material}`, `setMaterial={setMaterial}` and the whole `modelPicker={isAdmin ? (...) : undefined}` prop.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/text-to-cad/InitialPromptScreen.test.tsx && npm run typecheck`
Expected: test PASS (4 tests). Typecheck may still fail ONLY in `ImagePromptScreen`/`ImageToCAD` (fixed in Task 4); any error in TextToCAD or InitialPromptScreen must be fixed now.

- [ ] **Step 6: Commit**

```bash
git add src/components/text-to-cad/InitialPromptScreen.tsx src/components/text-to-cad/InitialPromptScreen.test.tsx src/pages/TextToCAD.tsx
git commit -m "Text to CAD asks what you are making with picture cards

Drops the admin model picker and the material dropdown; runs use the
customer default tier and send no material.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Image to CAD uses the cards; picker and material removed

**Files:**
- Modify: `src/components/text-to-cad/ImagePromptScreen.tsx`
- Modify: `src/pages/ImageToCAD.tsx`
- Test: `src/components/text-to-cad/ImagePromptScreen.test.tsx`

**Interfaces:**
- Consumes: `CadJewelryTypeCards` (Task 2), `cadJewelryNoun` (Task 1).
- Produces: `ImagePromptScreenProps` without `material`, `setMaterial`, `modelPicker`.

- [ ] **Step 1: Update the screen test first**

In `src/components/text-to-cad/ImagePromptScreen.test.tsx`:

Change `renderScreen` to take the type and drop the material props:
```tsx
function renderScreen(jewelryType: 'ring' | 'necklace' | 'bracelet' | 'earring' | 'other' = 'ring') {
  return render(
    <ImagePromptScreen
      model="gemini"
      tier="claude_opus_5_openrouter"
      prompt=""
      setPrompt={vi.fn()}
      jewelryType={jewelryType}
      setJewelryType={vi.fn()}
      isGenerating={false}
      onGenerate={vi.fn()}
      referenceImagePreviewUrls={[]}
      onAddReferenceImages={vi.fn()}
      onRemoveReferenceImage={vi.fn()}
      onReplaceReferenceImages={vi.fn()}
    />,
  );
}
```

Append inside the `describe('ImagePromptScreen', ...)` block:
```tsx
  it('asks what is being made first, as Step 1, with the picture cards', () => {
    renderScreen();

    expect(screen.getByText(/image to cad · step 1/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what are you making\?/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Jewelry type' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('words the upload step for the chosen piece', () => {
    renderScreen('earring');

    expect(screen.getByRole('heading', { name: /upload your earring images/i })).toBeInTheDocument();
    expect(screen.getByText(/drop your earring images or sketches here/i)).toBeInTheDocument();
  });

  it('calls an Other piece a piece', () => {
    renderScreen('other');

    expect(screen.getByRole('heading', { name: /upload your piece images/i })).toBeInTheDocument();
  });
```

If the `·` in the first assertion does not match because the source uses `&middot;`, use `/image to cad . step 1/i`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/text-to-cad/ImagePromptScreen.test.tsx`
Expected: FAIL on the three new tests (and a type error is acceptable at this point).

- [ ] **Step 3: Update ImagePromptScreen**

In `src/components/text-to-cad/ImagePromptScreen.tsx`:

Line 1, drop `type ReactNode` from the react import (keep the hooks that are used).

Lines 6-8 become:
```tsx
import { RING_CAD_NURBS_WORKFLOW, cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
```

In `ImagePromptScreenProps`, delete `material`, `setMaterial`, and the `modelPicker` line with its doc comment. Destructuring becomes:
```tsx
export default function ImagePromptScreen({
  model, tier, prompt, setPrompt, jewelryType, setJewelryType,
  isGenerating, onGenerate,
  referenceImagePreviewUrls,
  onAddReferenceImages, onRemoveReferenceImage, onReplaceReferenceImages,
  onGlbUpload,
}: ImagePromptScreenProps) {
```
Add after `const textareaRef = ...`:
```tsx
  const noun = cadJewelryNoun(jewelryType);
```

Directly inside the `<motion.div ...>` and BEFORE `<div className="grid gap-8 lg:gap-10 lg:grid-cols-3">`, insert the Step 1 block. It sits above the two-column grid so the upload box and the right-hand panel keep their shared top and bottom edges:
```tsx
        {/* Step 1: which piece. Above the two-column grid so the upload box
            and the right-hand panel still start and end on the same lines. */}
        <div className="mb-8 max-w-[680px]">
          <span className="marta-label block mb-1">Image to CAD &middot; Step 1</span>
          <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">What are you making?</h3>
          <div className="mt-4">
            <CadJewelryTypeCards value={jewelryType} onChange={setJewelryType} disabled={isGenerating} />
          </div>
        </div>
```

In the existing left-column header, change:
- `Image to CAD &middot; Step 1` to `Image to CAD &middot; Step 2`
- `Upload Your Ring Images` to `Upload your {noun} images`

In the right column, change the invisible spacer label `Step 1` to `Step 2` (it is `aria-hidden` and only keeps the headings aligned).

Change the uploader prop to:
```tsx
                primaryLabel={`Drop your ${noun} images or sketches here`}
```

Delete `{modelPicker && <div className="mt-4">{modelPicker}</div>}`.

In the Generate row delete the `<CadJewelryTypeSelect ... />` and `<CadMaterialSelect ... />` lines; leave the `<Button>` unchanged.

- [ ] **Step 4: Update ImageToCAD page**

In `src/pages/ImageToCAD.tsx`:

Import line ~35 becomes:
```tsx
import { RING_CAD_DEFAULT_TIER, DEFAULT_CAD_JEWELRY_TYPE, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
```
Delete the `useIsAdmin`, `CadModelPicker` and `cad-model-picker` imports (lines ~36-38).

Replace lines 55-59:
```tsx
  const isAdmin = useIsAdmin();
  const [modelPick, setModelPick] = useState<CadModelPick>(DEFAULT_CAD_PICK);
  // Admins choose the model and provider; everyone else keeps the fixed default.
  const pickedTier = isAdmin ? cadPickerTier(modelPick.model, modelPick.provider) : RING_CAD_DEFAULT_TIER;
  const activeTier = pickedTier;
```
with:
```tsx
  // Every run uses the customer default: GPT-6 Astra, OpenAI direct.
  const activeTier = RING_CAD_DEFAULT_TIER;
```

Delete `const [material, setMaterial] = useState<CadMaterialProfile | null>(null);`, the `material,` line in the `useImageToCADWorkflow({...})` call, and in `<ImagePromptScreen ... />` the `material`, `setMaterial` and `modelPicker={isAdmin ? (...) : undefined}` props.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/text-to-cad/ImagePromptScreen.test.tsx && npm run typecheck`
Expected: PASS (6 tests), typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/text-to-cad/ImagePromptScreen.tsx src/components/text-to-cad/ImagePromptScreen.test.tsx src/pages/ImageToCAD.tsx
git commit -m "Image to CAD asks what you are making first, with picture cards

Step 1 is the piece, Step 2 the upload, worded for that piece. Drops the
admin model picker and the material dropdown.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Delete the controls nothing uses any more

**Files:**
- Delete: `src/components/text-to-cad/CadModelPicker.tsx`, `src/components/text-to-cad/CadModelPicker.test.tsx`
- Delete: `src/lib/cad-model-picker.ts`, `src/lib/cad-model-picker.test.ts`
- Delete: `src/components/text-to-cad/CadMaterialSelect.tsx`
- Delete: `src/components/text-to-cad/CadJewelryTypeSelect.tsx`

- [ ] **Step 1: Prove they are unused**

Run:
```bash
grep -rnE "CadModelPicker|cad-model-picker|CadMaterialSelect|CadJewelryTypeSelect" src --include=*.ts --include=*.tsx \
  | grep -vE "^src/(components/text-to-cad/(CadModelPicker|CadMaterialSelect|CadJewelryTypeSelect)|lib/cad-model-picker)"
```
Expected: no output. If anything prints, stop and report it instead of deleting.

- [ ] **Step 2: Delete and verify**

```bash
git rm src/components/text-to-cad/CadModelPicker.tsx src/components/text-to-cad/CadModelPicker.test.tsx \
  src/lib/cad-model-picker.ts src/lib/cad-model-picker.test.ts \
  src/components/text-to-cad/CadMaterialSelect.tsx src/components/text-to-cad/CadJewelryTypeSelect.tsx
npm run typecheck
```
Expected: typecheck exit 0.

- [ ] **Step 3: Commit**

```bash
git commit -m "Remove the model picker, material and type dropdowns nothing uses now

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One Download button that opens a format list

**Files:**
- Modify: `src/components/downloads/CadDownloadMenu.tsx` (doc comment and `CadDownloadMenu` function, lines ~1-15 and ~117-200)
- Test: `src/components/downloads/CadDownloadMenu.test.tsx` (rewrite)
- Test: `src/components/text-to-cad/CadResultActions.test.tsx` (labels)
- Test: `src/components/generations/WorkflowCard.test.tsx` (labels and menu use)

**Interfaces:**
- Consumes: nothing new. `CadDownloadMenuProps` is unchanged, so `CadResultActions.tsx` and `WorkflowCard.tsx` need no edits.
- Produces: trigger button with accessible name `Download` (or `Preparing...` while busy); menu items whose text is `<FORMAT><hint>`, hints exactly: `Rhino, editable`, `3D preview`, `Viewer only (mesh)`, `Other CAD software`, `3D printing`, `With my edits`.

- [ ] **Step 1: Rewrite the menu test**

Replace the whole of `src/components/downloads/CadDownloadMenu.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CadDownloadMenu } from './CadDownloadMenu';

/**
 * The contract: one Download button. Pressing it never downloads by itself;
 * it opens the list of formats this run actually has, in a fixed order, each
 * with a plain-English hint, so nobody grabs the wrong file by accident.
 */

const noop = () => {};

/** Radix opens on pointerdown or keyboard, not on a synthetic click. */
const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: /^download$/i }), { key: 'Enter' });

const menuRows = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('CadDownloadMenu', () => {
  it('opens the format list without downloading anything', async () => {
    const onDownloadThreedm = vi.fn();
    render(<CadDownloadMenu onDownloadThreedm={onDownloadThreedm} onDownloadGlb={noop} />);

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(onDownloadThreedm).not.toHaveBeenCalled();
  });

  it('lists every format in a fixed order with a hint', async () => {
    render(
      <CadDownloadMenu
        onDownloadThreedm={noop}
        onDownloadGlb={noop}
        onDownloadViewerThreedm={noop}
        onDownloadStep={noop}
        onDownloadStl={noop}
      />,
    );

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(menuRows()).toEqual([
      '3DMRhino, editable',
      'GLB3D preview',
      '3DMViewer only (mesh)',
      'STEPOther CAD software',
      'STL3D printing',
    ]);
  });

  it('downloads the format that was chosen', async () => {
    const handlers = {
      onDownloadThreedm: vi.fn(),
      onDownloadGlb: vi.fn(),
      onDownloadViewerThreedm: vi.fn(),
      onDownloadStep: vi.fn(),
      onDownloadStl: vi.fn(),
    };
    render(<CadDownloadMenu {...handlers} />);

    const cases: [string, keyof typeof handlers][] = [
      ['Rhino, editable', 'onDownloadThreedm'],
      ['3D preview', 'onDownloadGlb'],
      ['Viewer only (mesh)', 'onDownloadViewerThreedm'],
      ['Other CAD software', 'onDownloadStep'],
      ['3D printing', 'onDownloadStl'],
    ];
    for (const [hint, handler] of cases) {
      openMenu();
      fireEvent.click(await screen.findByText(hint));
      expect(handlers[handler]).toHaveBeenCalledTimes(1);
    }
  });

  it('shows only the formats this run has', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);

    openMenu();
    await screen.findByText('Rhino, editable');
    expect(menuRows()).toEqual(['3DMRhino, editable', 'GLB3D preview']);
  });

  it('offers the edited export only once there is an edit', async () => {
    const onExportEdited = vi.fn();
    const { unmount } = render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} />);
    openMenu();
    await screen.findByText('Rhino, editable');
    expect(screen.queryByText('With my edits')).toBeNull();
    unmount();

    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} onExportEdited={onExportEdited} />);
    openMenu();
    fireEvent.click(await screen.findByText('With my edits'));
    expect(onExportEdited).toHaveBeenCalledTimes(1);
  });

  it('shows the estimated metal weight above the formats', async () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} estimatedMetalMassG={4.214} />);

    openMenu();
    expect(await screen.findByText(/est\. metal weight: 4\.21 g/i)).toBeInTheDocument();
  });

  it('works for older runs that only have a GLB', async () => {
    const onDownloadGlb = vi.fn();
    render(<CadDownloadMenu onDownloadGlb={onDownloadGlb} />);

    openMenu();
    fireEvent.click(await screen.findByText('3D preview'));
    expect(onDownloadGlb).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no artifact at all', () => {
    const { container } = render(<CadDownloadMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is disabled and says so while a download is in flight', () => {
    render(<CadDownloadMenu onDownloadThreedm={noop} onDownloadGlb={noop} isBusy />);

    const button = screen.getByRole('button', { name: /preparing/i });
    expect(button).toBeDisabled();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/downloads/CadDownloadMenu.test.tsx`
Expected: FAIL (no button named "Download").

- [ ] **Step 3: Implement**

In `src/components/downloads/CadDownloadMenu.tsx`:

Replace the second paragraph of the top doc comment (the one starting `Why a split button rather than two buttons`) with:
```tsx
 * One button that opens a list of formats, rather than a one-click default:
 * jewellers pick the file for the job (Rhino, preview, printing, other CAD),
 * so every format is named with a short hint and none is downloaded by a
 * stray click. The editable NURBS .3dm still leads the list.
```

Change the dropdown import to include the separator:
```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

Remove the now-unused `DIVIDER_TONES` constant. Keep `TRIGGER_BASE`, `TRIGGER_TONES`, `CAD_RESULT_ACTION_SIZE`, `CAD_RESULT_ACTION_WIDTH`, `VARIANTS` exactly as they are.

Replace the whole `export function CadDownloadMenu(...) { ... }` with:
```tsx
interface FormatRow {
  format: string;
  hint: string;
  onSelect: () => void;
}

export function CadDownloadMenu({
  onDownloadThreedm,
  onDownloadGlb,
  onDownloadViewerThreedm,
  onDownloadStl,
  onDownloadStep,
  estimatedMetalMassG,
  onExportEdited,
  isBusy = false,
  variant = 'viewport',
  className,
}: CadDownloadMenuProps) {
  // STL, STEP and the viewing copy are only ever produced alongside a 3DM or
  // GLB, so a run with neither has nothing to offer.
  if (!onDownloadThreedm && !onDownloadGlb) return null;

  // Fixed light download beside fixed dark Improve, in every theme.
  const tone = variant === 'result' ? 'quiet' : 'filled';

  // Fixed order: the editable file first, then preview, viewer copy, and the
  // exchange formats. Only formats this run actually has are listed.
  const formats: FormatRow[] = [];
  if (onDownloadThreedm) formats.push({ format: '3DM', hint: 'Rhino, editable', onSelect: onDownloadThreedm });
  if (onDownloadGlb) formats.push({ format: 'GLB', hint: '3D preview', onSelect: onDownloadGlb });
  if (onDownloadViewerThreedm) formats.push({ format: '3DM', hint: 'Viewer only (mesh)', onSelect: onDownloadViewerThreedm });
  if (onDownloadStep) formats.push({ format: 'STEP', hint: 'Other CAD software', onSelect: onDownloadStep });
  if (onDownloadStl) formats.push({ format: 'STL', hint: '3D printing', onSelect: onDownloadStl });

  const iconSize = variant === 'result' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isBusy}
          className={cn(TRIGGER_BASE, TRIGGER_TONES[tone], VARIANTS[variant], className)}
        >
          <Download aria-hidden="true" className={cn('shrink-0', iconSize)} />
          <span>{isBusy ? 'Preparing...' : 'Download'}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        {typeof estimatedMetalMassG === 'number' && (
          <div className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Est. metal weight: {estimatedMetalMassG.toFixed(2)} g
          </div>
        )}
        {formats.map((row) => (
          <DropdownMenuItem key={`${row.format}-${row.hint}`} onSelect={row.onSelect} className="gap-3 py-2">
            <span className="w-10 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider">{row.format}</span>
            <span className="text-[12px] text-muted-foreground">{row.hint}</span>
          </DropdownMenuItem>
        ))}
        {onExportEdited && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExportEdited} className="gap-3 py-2">
              <span className="w-10 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider">GLB</span>
              <span className="text-[12px] text-muted-foreground">With my edits</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Note: `className` used to sit on a wrapper `<div>`; it now goes on the button itself. For `CadResultActions` that is `pointer-events-auto w-full sm:w-[264px]`, which gives the same rendered width. `variant="card"` keeps `w-full` from `VARIANTS.card`.

- [ ] **Step 4: Run the menu test**

Run: `npx vitest run src/components/downloads/CadDownloadMenu.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Update CadResultActions test labels**

In `src/components/text-to-cad/CadResultActions.test.tsx`, replace every `{ name: /download 3dm/i }` and `{ name: /download glb/i }` with `{ name: /^download$/i }`. (Four places: lines ~16, ~21, ~91, ~107.)

Run: `npx vitest run src/components/text-to-cad/CadResultActions.test.tsx`
Expected: PASS.

- [ ] **Step 6: Update WorkflowCard tests**

In `src/components/generations/WorkflowCard.test.tsx`:

Add this helper after the imports (top level):
```tsx
/** Open the card's Download list and pick the row with this hint. */
async function chooseDownload(hint: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Download' }), { key: 'Enter' });
  fireEvent.click(await screen.findByText(hint));
}
```

In `presents explicit artifact actions in user-priority order`:
- the expected list becomes `['Download', 'Open in Studio']`
- `const threedm = screen.getByRole('button', { name: 'Download 3DM' });` becomes `const threedm = screen.getByRole('button', { name: 'Download' });`

In `uses an extension-free design name for the 3DM filename`, `downloads the refreshed 3DM URL with the renamed 3DM filename and type`, and `retries with the cached 3DM URL when the fresh URL download fails`: replace
`fireEvent.click(screen.getByRole('button', { name: 'Download 3DM' }));`
with
`await chooseDownload('Rhino, editable');`

In `falls back to the cached 3DM URL when the fresh result fetch times out`, open the menu with real timers first, then switch to fake timers just before choosing, so Radix can open normally:
```tsx
  it('falls back to the cached 3DM URL when the fresh result fetch times out', async () => {
    vi.mocked(fetchCadResult).mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Download' }), { key: 'Enter' });
    const row = await screen.findByText('Rhino, editable');
    vi.useFakeTimers();
    try {
      fireEvent.click(row);
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

      expect(downloadCadArtifact).toHaveBeenCalledWith('/api/artifacts/3dm', 'ring.3dm', '3dm');
    } finally {
      vi.useRealTimers();
    }
  });
```

In the viewing-copy test (the one with `/v2.viewer.3dm`), replace its local `openMenu` with:
```tsx
    const openMenu = () =>
      fireEvent.keyDown(screen.getByRole('button', { name: 'Download' }), { key: 'Enter' });
```
and both `findByText(/viewing copy/i)` with `findByText('Viewer only (mesh)')`.

In `offers no viewing copy for a version made before it existed`, replace the last three lines with:
```tsx
    fireEvent.keyDown(screen.getByRole('button', { name: 'Download' }), { key: 'Enter' });
    await screen.findByText('Rhino, editable');
    expect(screen.queryByText('Viewer only (mesh)')).toBeNull();
```

Run: `npx vitest run src/components/generations/WorkflowCard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/downloads/CadDownloadMenu.tsx src/components/downloads/CadDownloadMenu.test.tsx \
  src/components/text-to-cad/CadResultActions.test.tsx src/components/generations/WorkflowCard.test.tsx
git commit -m "One Download button that lists each format with a hint

3DM (Rhino, editable), GLB, 3DM viewer copy, STEP, STL, then GLB with
edits when there are edits. Nothing downloads on the first press.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification, visual check, push

**Files:** none changed unless a check fails.

- [ ] **Step 1: Typecheck, lint on touched files, full suite**

```bash
npm run typecheck
npx eslint src/components/text-to-cad/CadJewelryTypeCards.tsx src/components/text-to-cad/InitialPromptScreen.tsx \
  src/components/text-to-cad/ImagePromptScreen.tsx src/pages/TextToCAD.tsx src/pages/ImageToCAD.tsx \
  src/components/downloads/CadDownloadMenu.tsx src/lib/ring-cad-nurbs-api.ts
npx vitest run
```
Expected: typecheck exit 0; eslint no errors on these files; vitest all files pass. Test count = 1400 minus the deleted `CadModelPicker.test.tsx` and `cad-model-picker.test.ts` tests plus the new ones; 0 failing. Any failure is fixed, never dismissed.

- [ ] **Step 2: Visual check**

Start `npm run dev` (port 8080), sign in, and use the design-review skill (or the browse skill) to screenshot `/text-to-cad` and `/image-to-cad` at 1440x900 and 390x844, plus the Download menu on a finished CAD result and on a Generations card. Check:
- five cards the same size, top and bottom edges aligned; on phone 3 + 2, left-aligned
- selected card has the gold border and check; Other shows sparkle + subtext
- Image to CAD: upload box and right-hand panel still share top and bottom edges
- wording changes when a different card is picked
- no model picker or material dropdown anywhere
- Download button same size as before next to Improve and Open in Studio; menu rows in order with hints
Fix anything off before continuing.

- [ ] **Step 3: Push to the jewelry branch**

```bash
git fetch origin
git rebase origin/feature/jewelry-cad-workflows   # only if the branch moved; re-run Step 1 after a rebase
git push origin HEAD:feature/jewelry-cad-workflows
```
Expected: fast-forward push to `feature/jewelry-cad-workflows`.
