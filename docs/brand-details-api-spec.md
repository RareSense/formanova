# Brand Details — Backend API Spec

Frontend branch: `feature/brand-details`. All user-facing calls go through
`authenticatedFetch` (JWT Bearer token, same as every other `/api/*` call).
Admin calls follow the existing `/api/admin/*` pattern (admin-authenticated,
same as `/api/admin/generations`).

## Data model (per user)

Extend the user profile record with:

| Field | Type | Required | Notes |
|---|---|---|---|
| `brand_name` | string | yes (once set) | Brand / business name |
| `website_url` | string | no | Marketing site |
| `social_links` | string[] | no | Instagram, TikTok, Pinterest, etc. |
| `store_url` | string | no | Shopify / Etsy / Amazon storefront (kept separate from socials so it can be catalog-parsed later) |
| `store_platform` | string | server-set | Inferred by backend, never asked from the user: `shopify` / `etsy` / `woocommerce` / `magento` / `bigcommerce` / `wix` / `squarespace` / `unknown`. Null until `store_url` is set and probed |
| `based_in` | string | no | City / country, free text |
| `target_markets` | string[] | no | e.g. ["US", "UAE"] or free text |
| `brand_book_asset_id` | string | no | Reference to an uploaded brand book file |
| `brand_updated_at` | timestamp | server-set | Last time any brand field changed |

All fields are nullable/absent until the user provides them. `social_links`
and `target_markets` are full-replace on write (no merge semantics).

---

## 1. GET /api/user/profile  (extend existing)

Auth: Bearer token.

Already returns `id`, `email`, `external_user_id`, `user_type`. Add the brand
fields:

```json
{
  "id": "user_123",
  "email": "x@y.com",
  "external_user_id": "…",
  "user_type": "jewelry_brand",
  "brand_name": "Ice Cartel",
  "website_url": "https://icecartel.com",
  "social_links": ["https://instagram.com/icecartel"],
  "store_url": "https://icecartel.com/collections/all",
  "store_platform": "shopify",
  "based_in": "New York, US",
  "target_markets": ["US", "Global"],
  "brand_book_asset_id": "asset_abc",
  "brand_updated_at": "2026-07-10T12:00:00Z"
}
```

Missing/unset fields may be `null` or omitted — frontend handles both.

## 2. PATCH /api/user/profile  (extend existing)

Auth: Bearer token.

Partial update — only the keys present in the body change. Frontend sends
this from three places:

a) Onboarding role picker (existing + brand fields when user_type is jewelry_brand):

```json
{
  "user_type": "jewelry_brand",
  "brand_name": "Ice Cartel",
  "website_url": "https://icecartel.com",
  "social_links": ["https://instagram.com/icecartel"]
}
```

b) Brand Details page — full brand edit:

```json
{
  "brand_name": "Ice Cartel",
  "website_url": "https://icecartel.com",
  "social_links": ["https://instagram.com/icecartel", "https://tiktok.com/@icecartel"],
  "store_url": "https://icecartel.com/collections/all",
  "based_in": "New York, US",
  "target_markets": ["US", "Global"]
}
```

c) Clearing an optional field — frontend sends explicit `null` / empty array:

```json
{ "website_url": null, "social_links": [] }
```

Response 200: `{ "success": true }`

Validation (server-side):
- `brand_name`: 1–120 chars when present; reject empty string.
- URLs: must parse as http(s) URLs; reject otherwise with 422 and a field-level
  error body: `{ "detail": { "website_url": "invalid URL" } }`.
- `social_links`: max 10 entries. `target_markets`: max 10 entries.

## 3. Brand book upload

POST `/api/user/brand-book`
Auth: Bearer token. Content-Type: multipart/form-data, field `file`.
Accept: PDF, PNG, JPG, WEBP. Max 20 MB.

Response 200:

```json
{ "asset_id": "asset_abc", "filename": "brandbook.pdf", "url": "https://…" }
```

Server also sets `brand_book_asset_id` on the profile (frontend does not need
a second PATCH).

DELETE `/api/user/brand-book` — removes the file and nulls
`brand_book_asset_id`. Response 200: `{ "success": true }`.

GET of the file itself: return a short-lived signed URL in the profile
response or via `GET /api/user/brand-book` →
`{ "url": "https://…signed…", "filename": "…" }` — backend's choice, tell us
which so the frontend renders the download link accordingly.

