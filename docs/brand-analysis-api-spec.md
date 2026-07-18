
# Brand Analysis — Backend API Spec (follow-up to brand-details)

Follow-up to `docs/brand-details-api-spec.md`, which is already built - nothing
in this doc changes any existing endpoint, field, or behavior from that spec.
Everything here is additive: new tables, new admin endpoints.

Brand-details covers COLLECTING brand data (website, socials, store, brand
book). This spec covers what we do with it: forming an opinion on the brand's
aesthetic / vibe / theme, storing that opinion, keeping it fresh, and letting
a human correct it. Admin calls follow the existing `/api/admin/*` pattern.

## Why this exists

We collect the brand's website, Instagram, store URL and brand book so we can
analyze them and form an opinion on the brand's aesthetic: who the jewelry is
for, what it looks like, how it's photographed. That opinion feeds future
generation prompting ("shoot this in the brand's style") and GTM segmentation.

## Data model

### `source_snapshots` (raw scraped data, immutable)

One row per fetch of one source. Kept as-is, not discarded after the AI reads
it - if the AI's opinion is ever in question, we want to open the exact bytes
it saw.

| Field | Type | Notes |
|---|---|---|
| `snapshot_id` | string | PK |
| `user_id` | string | The brand's user |
| `source` | string | `website` / `store_catalog` / `site_images` / `brand_book` |
| `url` | string/null | What was fetched |
| `fetched_at` | timestamp | |
| `http_status` | int/null | |
| `content_hash` | string | Drives re-fetch dedup |
| `storage_ref` | string | Object-storage key for the raw body |
| `error` | string/null | Set when the fetch failed; failed fetches are recorded too |

### `brand_analysis` (AI's opinion, versioned per user)

| Field | Type | Notes |
|---|---|---|
| `analysis_id` | string | PK |
| `user_id` | string | FK to user |
| `version` | int | Increments per re-analysis; latest = live |
| `status` | string | `pending` / `complete` / `failed` |
| `sources` | string[] | What was actually read: `website`, `store_catalog`, `site_images`, `brand_book`. Never `instagram` |
| `snapshot_ids` | string[] | Which `source_snapshots` rows this version was computed from |
| `ai_profile` | JSON | AI-generated opinion, shape below |
| `analyzed_at` | timestamp | |
| `stale` | bool | Server-computed, see staleness rules |

`ai_profile` shape (all fields optional, best-effort):

```json
{
  "gender_focus": "womens",
  "apparent_ethnicities": ["white", "black", "south asian"],
  "palette": ["#C9A227", "#FFFFFF", "#1A1A1A"],
  "brand_identity": { "logo_colors": ["#C9A227"], "fonts": ["serif display"] },
  "photography_style": "clean studio on white, occasional on-model lifestyle",
  "aesthetic": "minimal fine jewelry, warm gold tones, editorial",
  "audience": "women 25-40, US",
  "price_positioning": "mid-to-premium",
  "channels": {
    "website": { "pose_consistency": "standardized", "aesthetic": "clean ecom, catalog-first" },
    "instagram": { "pose_consistency": "varied", "aesthetic": "moody lifestyle" }
  },
  "confidence": 0.7,
  "summary": "One-paragraph plain-text opinion."
}
```

`channels.<name>` holds per-channel deltas since a brand's website and
Instagram often look different. AI fills `website` / `store`. `instagram` is
human-written only (see below).

### `brand_notes` (human corrections, one set per user, editable)

Free-text notes an admin attaches to a brand. Unlike a changelog, these are
**editable in place** - a correction replaces the old note, it doesn't pile
up as history.

| Field | Type | Notes |
|---|---|---|
| `note_id` | string | PK |
| `user_id` | string | The brand's user |
| `author_email` | string | Admin who wrote/last edited it |
| `source` | string | `instagram` / `website` / `call` / `other` |
| `body` | string | 1-2000 chars |
| `updated_at` | timestamp | |

### `human_overrides` (one JSON object per user)

Same keys as `ai_profile`. Any key present here wins over the AI value in the
merged view. Editable; sending a key as `null` removes the override. Survives
re-analysis.

### `instagram_review` (one per user)

| Field | Type | Notes |
|---|---|---|
| `status` | string | `not_applicable` / `pending` / `done` |
| `reviewed_by` | string/null | Admin email |
| `reviewed_at` | timestamp/null | |

Instagram cannot be scraped - Meta prohibits and litigates against it. Set to
`pending` automatically whenever the user has an Instagram URL in
`social_links` and no completed review. An admin opens the Instagram
manually, looks, writes a `brand_notes` entry with `source: "instagram"`, and
marks the review done.

