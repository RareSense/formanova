# A new rule for adding pages to the FormaNova app

From: Hassan
For: the main developer of the FormaNova React app (the `formanova` repo)
Date: 2026-11-08

## The short version

When you add a new page to the app, you must also add its address to the
server's list. If you forget, the page still shows up fine for people, but
the server tells Google "this page does not exist". Google then drops it.

Please read the rest once, then paste the box at the bottom into your
`CLAUDE.md` (and `AI_RULES.md`, or any other file your AI tools read).

## Some words first

- **Page address (route):** the part after `formanova.ai`. In
  `formanova.ai/pricing`, the address is `/pricing`.
- **nginx:** the program on our server that answers every visit to
  formanova.ai. It decides what to send back.
- **Status code:** a number the server sends with every page. People never
  see it, but Google does.
  - **200** means "this page is real".
  - **404** means "this page does not exist".
- **The app:** our React app. Its page list lives in `src/App.tsx`.

## What was wrong

Before, nginx said **200** ("real page") for any address at all. You could
type `formanova.ai/banana-pancakes` and the server said "yes, real page".
The app then showed "Page not found", but the server had already said 200.

So Google saw thousands of fake "real" pages, all empty. An SEO check of the
site marked this as its worst app-side problem, because it makes the whole
site look low quality to Google.

## What changed

nginx now has **a list of the app's real page addresses**.

- An address **on the list** gets **200**, the same as before.
- An address **not on the list** gets **404**. The app still loads and shows
  its "Page not found" screen, so people see exactly what they saw before.
  Only the hidden number changed.
- Real files (pictures, `/assets/...`, `robots.txt`, favicons and so on)
  are served as files, the same as before.

The "Page not found" screen (`src/pages/NotFound.tsx`) also gained a
`noindex` tag, as a second safety net (PR #174).

## Why this matters to you

nginx cannot read `src/App.tsx`. It only knows the list that was typed into
its config by hand. So **every time you add a page to `App.tsx`, the server's
list must get it too.**

If you forget:

- The page still works when people click to it inside the app.
- But anyone who opens the address directly (from Google, an email, a
  bookmark or a shared link) gets the page with a **404** behind it.
- Google will not list the page. If Google already lists it, it will drop it.
- Nothing looks broken, so nobody notices. That is why this rule matters.

## The two lists

Both live in the nginx config on the server (one file, for formanova.ai).
Pick the list by asking: **"Should Google show this page in search?"**

### List 1: public pages (Google should show them)

These sit in a block at the top of the config called `map $uri $spa_public_page`:

```nginx
map $uri $spa_public_page {
    default /__not_an_spa_route__;
    /       /index.html;
    "~^/(pricing|feedback|brand-details|ai-jewelry-photography-comparison)/?$" /index.html;
}
```

Today it holds: `/`, `/pricing`, `/feedback`, `/brand-details`,
`/ai-jewelry-photography-comparison`.

To add a public page called `/gift-guide`, put it inside the brackets with a
`|` in front:

```
(pricing|feedback|brand-details|ai-jewelry-photography-comparison|gift-guide)
```

This list matches the **exact** address only. `/gift-guide` works, and so
does `/gift-guide/`. But `/gift-guide/rings` does **not**. If a public page
has addresses under it, ask Hassan to set that up.

### List 2: app pages (private, Google should not show them)

This is the line that starts `location ~ ^/(login|oauth-callback|...`. These
pages also get a "do not index" header.

```nginx
location ~ ^/(login|oauth-callback|dashboard|studio|studio-cad|text-to-cad|cad-to-catalog|image-to-cad|inspiration-to-cad|my-shopify-store|connect-rhino|credits|generations|onboarding|onboarding-welcome|payment-success|success|cancel|link|admin)(/|$) {
```

To add an app page called `/my-orders`, put it inside the brackets with a `|`
in front: `...|link|admin|my-orders)(/|$) {`.

This list covers the name **and everything under it**. `studio` covers
`/studio`, `/studio/rings` and `/studio/product-shot/categories`. So pages
under an existing name (like a new `/admin/something`) need **no** change.

The `(/|$)` at the end means "the name must end here, or carry on with a
`/`". So `link` covers `/link` and `/link/abc`, but **not** `/linkedin`.
Every name must be written out in full. A new page called `/studio-pro` is
not covered by `studio`, so it needs its own entry.

## When you must tell Hassan (or change the server)

You change `App.tsx` in GitHub, but the nginx config sits on the server, not
in the repo. So the server list does not update itself. When your change does
any of these, **write it in the PR description and tell Hassan**, so he can
update the server on the same day it goes live:

1. **You add a page with a new first part to its address** (for example
   `/gift-guide` or `/my-orders`). It needs to go on List 1 or List 2.
2. **You rename a page's address.** The new name goes on a list. Keep the
   old name too, or redirect it, if people may have it saved.
3. **You turn on a page that was switched off.** For example `/tutorial` is
   commented out in `App.tsx` right now ("hidden for now"), so it returns
   404 today. If you bring it back, it needs a list entry.
4. **You move a page from private to public** (or the other way). Move it
   to the other list.
5. **The backend, Stripe or an email starts sending people to a new app
   address.** For example, a new "back from payment" page, or a link in an
   email.

You do **not** need to tell anyone when:

- You add a page under a name already on List 2 (like `/studio/...` or
  `/admin/...`).
- You change what a page shows, without changing its address.
- You add a picture or file to `public/`. Files are served as files.

## How to check a page after it goes live

Run this in a terminal (swap in your page's address):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://formanova.ai/gift-guide
```

- `200` is good.
- `404` means the page is missing from the server's list.

You can also open the page in Chrome, press F12, go to the Network tab and
reload. The first line shows the status number.

## Paste this into CLAUDE.md (and AI_RULES.md)

```markdown
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
```

## Questions

Ask Hassan. The full background is in the SEO handoff
(`spa-seo-handoff.md`, item 1) and PR #174.
