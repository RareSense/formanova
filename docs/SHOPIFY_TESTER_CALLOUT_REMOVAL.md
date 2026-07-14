# Shopify App-Review Tester Callout - Removal Instructions

Temporary callout that shows the development test-store credentials above the
two Shopify connection entry points, only for the app-review tester account.
Delete everything below once Shopify app review is complete.

## Setup (while active)

1. Fill in the credentials in `src/components/shopify/ShopifyTesterCallout.tsx`:
   - `TESTER_STORE_EMAIL`
   - `TESTER_STORE_PASSWORD`
2. Add the tester account email(s) to `.env` (comma-separated):
   ```
   VITE_SHOPIFY_TESTER_EMAILS=tester@example.com
   ```
   The callout renders ONLY for logged-in users whose email is in this list.
   It stays visible until the tester clicks the button it points at.

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

3. **Clean env vars:** remove `VITE_SHOPIFY_TESTER_EMAILS` from `.env` and any
   deployment environment.

4. **Delete this file:** `docs/SHOPIFY_TESTER_CALLOUT_REMOVAL.md`

Nothing else references the callout. A `grep -r ShopifyTesterCallout src/`
returning no results confirms complete removal.