## Staleness / re-analysis

| Trigger | Behavior |
|---|---|
| Scheduled | Every 3 months, re-scrape + re-analyze automatically, per brand |
| User edited brand info | `brand_updated_at` (from brand-details) newer than `analyzed_at` triggers a re-run |
| Manual | Admin forces a re-run any time (rebrand, new collection) |

Every re-run creates a NEW `brand_analysis` version. `brand_notes`,
`human_overrides`, and `instagram_review` are per-user, not per-version, so
they carry forward automatically.

---

## Endpoints

### 1. GET /api/admin/users/{user_id}/brand-analysis

Auth: admin. The single-brand deep view.

Response 200:

```json
{
  "analysis": {
    "analysis_id": "ba_123",
    "version": 3,
    "status": "complete",
    "sources": ["website", "store_catalog", "site_images"],
    "ai_profile": { "aesthetic": "...", "confidence": 0.7 },
    "analyzed_at": "2026-07-01T12:00:00Z",
    "stale": false
  },
  "human_overrides": { "price_positioning": "premium" },
  "merged_profile": { "aesthetic": "...", "price_positioning": "premium" },
  "notes": [
    {
      "note_id": "note_1",
      "author_email": "admin@raresense.so",
      "source": "instagram",
      "body": "Insta is moodier than the site: dark backgrounds, heavy gold.",
      "updated_at": "2026-07-02T09:00:00Z"
    }
  ],
  "instagram_review": {
    "status": "done",
    "reviewed_by": "admin@raresense.so",
    "reviewed_at": "2026-07-02T09:00:00Z"
  }
}
```

`merged_profile` = `ai_profile` overlaid with `human_overrides`; it is the
ONLY field downstream consumers (generation prompting, GTM exports) should
read. `analysis` is `null` if no job has run yet.

### 2. POST /api/admin/users/{user_id}/brand-analysis/rerun

Auth: admin. Forces a re-analysis (new version, async).
Response 202: `{ "analysis_id": "ba_124", "status": "pending" }`.
409 if a run is already pending for this user.

### 3. POST /api/admin/users/{user_id}/brand-notes

Auth: admin. Creates a note. Body:

```json
{ "source": "instagram", "body": "Confirmed the gold-heavy aesthetic." }
```

Response 200: the created note.

### 4. PATCH /api/admin/users/{user_id}/brand-notes/{note_id}

Auth: admin. Edits a note in place (unlike brand-details' append-only
patterns elsewhere, notes here are corrections meant to stay current).

```json
{ "body": "Updated: gold-heavy aesthetic, dark backgrounds throughout." }
```

Response 200: the updated note.

### 5. PATCH /api/admin/users/{user_id}/brand-overrides

Auth: admin. Partial update, same key semantics as the profile PATCH: present
keys change, `null` removes the override.

```json
{ "price_positioning": "premium", "audience": null }
```

Response 200: the full current `human_overrides` object.

### 6. POST /api/admin/users/{user_id}/instagram-review/complete

Auth: admin. Marks the Instagram review done (`reviewed_by` from the admin
token, `reviewed_at` now). Typically called right after posting an
`instagram`-source note, but not coupled - a review with zero notes
("Insta matches the site, nothing to add") is legitimate.
Response 200: the updated `instagram_review` object.

### 7. GET /api/admin/brand-analyses  (worklist)

Auth: admin. The queue view: "what needs attention".

| Param | Type | Meaning |
|---|---|---|
| `needs` | string | `instagram_review` (pending), `rerun` (stale=true), `first_run` (brand data exists, no analysis yet) |
| `limit` / `offset` | int | Same defaults as `/api/admin/users/brands` |

Response 200: `{ "total": N, "items": [ { "user_id", "email", "brand_name", "analysis_status", "analyzed_at", "stale", "instagram_review_status" } ] }`

---

## Open / not decided yet - flag before building

- **Dedup for known brands**: if brand X was already scraped for another
  user, should a new submission reuse that data instead of scraping from
  zero? Not designed.
- **Speed tiering**: one full pass, or a fast shallow pass on submit plus a
  deeper async pass after? Not decided.
- Confirm the `ai_profile` fields above against a real scrape (Fallon
  Jewelry's `products.json` has been pulled as a first test) before treating
  the shape as final - some fields (ethnicities, pose consistency) need
  image analysis, not just catalog text, and haven't been validated yet.

## Non-goals for v1

- No user-facing exposure of the analysis - the brand never sees our opinion
  of them; `GET /api/user/profile` does NOT include it.
- No automated Instagram fetching of any kind.
- No per-version diffing UI - versions exist for audit, endpoints return
  latest only.
