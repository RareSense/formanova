# Brand "Primary Sales Channel" Field Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the separate "Website" and "Online store" fields in the "Tell Us About Your Jewelry Brand" modal into one required "Primary sales channel" field, make that modal fully non-dismissable everywhere it's used, and widen the existing-user re-prompt so it also fires for users missing any sales channel.

**Architecture:** All changes live in three existing files: `src/components/JewelryBrandModal.tsx` (field consolidation + non-dismissable shell), `src/pages/RolePicker.tsx` and `src/components/BrandPromptHandler.tsx` (drop the now-removed `onClose` prop from their two call sites; `BrandPromptHandler` additionally widens its re-prompt gate and bumps its seen-key version). No new files except tests. No backend changes.

**Tech Stack:** React + TypeScript, Vitest + Testing Library. These commits land directly on `main` (explicit user consent — no feature branch for this task).

## Global Constraints

- Field mapping: the single "Primary sales channel" input's value is submitted as `website_url`; `store_url` is always submitted as `''`. Mark this with a `// TODO(backend):` comment for later replacement with a dedicated field.
- Label: `Primary sales channel` with the existing required-field asterisk marker (renders `Primary sales channel *`).
- Placeholder: `Paste your website, Instagram, Facebook, Etsy or other sales link` (verbatim).
- Helper text: `Add the main place where customers currently sell or showcase their jewelry.` (verbatim).
- No dropdown, no platform selector, no detected-platform message, no fallback options, no "I don't have a sales channel" state.
- "Save and Continue" requires both brand name and primary sales channel to be non-empty and (for the channel) URL-valid; both errors must be able to show at once.
- The modal (`JewelryBrandModal`) must be fully non-dismissable: no close (`X`) button, no Escape-key handling, no overlay-click-to-close, and no `onClose` prop at all — in both the fresh sign-up flow (`RolePicker.tsx`) and the existing-user re-prompt (`BrandPromptHandler.tsx`).
- `BrandPromptHandler`'s "seen" localStorage key changes from `formanova_brand_prompt_v1_` to `formanova_brand_prompt_v2_`, and its gate becomes: prompt when `user_type === 'jewelry_brand'` AND (`!brand_name` OR (`!website_url` AND `!store_url`)).
- Do not modify: `src/components/brand/BrandCard.tsx`, `src/pages/BrandDetails.tsx`, `src/lib/posthog-events.ts`, admin brand pages/API client.
- `trackBrandFormSubmitted` keeps its existing prop shape (`has_website`, `has_store`, etc.) — computed from the new single field, with `has_store` always `false`.

---

### Task 1: Consolidate fields and remove all dismiss paths in `JewelryBrandModal.tsx`

**Files:**
- Modify: `src/components/JewelryBrandModal.tsx`
- Test: `src/components/JewelryBrandModal.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Props` for `JewelryBrandModal` no longer includes `onClose`. `BrandDetails` shape is unchanged (`website_url`, `store_url` still both present, just always `''` for `store_url` on submit from this form). Tasks 2 and 3 depend on `onClose` being gone from `Props`.

- [ ] **Step 1: Write the failing test file**

```tsx
// src/components/JewelryBrandModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { JewelryBrandModal } from '@/components/JewelryBrandModal';

vi.mock('@/lib/posthog-events', () => ({
  trackBrandFormOpened: vi.fn(),
  trackBrandFormSubmitted: vi.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderModal(onContinue = vi.fn()) {
  render(
    <ThemeProvider>
      <JewelryBrandModal open source="onboarding" onContinue={onContinue} />
    </ThemeProvider>,
  );
  return { onContinue };
}

describe('JewelryBrandModal', () => {
  it('renders a single Primary sales channel field with the specified placeholder and helper text', () => {
    renderModal();
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Paste your website, Instagram, Facebook, Etsy or other sales link'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add the main place where customers currently sell or showcase their jewelry.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Website')).not.toBeInTheDocument();
    expect(screen.queryByText('Online store')).not.toBeInTheDocument();
  });

  it('does not render a close button', () => {
    renderModal();
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('does not close on Escape', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not close on overlay click', () => {
    renderModal();
    const heading = screen.getByText('Tell us about your jewelry brand');
    const overlay = heading.closest('.fixed') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.getByText('Primary sales channel')).toBeInTheDocument();
  });

  it('shows both brand-name and sales-channel errors when both are empty on submit', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));
    expect(screen.getByText('Brand name is required.')).toBeInTheDocument();
    expect(screen.getByText('Primary sales channel is required.')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('submits website_url from the sales channel field and store_url as empty', () => {
    const onContinue = vi.fn();
    renderModal(onContinue);
    fireEvent.change(screen.getByPlaceholderText('Enter your brand or business name'), {
      target: { value: 'Acme Jewelry' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Paste your website, Instagram, Facebook, Etsy or other sales link'),
      { target: { value: 'instagram.com/acme' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    const details = onContinue.mock.calls[0][0];
    expect(details.website_url).toBe('https://instagram.com/acme');
    expect(details.store_url).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/JewelryBrandModal.test.tsx`
