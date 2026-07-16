# Shopify Integration: Connection Fixed, Export Blocked - Backend Handoff

Date: 2026-07-17
Environment: staging (`staging-gsdgds12.formanova.ai`)

---

## The two apps (client IDs)

| App | Client ID | Status |
|---|---|---|
| OLD custom app | `ae47d5b4db86db8f852cfed2544123b1` | Dead. Custom-distribution, locked to test store `formanova-rgjliypg.myshopify.com`, its install link signature expired 2026-05-28. Do not use anywhere. |
| NEW public app (submitted for App Store review) | `d2d12989da2fb5578ca789bd2734f48f` | Active. Created 2026-05-22. This is the only app that matters. |

Backend staging env already has the correct `SHOPIFY_API_KEY=d2d12989...` and matching secret. Do NOT change credentials.

---

## Part 1: What was broken and is now FIXED (connection flow)

The Shopify app-review rejection ("Unauthorized Access") was caused by the frontend
`VITE_SHOPIFY_APP_LISTING_URL` pointing at the OLD app's expired, store-locked custom install link:

```
https://admin.shopify.com/store/formanova-rgjliypg/oauth/install_custom_app
  ?client_id=ae47d5b4db86db8f852cfed2544123b1&no_redirect=true&signature=<expired 2026-05-28>
```

Clicking it returned `403 Forbidden` from Shopify for everyone (reproduced in browser).

Fixes applied (all config, no backend code):
1. Frontend staging env now uses the managed-install link of the new app:
   `https://admin.shopify.com/oauth/install?client_id=d2d12989da2fb5578ca789bd2734f48f`
2. Dev Dashboard App URL -> `https://staging-gsdgds12.formanova.ai/api/shopify/install`,
   redirect URL -> `https://staging-gsdgds12.formanova.ai/api/shopify/callback`.

Result: full OAuth flow now works. Install -> `/api/shopify/install` (HMAC ok) ->
authorize -> `/api/shopify/callback` (state ok, token exchange ok) -> connection row
saved -> `/shopify/link` binds it to the user. Store `shell-jewelry-n6ipnfxr.myshopify.com`
shows as Connected in FormaNova.

---

## Part 2: What is STILL BROKEN (every Admin API call, therefore export)

### Symptom

`POST /api/shopify/export` returns 500. Traceback (journalctl, 2026-07-16 22:51:29 UTC):

```
File "src/api/routes_shopify.py", line 243, in shopify_export
    staged = await shopify_gql.staged_uploads_create(
httpx.HTTPStatusError: Client error '403 Forbidden' for url
'https://shell-jewelry-n6ipnfxr.myshopify.com/admin/api/2026-04/graphql.json'
```

Also: the connected card shows the raw domain instead of the store name, because
`fetch_shop_name` (first Admin API call after connect) fails silently with the same 403.

### Exact reproduction

We decrypted the stored token with the backend's own `decrypt_token()` and called
the Admin API directly:

Request:
```
GET https://shell-jewelry-n6ipnfxr.myshopify.com/admin/api/2026-04/shop.json
X-Shopify-Access-Token: <decrypted stored token>
```

Response:
```
HTTP 403
X-Request-ID: 27ebaf7b-c1cb-4793-a3ed-e81f6b5734f4-1784244155
{"errors":"[API] Non-expiring access tokens are no longer accepted for the Admin API.
Start using expiring offline tokens: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens#expiring-vs-non-expiring-offline-tokens"}
```

### Root cause

Public apps created on or after 2026-04-01 MUST use expiring offline tokens.
Our new app was created 2026-05-22, so the mandate applies. The backend's
`exchange_code_for_token` requests the legacy non-expiring token; Shopify issues it
but the Admin API refuses to accept it. The old app was grandfathered, which is why
this code used to work.

Ruled out (verified): credentials, HMAC, state/nonce, shop domain, scopes
(`write_files,write_products` granted, confirmed in DB), API version.
Changelog: https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-public-apps-april-1-2026

### Current DB state (staging, `shopify_connections`)

