# Scanner failures log

Running list of brand-scan failures observed on staging. These are scanner or
workflow issues, **not** frontend bugs. Backend asked us to report new ones
rather than work around them (their handoff, 2026-08-04, section 5).

Add a row whenever a scan fails, is blocked, or returns a wrong verdict.
Keep the workflow id and the raw error - they need both to trace it.

---

## 2026-08-04

| Store | Workflow | Failure | Detail |
|---|---|---|---|
| catbirdnyc.com | `state-2ac7217733c94c1b91a216e9a9332b86` | `access_blocked` | HTTP 403 at discovery, 0.214s, 2 attempts. No browser render attempted. |
| tanishq.co.in | `state-0eafac8893014fac929adef810afedf0` | `access_blocked` | HTTP 403 at discovery, 0.107s, 1 attempt. |
| bluestone.com | `state-1203543aadcb41fa9b8aa1e6819a07d4` | `ai_analysis_failed` | Crawled fine for 67s, then the model's JSON came back truncated mid-string ("...assort"). Whole scan discarded. |
| caratlane.com | `state-2a8baef309234628904ae6912cef7f38` | wrong verdict | `confirmed_non_storefront: true` for a Titan-group e-commerce site. 0 of 12 crawled pages were products, while the same payload reported `blocked_or_partial: true`. Also returned 18 "product titles" that are blog articles, one an empty string, contradicting `coverage.products: 0`. |
| malabargoldanddiamonds.com | `pending-c6ee42e199bd` | wall-clock timeout | Died at ~180s. Backend has since raised the scanner limit to 300s. Also emitted `products_found: {count: 0, titles: []}` and never corrected it. |
| zariin.com | `state-6c75bbe63cee4ad597bc0cb09ec68ff9` | `RuntimeError` | "No storefront pages could be read." Scan reached `completed` with an empty event list. |
| aulerth.com | `state-fbcb4e3075a04820abbc1e2eada35911` | `upstream_unavailable` | "Storefront network request failed after 3 attempt(s): ConnectError", 1.75s. |
| pipabella.com | `state-dc571829fe54450d831881ca883218c3` | `scan_failed` | "Storefront returned HTTP 402", discovery, 0.286s, 1 attempt. Payment-required from the storefront's edge/CDN. |
| quirksmith.com (forced rescan) | `state-bced0153b8ec4c308e4020661e5d9f44` | `ai_analysis_failed` | `status: partial` after 29s. Same site scanned cleanly at 07:34 as `state-1468255c...`, so the AI step is intermittent, not site-specific. Frontend handled it correctly: evidence-only reveal with an honest message. |

### Successful, for contrast

| Store | Workflow | Notes |
|---|---|---|
| quirksmith.com | `state-1468255c242743539ea2239e4ab860c9` | Clean run, ~70s. Real product titles, palette, fonts. Monotonic phase ordinals. |
| isharya.com | (see staging) | Clean run. Palette, product focus, visual style, audience, other details. |

---

## Pattern worth watching

Large, well-known brands fail far more often than small independent stores.
Of the first five tried, two were blocked outright, one gave a wrong
storefront verdict, one failed AI analysis, and the only clean run was a small
Shopify store. Backend is aware.

## Known backend behaviour that is NOT a failure

- `/phases` returns `events: []`, `scan_id: null` once the Temporal activity
  ends, even while the workflow still reports `running`. This is an absence,
  not a deletion - the frontend accumulates events client-side and must never
  clear on an empty response.
- A 20-24s lag between an event occurring and appearing in `/phases`.
  GraphFlow is fixing it; nothing to work around on our side.
- `products_found` can fire twice with different counts (static pass, then
  render-based pass). Highest `seq` for a given `kind` wins.
