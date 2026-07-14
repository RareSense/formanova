# Shopify App-Review Tester Callout - Removal Instructions

Temporary callout that shows the development test-store credentials above the
two Shopify connection entry points, only for the app-review tester account.
Delete everything below once Shopify app review is complete.

## Setup (while active)

Add both vars to `.env` (nothing is hardcoded in the repo):
```
VITE_SHOPIFY_TESTER_STORE_EMAIL=test-store-login@example.com
VITE_SHOPIFY_TESTER_STORE_PASSWORD=the-test-store-password
```
- These are the credentials displayed in the callout. If either is missing,
  the callout does not render at all.
- The callout shows for EVERY logged-in user when the vars are set, so set
  them ONLY on the environment used for Shopify app review, never production.
- It stays visible until the tester clicks the button it points at.
- Vite bakes these in at build time; rebuild after changing them. They are
  visible in the built JS bundle, so use throwaway test-store credentials only.

## How to remove (3 steps)

1. **Delete the component file:**
   - `src/components/shopify/ShopifyTesterCallout.tsx`

2. **Unwrap the two usages** (search for `ShopifyTesterCalloutAnchor`):
   - `src/components/shopify/ShopifyPublishButton.tsx`
     - Remove the import line (marked with a `TEMPORARY` comment)
     - Remove the `<ShopifyTesterCalloutAnchor>` / `</ShopifyTesterCalloutAnchor>`
       tags around the `<Button>`; keep the button as-is
   - `src/pages/MyShopifyStore.tsx`
     - Remove the import line (marked with a `TEMPORARY` comment)
     - Remove the `<ShopifyTesterCalloutAnchor>` / `</ShopifyTesterCalloutAnchor>`
       tags around the connect `<Button>` in `ConnectCard`; keep the button as-is

3. **Clean env vars:** remove `VITE_SHOPIFY_TESTER_STORE_EMAIL` and
   `VITE_SHOPIFY_TESTER_STORE_PASSWORD` from `.env` and any deployment
   environment.

4. **Delete this file:** `docs/SHOPIFY_TESTER_CALLOUT_REMOVAL.md`

Nothing else references the callout. A `grep -r ShopifyTesterCallout src/`
returning no results confirms complete removal.