```
formanova-rgjliypg.myshopify.com   | user=3d342f42-... | uninstalled_at=2026-07-14 | scope=write_files,write_products
shell-jewelry-n6ipnfxr.myshopify.com | user=ba6e158a-... | uninstalled_at=None      | scope=write_files,write_products  <- holds the rejected token
```

---

## Part 3: What to do now (backend change, ~80-100 lines)

### 3.1 `src/shopify/oauth.py`

- In `exchange_code_for_token`, add `"expiring": 1` to the JSON body of
  `POST https://{shop}/admin/oauth/access_token`. Response then contains:
  `access_token` (expires_in: 3600 = 1h), `refresh_token`
  (refresh_token_expires_in: 7776000 = 90d), `scope`.
- Add `refresh_access_token(shop, refresh_token)`: same endpoint, body
  `client_id`, `client_secret`, `grant_type=refresh_token`, `refresh_token`.
  Returns a NEW access token AND a NEW refresh token (rotation - always persist both).

### 3.2 `src/database/models.py` + migration

New nullable columns on `ShopifyConnection`:
- `refresh_token_encrypted` (Text)
- `access_token_expires_at` (DateTime tz)
- `refresh_token_expires_at` (DateTime tz)

Nullable = trivial migration, no backfill.

### 3.3 `src/api/routes_shopify.py`

- `/shopify/callback`: encrypt the refresh token (same `encrypt_token`), compute both
  expiry timestamps, include all three in the Redis pending record
  (`store_pending_connection` gains params - it is a JSON blob).
- `/shopify/link`: pass the new fields into `upsert_shopify_connection`.

### 3.4 Token helper (core of the change)

`get_valid_access_token(conn)`: if `access_token_expires_at` is null (legacy row) or
more than ~5 min away, decrypt and return the stored token. Otherwise decrypt the
refresh token, call `refresh_access_token`, persist BOTH rotated tokens + expiries,
return the new access token. On refresh 4xx: `mark_shopify_uninstalled(shop)` and
raise `ShopifyAuthError` - the existing `reconnect_required` path in `/shopify/export`
handles the rest; the frontend already understands it. No frontend changes needed.

Use the helper everywhere `decrypt_token(conn.access_token_encrypted, ...)` appears:
`/shopify/export` (~line 222) and `/shopify/suggest` (when re-enabled). The token used
inside `/shopify/link` is seconds old, fine as-is.

### 3.5 `src/database/repository.py`

- `upsert_shopify_connection`: accept + store the three new fields.
- New `update_shopify_tokens(...)`: encrypt and persist the rotated pair + expiries.

### 3.6 Tests

Extend `tests/unit/test_shopify_oauth.py` and
`tests/integration/test_shopify_oauth_routes.py`:
- exchange body includes `expiring=1`
- callback/link persist refresh token + expiries
- helper: fresh -> no refresh; expired -> refresh + both tokens rotated in DB;
  refresh 4xx -> `reconnect_required`

### 3.7 Strongly recommended (2 lines)

In `src/shopify/graphql.py::_post_graphql`, log `resp.text` on any non-2xx.
This bug took hours because Shopify's 403 body was swallowed and the API returned
a bare 500.

---

## Part 4: Deploy + verify

1. Run migration, deploy to staging, restart the API.
2. One-time token replacement (there is no in-place conversion of the old token):
   - FormaNova -> /my-shopify-store -> Disconnect
   - shell-jewelry Shopify admin -> Settings -> Apps and sales channels -> uninstall FormaNova
   - FormaNova -> Connect your Shopify store -> complete install
3. Sanity check: connected card must show the STORE NAME (not the .myshopify.com
   domain). Name showing = first Admin API call succeeded.
4. Export a photo from /generations -> draft product must appear in the store.
5. Expiry path: wait >1h and export again (or temporarily shrink the freshness window)
   and confirm both tokens rotate in the DB.

## Blocking note

This must land BEFORE resubmitting to Shopify app review: the reviewer will test an
export and hit the same 500.

Docs:
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
- https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-public-apps-april-1-2026