---

## 4. Admin: list users with brand info

GET `/api/admin/users/brands`
Auth: admin (same mechanism as `/api/admin/generations`).

Query params (all optional, combinable):

| Param | Type | Meaning |
|---|---|---|
| `limit` | int, default 50, max 200 | Page size |
| `offset` | int, default 0 | Pagination offset |
| `search` | string | Case-insensitive substring match on `email`, `brand_name`, `website_url`, or `store_url` |
| `platform` | string | Filter by `store_platform` (`shopify`, `etsy`, `woocommerce`, `magento`, `bigcommerce`, `wix`, `squarespace`, `unknown`) |
| `location` | string | Case-insensitive substring match on `based_in` or any `target_markets` entry |
| `has_brand` | bool | `true` = only users with `brand_name` set; `false` = only users without |
| `has_store` | bool | Filter on `store_url` presence |
| `has_brand_book` | bool | Filter on `brand_book_asset_id` presence |
| `sort` | string, default `brand_updated_at` | One of `brand_updated_at`, `brand_name`, `email` |
| `order` | string, default `desc` | `asc` / `desc` |

Examples:

```
GET /api/admin/users/brands?platform=shopify&has_brand=true
GET /api/admin/users/brands?location=new+york
GET /api/admin/users/brands?search=ice+cartel
GET /api/admin/users/brands?has_brand=false          # who skipped brand setup
```

Response 200:

```json
{
  "total": 132,
  "items": [
    {
      "user_id": "user_123",
      "email": "x@y.com",
      "user_type": "jewelry_brand",
      "brand_name": "Ice Cartel",
      "website_url": "https://icecartel.com",
      "store_url": "https://icecartel.com/collections/all",
      "store_platform": "shopify",
      "social_links": ["https://instagram.com/icecartel"],
      "based_in": "New York, US",
      "target_markets": ["US", "Global"],
      "brand_book_asset_id": "asset_abc",
      "brand_updated_at": "2026-07-10T12:00:00Z"
    }
  ]
}
```

Default (no `has_brand` param): include users with no brand data, with null
fields — admin wants to see who HASN'T filled it in too. Use
`has_brand=true|false` to narrow either way.

## 5. Admin: single user brand detail

GET `/api/admin/users/{user_id}/brand`
Auth: admin.

Response 200: same shape as one item above, plus:

```json
{
  "brand_book_url": "https://…signed…"
}
```

404 if user doesn't exist. Null fields if user exists but hasn't set brand
data.

---

## Store platform detection (backend, server-side only)

`store_platform` is never asked from the user and never sent by the frontend.
When `store_url` is set or changed, backend probes once (async is fine) and
stores the result:

1. Hostname `etsy.com/shop/…` → `etsy`
2. `GET {store_url}/products.json` returns product JSON, or response headers
   include `x-shopify-stage` / `x-sorting-hat-shopid`, or HTML references
   `cdn.shopify.com` → `shopify` (custom domains included — most serious
   Shopify stores do not have "shopify" in the URL)
3. HTML contains `wp-content/plugins/woocommerce` → `woocommerce`
4. HTML contains `Magento` markers (`/static/version…/frontend/`, `mage/`, `X-Magento-` headers) → `magento`
5. `cdn11.bigcommerce.com` in HTML → `bigcommerce`
6. `wixstatic.com` / `squarespace.com` markers → `wix` / `squarespace`
7. Otherwise → `unknown`

The platform decides which catalog parser the future enrichment job uses
(Shopify: `/products.json` gives the full catalog for free; Etsy: API or
scrape). It is also returned on the admin endpoints — "how many of our users
are Shopify stores" is a real GTM question.

## Future (not needed for v1, design the table with this in mind)

- `enriched_profile` JSON column on the same record — AI-generated vibe /
  catalog / audience summary produced by a background enrichment job after
  brand save. Written by backend only; exposed on both GET endpoints when
  present.
- The enrichment job may also infer a `detected_location` (from site footer /
  Google Business / social bios) inside `enriched_profile`. This is a
  SUGGESTION only — the frontend prefills the `based_in` field with it for
  one-tap confirmation. It never overwrites the user-provided `based_in` /
  `target_markets`, which remain the source of truth (registered address is
  often not the actual market).
