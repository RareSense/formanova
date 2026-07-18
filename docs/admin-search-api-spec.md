# Admin Search API Spec (for backend)

Context: the admin panel needs "typical search box" behavior — the admin types a
**partial** email (or workflow name) and **close matches appear live**, across
**all** records, not just the current page.

The frontend list is server-paginated (20 rows/page), so the browser can only ever
filter the page it currently holds. Reliable partial search therefore MUST be done
server-side. The frontend already sends the partial term to the endpoints below; what
we need from the backend is **case-insensitive substring (LIKE / ILIKE) matching** on
the relevant fields.

---

## 1. Generations list — `GET /api/admin/generations`

Already consumed by the frontend (`src/lib/admin-generations-api.ts`). The frontend
now sends the raw partial term in `user_email` or `workflow_name`.

### Query params

| Param            | Type    | Notes                                                                 |
|------------------|---------|-----------------------------------------------------------------------|
| `limit`          | int     | Page size (default 20, max 100).                                      |
| `offset`         | int     | Pagination offset (>= 0).                                             |
| `user_email`     | string  | **REQUIRED CHANGE:** match with case-insensitive **substring** (ILIKE `%term%`). Partial input like `john` must return `john@x.com`, `johnny@y.com`, etc. |
| `workflow_name`  | string  | **REQUIRED CHANGE:** same case-insensitive **substring** match. Partial `photoshoot` returns `jewelry_photoshoots_generator`, etc. |
| `status`         | string  | Exact: `queued` \| `running` \| `completed` \| `failed` \| `cancelled`. |
| `has_feedback`   | bool    | Filter to rows with/without a complaint.                             |
| `user_type`      | string  | Exact: `jewelry_brand` \| `freelancer` \| `researcher_student` \| `content_creator` \| `other`. |
| `is_paying`      | bool    | Paying vs free.                                                      |

All filters are ANDed. `total` must reflect the count **after** filtering (so
pagination is correct).

### Response 200

```json
{
  "items": [
    {
      "workflow_id": "string",
      "workflow_name": "string",
      "status": "completed",
      "created_at": "2026-07-01T08:00:00Z",
      "finished_at": "2026-07-01T08:01:00Z",
      "user_email": "user@example.com",
      "actual_cost": 12.5,
      "provider_cost": 3.1,
      "user_type": "jewelry_brand",
      "is_paying": true,
      "feedback_id": "uuid-or-null"
    }
  ],
  "total": 1234,
  "limit": 20,
  "offset": 0
}
```

### Acceptance test
`GET /api/admin/generations?user_email=jo&limit=20` returns every user whose email
contains `jo` (case-insensitive), paginated, with `total` = full match count.

---

## 2. Feedback list — `GET /api/feedback`  (gap: no email search today)

Consumed by `src/lib/feedback-api.ts`. Current params: `limit`, `offset`, `category`,
`generation_type`, `email_status`, `created_after`, `created_before`. There is **no
way to search feedback by reporter email**.

### Required change
Add a `reporter_email` query param, case-insensitive **substring** match:

| Param            | Type   | Notes                                             |
|------------------|--------|---------------------------------------------------|
| `reporter_email` | string | ILIKE `%term%` on the feedback's reporter email.  |

Response shape is unchanged (`FeedbackListResponse` — `items[]`, `total`, `limit`,
`offset`), with `total` reflecting the filtered count.

### Acceptance test
`GET /api/feedback?reporter_email=jo` returns all feedback whose reporter email
contains `jo`.

---

## 3. User brands list — `GET /api/admin/users/brands`  (new endpoint)

Full endpoint contract lives in `docs/brand-details-api-spec.md` (section 4).
Search behavior must follow the same conventions as the endpoints above:

### Query params (search-relevant subset)

| Param        | Type   | Notes                                                                                     |
|--------------|--------|-------------------------------------------------------------------------------------------|
| `search`     | string | Case-insensitive **substring** (ILIKE `%term%`) across `email`, `brand_name`, `website_url`, `store_url`. One box, four fields — partial `ice` must return "Ice Cartel". |
| `location`   | string | Case-insensitive substring on `based_in` OR any `target_markets` entry.                   |
| `platform`   | string | Exact: `shopify` \| `etsy` \| `woocommerce` \| `bigcommerce` \| `wix` \| `squarespace` \| `unknown`. |
| `has_brand` / `has_store` / `has_brand_book` | bool | Presence filters.                                           |
| `limit` / `offset` | int | Same pagination contract; `total` = count after filtering.                          |
| `sort` / `order`   | string | `brand_updated_at` (default) \| `brand_name` \| `email`; `asc`/`desc`.              |

All filters ANDed, like the other endpoints.

### Acceptance test
`GET /api/admin/users/brands?search=ice` returns every user whose email, brand
name, website URL, or store URL contains `ice` (case-insensitive), with `total`
= full match count.

---

## Notes for the backend
- Case-insensitive: use `ILIKE` (Postgres) or `LOWER(col) LIKE LOWER(:term)`.
- Escape `%` and `_` in the user term so they are treated as literals.
- Index suggestion: a trigram (`pg_trgm` GIN) index on `user_email` / `workflow_name`
  / `reporter_email` / `brand_name` keeps substring search fast at scale.
- Keep `total` consistent with the filtered set so the frontend paginator is correct.
