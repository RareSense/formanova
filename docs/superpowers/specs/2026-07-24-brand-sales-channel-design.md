# Brand "Primary Sales Channel" Field Consolidation — Design

## Summary

Collapse the separate "Website" and "Online store" fields in the "Tell Us About Your Jewelry Brand" modal (`src/components/JewelryBrandModal.tsx`) into a single required "Primary sales channel" field. Widen the existing legacy re-prompt (`src/components/BrandPromptHandler.tsx`) so existing users who have a brand name but never submitted any URL also get (re-)prompted, without making the prompt blocking — dismissing it still lets the user continue into the app, exactly as it does today.

This work lands as commits directly on `main` (explicit user consent given — no feature branch).

## Current state (from codebase research)

- `src/components/JewelryBrandModal.tsx` — `BrandDetails` interface: `brand_name`, `website_url`, `store_url`, `social_links`, `based_in`, `target_markets`. Two independent, optional URL inputs today: "Website" (`websiteUrl` state) and "Online store" (`storeUrl` state), side by side in a `sm:grid-cols-2`. Only `brand_name` is currently required.
- `src/lib/brand-profile-api.ts` / `src/lib/admin-brands-api.ts` — confirm `website_url` and `store_url` are genuine, independent backend fields. **No `primary_sales_channel` field exists on the backend today**, and this task does not add one.
- `src/components/BrandCard.tsx` — renders a "website" row and a "store" row independently, only if each is non-empty. Not modified by this task; an empty `store_url` simply means that row doesn't render, which already matches "don't personalize/show what isn't there."
- `src/components/BrandPromptHandler.tsx` — one-time re-prompt for existing `jewelry_brand` users. Today's gate (line 48): `data.user_type === 'jewelry_brand' && !data.brand_name`. Never checks `website_url`/`store_url`. Suppression is a permanent per-browser localStorage flag keyed `formanova_brand_prompt_v1_<userId>`, set either when the user dismisses the modal (`markSeen`) or immediately, automatically, the first time the profile already has a `brand_name` (the `else` branch, line 51-52) — meaning today, a user with a brand name but no URL at all is auto-marked "seen" and will never be asked.
- `src/pages/BrandDetails.tsx` (self-serve settings page) and `src/lib/posthog-events.ts` — confirmed out of scope; left untouched.

## Scope decisions (confirmed with user)

1. **Field mapping**: the single "Primary sales channel" input's value is submitted as `website_url`; `store_url` is always submitted as `''`. A `// TODO(backend):` comment marks this as temporary, to be swapped for a dedicated field once the backend adds one.
2. **Legacy re-prompt**: `BrandPromptHandler`'s gate is widened, and the "seen" localStorage key is versioned up (`_v1_` → `_v2_`) so users already marked "seen" under the old rule (whether by dismissing, or by the old auto-skip-if-brand_name-set branch) get evaluated once under the new rule.
3. **Settings page** (`BrandDetails.tsx`), `BrandCard.tsx`, admin pages, and `posthog-events.ts` are explicitly **not** touched by this task.
4. **Fully blocking (reversal — superseded an earlier "non-blocking" decision made mid-conversation)**: `JewelryBrandModal` becomes non-dismissable everywhere it's used — both the fresh sign-up onboarding flow (`RolePicker.tsx`) and the existing-user re-prompt (`BrandPromptHandler.tsx`). There is no escape path except completing brand name + primary sales channel and clicking "Save and Continue." Confirmed mechanic: remove all dismiss paths outright (no X button, no Escape-key handling, no overlay-click-to-close) rather than intercepting them with validation — the close affordance simply doesn't exist while the modal is open.

## `JewelryBrandModal.tsx` changes

- Replace `websiteUrl`/`storeUrl` state with a single `salesChannelUrl` state, seeded `initial?.website_url || initial?.store_url || ''`.
- Replace the two-column Website/Online-store grid with one full-width field:
  - Label: `Primary sales channel` with the existing `required` marker (renders as `Primary sales channel *`, matching the existing "Brand name" required-field pattern).
  - Placeholder: `Paste your website, Instagram, Facebook, Etsy or other sales link`.
  - Helper text below the input: `Add the main place where customers currently sell or showcase their jewelry.`
  - No dropdown, no platform selector, no detected-platform message, no fallback options, no "I don't have a sales channel" state.
- `fieldErrors` union changes from `'website' | 'store' | 'social' | 'extra'` to `'salesChannel' | 'social' | 'extra'`.
- `handleContinue` validates brand name and sales channel independently (not an early-return chain), so if both are empty, both errors surface together on one click — matches "Save and Continue requires both brand name and primary sales channel to be completed."
- On successful submit: `onContinue({ ..., website_url: site, store_url: '', ... })` with a `// TODO(backend):` comment explaining the temporary reuse.
- `trackBrandFormSubmitted` keeps its existing prop shape: `has_website: Boolean(site)`, `has_store: false` (with an inline comment — the store field no longer exists in this form). `posthog-events.ts` itself is unchanged.
- `allDone` (drives the bespoke-card auto-flip-to-both behavior) uses `salesChannelUrl.trim()` in place of `websiteUrl.trim()`.
- Remove the now-unused `ShoppingBag` icon import.
- `BrandCard` preview receives `websiteUrl={salesChannelUrl}` and no longer passes a `storeUrl` prop (defaults to `''`); `BrandCard.tsx` itself is unmodified.

### Non-dismissable modal (both call sites)

The modal can no longer be closed except by completing and submitting the form. Concretely, in `JewelryBrandModal.tsx`:

