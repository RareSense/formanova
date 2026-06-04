# AI_RULES.md - FormaNova Engineering Rules

These rules govern all AI-assisted and human code changes to this repo.
They exist to stop architectural drift. Violations must be fixed before merge.

---

## 1. Protected backend calls

Protected backend calls must use `authenticatedFetch`.

Raw `fetch` is allowed only for:
- Public/direct asset URLs confirmed not to be `/api` or `/artifacts`
- `blob:` URLs
- `data:` URLs
- Auth bootstrap endpoints under `/auth` before a session exists
- Static public files such as `/version.json`
- The internals of `authenticatedFetch` itself

---

## 2. authenticatedFetch contract

Do not add `noRedirect`, `suppress401`, `skipAuthExpiry`, or per-caller exception options to `authenticatedFetch`.

`authenticatedFetch` owns centralized 401 behavior.

If a page needs custom UI after `AuthExpiredError`, catch `AuthExpiredError` at the call site, but do not expect that catch to prevent the redirect.

---

## 3. Runtime URLs

No hardcoded production backend URLs like `https://formanova.ai` in runtime API code.

Use relative `/api/...` paths for same-origin backend calls.

Use `VITE_API_BASE_URL` only when an absolute backend origin is truly required.

Public/legal/SEO links may use `VITE_PUBLIC_SITE_URL`.

---

## 4. Azure/storage URLs

No hardcoded Azure blob URLs in page or component code.

Prefer backend-returned asset URLs.

If frontend config is unavoidable, use:
- `VITE_AZURE_BLOB_BASE_URL`
- `VITE_MODEL_ASSET_BASE_URL`

---

## 5. Polling

No new polling loops inside page components.

New generation workflows must define:
- start endpoint
- status endpoint
- result endpoint
- interval
- timeout
- terminal states
- transient 404 policy
- error limit
- cancellation on unmount
- product-specific result parser

---

## 6. Credits and paid features

No new credit checks scattered inside pages unless using the existing shared preflight helpers.

New paid features must define:
- feature flag
- `TOOL_COSTS` key
- backend workflow name
- credit preflight
- insufficient-credit UI
- backend start call
- credit balance refresh after completion

`TOOL_COSTS` keys must match real workflow names or have a comment explaining why not.

---

## 7. Feature flags

No new feature flags without owner, reason, and removal condition.

Permanent `true`/`false` flags should be deleted/inlined rather than kept as dead toggles.

Temporary email allowlists should move to env vars or backend/admin config.

---

## 8. File size and concern boundaries

Do not let page or component files grow past 500 lines without explicit justification.

More important than line count: do not mix API calls, polling, local UI state, result parsing, and rendering in one new file.

---

## 9. eslint-disable

No `eslint-disable react-hooks/exhaustive-deps` unless the comment explains:
- what dependency is excluded
- why it is safe
- what regression to watch for

---

## 10. Tests

Tests must ship with behavior changes in:
- auth/session/token handling
- API clients
- credit preflight/gates
- polling/retry/timeout behavior
- result parsing/enrichment
- session save/restore

Do not defer these tests to a later PR.

---

## 11. Error boundaries

`ChunkErrorBoundary` is not enough for normal runtime crashes.

CAD/WebGL errors need local containment.

Route-level workflow crashes should not white-screen the entire app.