Expected: FAIL on multiple tests — "Website"/"Online store" fields still exist and "Primary sales channel" does not; the close button (`aria-label="Close"`) still renders; pressing Escape calls the (undefined, since not passed) `onClose` prop and throws `TypeError: onClose is not a function`, failing that test too.

- [ ] **Step 3: Update imports and the `Props` interface**

In `src/components/JewelryBrandModal.tsx`, change the lucide-react import (currently `import { X, Plus, Lock, Check, Globe, MapPin, ShoppingBag } from 'lucide-react';`) to drop the now-unused `ShoppingBag` (keep `X` — it's still used by the social-profile remove buttons elsewhere in the file):

```tsx
import { X, Plus, Lock, Check, Globe, MapPin } from 'lucide-react';
```

Change the `Props` interface (currently lines 61-68) to remove `onClose`:

```tsx
interface Props {
  open: boolean;
  onContinue: (details: BrandDetails) => void;
  initial?: BrandDetails;
  /** Analytics funnel source: role picker vs existing-user Studio prompt. */
  source: 'onboarding' | 'studio_prompt';
}
```

Change the component signature (currently `export function JewelryBrandModal({ open, onClose, onContinue, initial, source }: Props) {`) to:

```tsx
export function JewelryBrandModal({ open, onContinue, initial, source }: Props) {
```

- [ ] **Step 4: Replace `websiteUrl`/`storeUrl` state with `salesChannelUrl`, and update `fieldErrors`**

Replace this block (currently lines 85-101):

```tsx
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [targetMarkets, setTargetMarkets] = useState((initial?.target_markets ?? []).join(', '));
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? '');
  const [storeUrl, setStoreUrl] = useState(initial?.store_url ?? '');
  const [handles, setHandles] = useState<Record<string, string>>(initialHandles);
```

with:

```tsx
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [targetMarkets, setTargetMarkets] = useState((initial?.target_markets ?? []).join(', '));
  // TODO(backend): the single "Primary sales channel" field is submitted as
  // website_url until a dedicated field exists on the backend; store_url is
  // always submitted empty from this form. Seed from either in case a future
  // caller passes `initial` with only store_url set.
  const [salesChannelUrl, setSalesChannelUrl] = useState(initial?.website_url || initial?.store_url || '');
  const [handles, setHandles] = useState<Record<string, string>>(initialHandles);
```

Change the `fieldErrors` declaration (currently `const [fieldErrors, setFieldErrors] = useState<Partial<Record<'website' | 'store' | 'social' | 'extra', string>>>({});`) to:

```tsx
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'salesChannel' | 'social' | 'extra', string>>>({});
```

- [ ] **Step 5: Remove `overlayRef`, the Escape-key effect, and `handleOverlayClick`**

Remove `overlayRef` from this block (currently lines 110-111), keeping `firstInputRef`:

```tsx
  const firstInputRef = useRef<HTMLInputElement>(null);
```

Delete this entire effect (currently lines 113-118):

```tsx
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
```

Delete this function entirely (currently lines 130-132):

```tsx
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };
```

- [ ] **Step 6: Update `allDone`**

Change (currently lines 144-147):

```tsx
  const allDone = Boolean(
    brandName.trim() && basedIn.trim() && parsedMarkets.length &&
    websiteUrl.trim() && (handles.instagram ?? '').trim(),
  );
```

to:

```tsx
  const allDone = Boolean(
    brandName.trim() && basedIn.trim() && parsedMarkets.length &&
    salesChannelUrl.trim() && (handles.instagram ?? '').trim(),
  );
```

- [ ] **Step 7: Rewrite `handleContinue`**

Replace the entire function (currently lines 156-200) with:

```tsx
  const handleContinue = () => {
    const hasBrandName = Boolean(brandName.trim());
    const errors: typeof fieldErrors = {};
    const site = normalizeUrl(salesChannelUrl);
    if (!site) {
      errors.salesChannel = 'Primary sales channel is required.';
    } else if (!isValidHttpUrl(site)) {
      errors.salesChannel = INVALID_URL_MESSAGE;
    }
    const badHandle = PRESET_SOCIAL_PLATFORMS.find((p) => {
      const raw = (handles[p.key] ?? '').trim();
      return raw && !isValidHandle(extractHandle(raw, p.match));
    });
    if (badHandle) errors.social = 'Handles can only contain letters, numbers, dots, dashes and underscores.';
    const extra = normalizeUrl(extraLink);
    if (extra && !isValidHttpUrl(extra)) errors.extra = INVALID_URL_MESSAGE;
    if (!hasBrandName || Object.keys(errors).length) {
      setBrandNameError(!hasBrandName);
      setFieldErrors(errors);
      if (!hasBrandName) firstInputRef.current?.focus();
      return;
    }
    const socialLinks = [...liveSocialLinks];
    if (extra) socialLinks.push(extra);
    for (const link of otherInitialLinks) {
      if (link !== extra && !socialLinks.includes(link)) socialLinks.push(link);
    }
    trackBrandFormSubmitted({
      source,
      // TODO(backend): "site" is the single primary-sales-channel value,
      // reused as website_url until a dedicated field exists (see state
      // declaration above). has_store is always false because this form no
      // longer collects a separate store URL.
      has_website: Boolean(site),
      has_store: false,
      has_location: Boolean(basedIn.trim()),
      has_markets: parsedMarkets.length > 0,
      social_count: socialLinks.length,
      has_brand_book: hasBrandBook,
    });
    onContinue({
      brand_name: brandName.trim(),
      // TODO(backend): reusing website_url as the generic "primary sales
      // channel" until a dedicated field exists; store_url intentionally
      // left blank.
      website_url: site,
      store_url: '',
      social_links: socialLinks.slice(0, 10),
      based_in: basedIn.trim(),
      target_markets: parsedMarkets,
    });
  };
```

- [ ] **Step 8: Remove the overlay ref/click-to-close and the close button from the render**

Change the opening of the returned JSX (currently lines 202-218):

```tsx
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 lg:backdrop-blur-md"
      onClick={handleOverlayClick}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col border border-border bg-background">

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Body — scrolls when content outgrows the viewport */}
```

to:

```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 lg:backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col border border-border bg-background">

        {/* Body — scrolls when content outgrows the viewport */}
```

- [ ] **Step 9: Replace the Website/Online-store fields with one Primary-sales-channel field**

Replace this block (currently lines 284-314):

```tsx
            {/* Website + Online store */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <FieldLabel label="Website" />
                <IconInput
                  icon={Globe}
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => { setWebsiteUrl(e.target.value); setFieldErrors((p) => ({ ...p, website: undefined })); }}
                  onFocus={showBack}
                  maxLength={200}
                  placeholder="yourbrand.com"
                  error={Boolean(fieldErrors.website)}
                />
                {fieldErrors.website && <p className="text-xs text-destructive">{fieldErrors.website}</p>}
              </div>
              <div className="space-y-2">
                <FieldLabel label="Online store" />
                <IconInput
                  icon={ShoppingBag}
                  type="url"
                  value={storeUrl}
                  onChange={(e) => { setStoreUrl(e.target.value); setFieldErrors((p) => ({ ...p, store: undefined })); }}
                  onFocus={showBack}
                  maxLength={200}
                  placeholder="shop.yourbrand.com"
                  error={Boolean(fieldErrors.store)}
                />
                {fieldErrors.store && <p className="text-xs text-destructive">{fieldErrors.store}</p>}
              </div>
            </div>
```

with:

```tsx
            {/* Primary sales channel */}
            <div className="space-y-2">
              <FieldLabel label="Primary sales channel" required />
              <IconInput
                icon={Globe}
                type="url"
                value={salesChannelUrl}
                onChange={(e) => { setSalesChannelUrl(e.target.value); setFieldErrors((p) => ({ ...p, salesChannel: undefined })); }}
                onFocus={showBack}
                maxLength={200}
                placeholder="Paste your website, Instagram, Facebook, Etsy or other sales link"
                error={Boolean(fieldErrors.salesChannel)}
              />
              <p className="text-xs text-muted-foreground">
                Add the main place where customers currently sell or showcase their jewelry.
              </p>
              {fieldErrors.salesChannel && <p className="text-xs text-destructive">{fieldErrors.salesChannel}</p>}
            </div>
```

- [ ] **Step 10: Update the `BrandCard` preview props**

Change (currently lines 455-463):

```tsx
                <BrandCard
                  brandName={brandName}
                  websiteUrl={websiteUrl}
                  storeUrl={storeUrl}
                  basedIn={basedIn}
                  targetMarkets={parsedMarkets}
                  socialLinks={liveSocialLinks}
                  face={cardFace === 'both' && (isMobile || !allDone) ? 'front' : cardFace}
                />
```

to:

```tsx
                <BrandCard
                  brandName={brandName}
                  websiteUrl={salesChannelUrl}
                  basedIn={basedIn}
                  targetMarkets={parsedMarkets}
                  socialLinks={liveSocialLinks}
                  face={cardFace === 'both' && (isMobile || !allDone) ? 'front' : cardFace}
                />
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx vitest run src/components/JewelryBrandModal.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 12: Commit**

```bash
git add src/components/JewelryBrandModal.tsx src/components/JewelryBrandModal.test.tsx
git commit -m "feat(brand): consolidate website/store into one required sales-channel field; make modal non-dismissable"
```

---

### Task 2: Drop the removed `onClose` prop from `RolePicker.tsx`

**Files:**
- Modify: `src/pages/RolePicker.tsx:190-196`

**Interfaces:**
- Consumes: `JewelryBrandModal`'s `Props` from Task 1 (no longer has `onClose`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Confirm the current build fails to type-check**

Run: `npx tsc --noEmit`
Expected: an error on `src/pages/RolePicker.tsx` similar to `Object literal may only specify known properties, and 'onClose' does not exist in type 'Props'` (or equivalent "no overload matches" TS2769/TS2322/TS2353-family error), since Task 1 already removed `onClose` from `Props` but this call site still passes it.

- [ ] **Step 2: Remove the `onClose` prop from the call site**

In `src/pages/RolePicker.tsx`, change (currently lines 190-196):

```tsx
    <JewelryBrandModal
      source="onboarding"
      open={showBrandModal}
      onClose={() => setShowBrandModal(false)}
      onContinue={(details) => { setBrandDetails(details); setShowBrandModal(false); }}
      initial={brandDetails ?? undefined}
    />
```

to:

```tsx
    <JewelryBrandModal
      source="onboarding"
      open={showBrandModal}
      onContinue={(details) => { setBrandDetails(details); setShowBrandModal(false); }}
      initial={brandDetails ?? undefined}
    />
```

- [ ] **Step 3: Confirm the build now type-checks cleanly**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/pages/RolePicker.tsx` or `onClose`. (Other pre-existing unrelated errors, if any, are out of scope — only confirm this file's error from Step 1 is gone.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/RolePicker.tsx
git commit -m "fix(brand): drop removed onClose prop from JewelryBrandModal call site"
```

---

### Task 3: Widen the legacy re-prompt gate in `BrandPromptHandler.tsx`

**Files:**
- Modify: `src/components/BrandPromptHandler.tsx`
- Test: `src/components/BrandPromptHandler.test.tsx` (new)

**Interfaces:**
- Consumes: `JewelryBrandModal`'s `Props` from Task 1 (no longer has `onClose`).
- Produces: nothing new for later tasks. This is the last file-modifying task.

- [ ] **Step 1: Write the failing test file**

```tsx
// src/components/BrandPromptHandler.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BrandPromptHandler } from '@/components/BrandPromptHandler';

vi.mock('@/components/JewelryBrandModal', () => ({
  JewelryBrandModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="jewelry-brand-modal" /> : null,
}));

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
  AuthExpiredError: class AuthExpiredError extends Error {},
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, initializing: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

function profileResponse(body: unknown) {
  return { json: async () => body } as Response;
}

function renderHandler() {
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <BrandPromptHandler />
    </MemoryRouter>,
  );
}

describe('BrandPromptHandler', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthenticatedFetch.mockReset();
    localStorage.setItem('formanova_onboarding_user-1', 'true');
  });

  it('opens the modal when brand_name is set but both website_url and store_url are empty', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      profileResponse({ user_type: 'jewelry_brand', brand_name: 'Acme', website_url: '', store_url: '' }),
    );
    renderHandler();
    await waitFor(() => expect(screen.getByTestId('jewelry-brand-modal')).toBeInTheDocument());
  });

  it('does not open the modal when website_url is set', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      profileResponse({ user_type: 'jewelry_brand', brand_name: 'Acme', website_url: 'https://acme.com', store_url: '' }),
    );
    renderHandler();
    await waitFor(() =>
      expect(localStorage.getItem('formanova_brand_prompt_v2_user-1')).toBe('true'),
    );
    expect(screen.queryByTestId('jewelry-brand-modal')).not.toBeInTheDocument();
  });

  it('opens the modal when brand_name is missing (existing behavior)', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      profileResponse({ user_type: 'jewelry_brand', brand_name: '', website_url: '', store_url: '' }),
    );
    renderHandler();
    await waitFor(() => expect(screen.getByTestId('jewelry-brand-modal')).toBeInTheDocument());
  });

  it('re-prompts under the v2 key a user already marked seen under v1, if they lack a sales channel', async () => {
    localStorage.setItem('formanova_brand_prompt_v1_user-1', 'true');
    mockAuthenticatedFetch.mockResolvedValue(
      profileResponse({ user_type: 'jewelry_brand', brand_name: 'Acme', website_url: '', store_url: '' }),
    );
    renderHandler();
    await waitFor(() => expect(screen.getByTestId('jewelry-brand-modal')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/BrandPromptHandler.test.tsx`
Expected: FAIL on "opens the modal when brand_name is set but both website_url and store_url are empty" and "re-prompts under the v2 key..." — today's gate only checks `!data.brand_name`, so a profile with `brand_name: 'Acme'` never opens the modal regardless of URLs, and the seen-key is still `_v1_` so the last test's `localStorage.getItem('formanova_brand_prompt_v2_user-1')` path is never reached the same way.

- [ ] **Step 3: Update the seen-key version and the gate condition**

In `src/components/BrandPromptHandler.tsx`, change (currently line 14):

```tsx
const PROMPT_SEEN_KEY_PREFIX = 'formanova_brand_prompt_v1_';
```

to:

```tsx
const PROMPT_SEEN_KEY_PREFIX = 'formanova_brand_prompt_v2_';
```

Update the docstring (currently lines 23-28):

```tsx
/**
 * One-time brand-details prompt for EXISTING jewelry_brand users who onboarded
 * before the brand fields existed (new users provide them during onboarding).
 * Shown once; dismissing it never re-prompts. They can always use the
 * Brand Details page from the profile menu later.
 */
```

to:

```tsx
/**
 * Brand-details prompt for EXISTING jewelry_brand users who are missing a
 * brand name, or missing any sales channel (website_url and store_url both
 * empty). Non-dismissable — completing the form is the only way through it.
 * Users who already have both are never shown it.
 */
```

Change the fetch handler (currently lines 45-54):

```tsx
      .then((data) => {
        if (cancelled) return;
        setCachedUserType(user.id, data.user_type ?? null);
        if (data.user_type === 'jewelry_brand' && !data.brand_name) {
          setOpen(true);
        } else {
          // Not a brand user, or brand already set — never ask again.
          localStorage.setItem(PROMPT_SEEN_KEY_PREFIX + user.id, 'true');
        }
      })
```

to:

```tsx
      .then((data) => {
        if (cancelled) return;
        setCachedUserType(user.id, data.user_type ?? null);
        const hasSalesChannel = Boolean(data.website_url) || Boolean(data.store_url);
        if (data.user_type === 'jewelry_brand' && (!data.brand_name || !hasSalesChannel)) {
          setOpen(true);
        } else {
          // Not a brand user, or brand + sales channel already set — never ask again.
          localStorage.setItem(PROMPT_SEEN_KEY_PREFIX + user.id, 'true');
        }
      })
```

- [ ] **Step 4: Remove the now-removed `onClose` prop from the `JewelryBrandModal` call site**

Change (currently line 100):

```tsx
      <JewelryBrandModal source="studio_prompt" open={open} onClose={markSeen} onContinue={handleContinue} />
```

to:

```tsx
      <JewelryBrandModal source="studio_prompt" open={open} onContinue={handleContinue} />
```

`markSeen` itself is unchanged as a function — it's still called from inside `handleContinue` (line 91, unchanged), just no longer reachable via a dismiss action.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/BrandPromptHandler.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/BrandPromptHandler.tsx src/components/BrandPromptHandler.test.tsx
git commit -m "feat(brand): re-prompt existing users missing any sales channel, not just missing brand name"
```

---

### Task 4: Full regression check and manual QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new ones from Tasks 1 and 3, and no pre-existing test broken by the `onClose` removal or the field rename (in particular, confirm no other test file references `JewelryBrandModal`'s `onClose` prop or the old `websiteUrl`/`storeUrl`/`fieldErrors.website`/`fieldErrors.store` names — a search for `onClose` and `storeUrl` under `src/` should turn up nothing tied to `JewelryBrandModal` outside the three files this plan touches).

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors in the three modified files.

Run: `npm run lint`
Expected: no new errors (in particular, no unused-import warnings for `ShoppingBag` or unused `overlayRef`/`handleOverlayClick`).

- [ ] **Step 3: Manual browser QA — fresh sign-up flow**

Start the dev server (`npm run dev`, background), sign up as a new user, reach "What best describes you?", select "Jewelry Brand." Confirm:
- The modal shows one "Primary sales channel *" field (not two URL fields), with the exact placeholder and helper text.
- There is no visible close (X) button.
- Pressing Escape does nothing; clicking the dark backdrop does nothing.
- Clicking "Save and Continue" with brand name and sales channel both empty shows both inline errors and does not proceed.
- Filling both and clicking "Save and Continue" proceeds normally, and the bespoke card preview reflects the sales-channel value as its "website" row.

- [ ] **Step 4: Manual browser QA — existing-user re-prompt**

Using a test account already flagged onboarding-complete with a `brand_name` set but no `website_url`/`store_url` (or by clearing/adjusting localStorage for `formanova_brand_prompt_v2_<userId>` and hitting an endpoint/profile state matching that shape), load `/studio` (or any non-skip path) and confirm the prompt now appears, is non-dismissable, and completing it proceeds to `/studio` as before.

No commit for this task — it's a verification gate. If any issue is found, return to the relevant task above, fix it, and re-run that task's tests before re-verifying here.

---

## Self-Review Notes

- **Spec coverage:** Field consolidation + copy (Task 1, Steps 3-9), non-dismissable modal in both call sites (Task 1 Steps 5, 8; Task 2; Task 3 Step 4), required-both-fields validation (Task 1 Step 7), `store_url`/`website_url` mapping + TODO comments (Task 1 Steps 4, 7, 10), PostHog shape preserved (Task 1 Step 7), legacy re-prompt gate + v1→v2 bump (Task 3 Steps 3), out-of-scope files (untouched throughout — `BrandCard.tsx`, `BrandDetails.tsx`, `posthog-events.ts`, admin pages are never referenced as modify targets), regression/manual QA (Task 4).
- **Placeholder scan:** No TBD/TODO placeholders in the plan itself; the `// TODO(backend):` comments are the deliberate, spec-requested markers, not plan gaps.
- **Type consistency:** `salesChannelUrl`/`setSalesChannelUrl` (Task 1 Step 4) is the single state name used consistently through Steps 6, 7, 9, 10. `fieldErrors.salesChannel` (Step 4) matches the key set and read in Steps 7 and 9. `Props` without `onClose` (Task 1 Step 3) is the exact interface Tasks 2 and 3 update their call sites against.