- Remove the `X` close button (`aria-label="Close"`) entirely from the render.
- Remove the `keydown`/`Escape` `useEffect` that currently calls `onClose()`.
- Remove the overlay-click handler (`handleOverlayClick`) that currently calls `onClose()` when the click target is the backdrop.
- Remove the `onClose` prop from the `Props` interface — there is no longer any code path inside this component that would call it.

This has two knock-on call-site changes, since `onClose` becomes a prop nobody can pass meaningfully:

- `src/pages/RolePicker.tsx`: drop the `onClose={() => setShowBrandModal(false)}` prop from the `<JewelryBrandModal>` call. The modal now only closes itself, via `onContinue`, the same way it already does today (`setBrandDetails(details); setShowBrandModal(false);`).
- `src/components/BrandPromptHandler.tsx`: drop the `onClose={markSeen}` prop from the `<JewelryBrandModal>` call. `markSeen()` is still called — from inside `handleContinue`, immediately before `navigate('/studio')` — it is simply no longer reachable via a dismiss action, only via successful completion.

This is a deliberate reversal of the "non-blocking, dismissable" behavior discussed earlier in this conversation — confirmed explicitly with the user. Both the fresh sign-up flow and the existing-user re-prompt now require completing brand name + primary sales channel with no way to skip.

## `BrandPromptHandler.tsx` changes

- `PROMPT_SEEN_KEY_PREFIX`: `'formanova_brand_prompt_v1_'` → `'formanova_brand_prompt_v2_'`.
- Gate condition (was `data.user_type === 'jewelry_brand' && !data.brand_name`) becomes:
  ```ts
  const hasSalesChannel = Boolean(data.website_url) || Boolean(data.store_url);
  if (data.user_type === 'jewelry_brand' && (!data.brand_name || !hasSalesChannel)) {
    setOpen(true);
  }
  ```
- Docstring comment updated to describe both trigger conditions (missing brand name, or missing sales channel) and the new non-dismissable behavior.
- `markSeen` itself is unchanged as a function (still sets the localStorage flag and `setOpen(false)`) — it's just no longer wired to an `onClose` prop; it's called only from `handleContinue` now.
- No change to `SKIP_PATHS` or the effect's dependency array/eslint-disable — both remain correct under the new gate.

## Regression risks and how this design avoids them

- **`store_url` never sent again from this modal** — anything reading `store_url` off a profile (admin table, `BrandCard`'s store row) simply sees it stay `''`/unset for brand-new submissions through this modal; it does not clear or overwrite any *existing* `store_url` a user set previously via the separate `BrandDetails.tsx` settings page, since `authenticated-fetch`/`brand-profile-api.ts` PATCH semantics are untouched and `BrandPromptHandler.handleContinue` already only includes fields that are truthy in its PATCH body (`store_url` submitted as `''` is falsy, so it's omitted from the PATCH — an existing store_url is left alone).
- **Removing `onClose` is a breaking prop-signature change** — both current call sites (`RolePicker.tsx`, `BrandPromptHandler.tsx`) are updated in the same change, so nothing is left passing a prop that no longer exists. No other file constructs `<JewelryBrandModal>` (confirmed during earlier research — only these two call sites exist).
- **Users who reload/navigate away mid-modal** — removing in-app dismiss paths doesn't prevent a hard browser navigation (back button, closing the tab, typing a new URL). That's outside this component's control either way, before or after this change, and is not a regression introduced here: the effect in `BrandPromptHandler` already re-evaluates from scratch (via the profile fetch) on every mount, so the modal simply reopens on their next visit if they still lack the required data.
- **v2 key bump affects non-brand users too** (the `else` branch also marks any non-`jewelry_brand` user "seen") — this just costs those users one extra harmless profile fetch + re-mark-seen on their next visit after this ships; no user-visible change for them.

## Testing

- `src/components/JewelryBrandModal.test.tsx` (new):
  - Renders one "Primary sales channel" field with the specified placeholder and helper text; does not render "Website" or "Online store" labels.
  - Does not render a close (`X`) button.
  - Pressing Escape does not call `onContinue` and the modal contents remain rendered (there is no `onClose` to call, so this asserts the modal is still open/unaffected).
  - Clicking the overlay backdrop does not close the modal (contents remain rendered).
  - Clicking Save with brand name and sales channel both empty shows both error messages, does not call `onContinue`.
  - Clicking Save with a valid brand name and sales channel calls `onContinue` with `website_url` equal to the normalized pasted value and `store_url: ''`.
- `src/components/BrandPromptHandler.test.tsx` (new — none exists today):
  - Profile with `brand_name` set, `website_url`/`store_url` both empty → modal opens.
  - Profile with `brand_name` set and `website_url` set → modal does not open.
  - Profile with `brand_name` unset → modal opens (existing behavior, still covered).
  - A user already marked "seen" under the `_v1_` key is still prompted once under `_v2_` if they lack a sales channel (key bump takes effect).
- No test needed asserting `RolePicker.tsx` no longer passes `onClose` — this is a compile-time prop-shape fact (removing the prop from `Props` makes passing it a TypeScript error), enforced by `tsc`/build, not runtime behavior worth a dedicated test.

## Explicitly out of scope

- Adding a `primary_sales_channel` backend field — left as a `// TODO(backend)` comment only.
- `BrandDetails.tsx` settings page, `BrandCard.tsx`, admin brand pages, `posthog-events.ts` — untouched.
- Making the re-prompt blocking/mandatory — it remains dismissable.
