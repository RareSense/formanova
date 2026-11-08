# Instructions for AI coding agents

Read `AI_RULES.md` and `CLAUDE.md` before changing any code; their rules are binding.

## New pages must be added to the nginx route list

nginx (on the server, not in this repo) only answers 200 for addresses on
its own lists. Any other address gets a 404 status, even though the app
still loads and shows the page. Google then drops that page.

- **Public pages** (should be in Google): the `map $uri $spa_public_page`
  block. Exact address only. Today: `/`, `/pricing`, `/feedback`,
  `/brand-details`, `/ai-jewelry-photography-comparison`.
- **App pages** (private, not in Google): the
  `location ~ ^/(login|oauth-callback|...|admin)(/|$)` line. Each name
  covers everything under it (`studio` covers `/studio/rings`), but names
  must be written in full (`studio` does not cover `/studio-pro`).

When a change adds, renames or re-enables a `<Route>` in `src/App.tsx` with
a new first part to its address, or adds a new address that the backend,
Stripe or an email links to, say so in the PR description and tell Hassan,
so the server list is updated the same day. Pages under an existing app name
(`/admin/...`, `/studio/...`) need no change.

Check after deploy: `curl -s -o /dev/null -w "%{http_code}\n" https://formanova.ai/<path>`
must print 200.

Full background: `docs/spa-new-page-rule.md` (from Hassan, 2026-11-08).
