# CAD Completion Delivery — Backend Spec

**Owner:** Backend
**Goal:** Let a user reliably learn their CAD generation is done — via their account email today, and via a secondary email/WhatsApp/iMessage contact once this is built. Replace the current frontend-only interim workaround with a real, durable mechanism.

---

## 0. Current state (frontend-only, no backend support yet)

Two things are already live in the frontend and need backend follow-up:

1. **Primary email notification.** `PATCH /api/user/profile` accepts a `notification_email` field and `GET /api/user/profile` is expected to return it (`src/lib/notification-email-api.ts`). **This contract has never been confirmed against the real backend.** The one other documented consumer of `/api/user/profile` (`src/lib/onboarding-api.ts`) types its response as `{ id, email, external_user_id, user_type }` — no `notification_email` field. Before anything else here: confirm whether `/api/user/profile` actually persists and returns `notification_email` today, and whether the backend actually emails that address when a `ring_cad_nurbs_v1` run completes. If not, that's the first gap to close — everything below assumes it works.

2. **Secondary contact (WhatsApp/iMessage) — client-only stopgap, by design.** There is no backend field for a secondary contact yet. The frontend stores `{ channel: 'whatsapp' | 'imessage', contact: string }` in `localStorage` only (`src/lib/alt-delivery-preference.ts`) and, when the user asks for it, calls the existing `POST /api/feedback` endpoint (the one confirmed real endpoint that triggers a backend email — to admin/support, tracked by `email_sent_at`/`email_error` per `src/lib/feedback-api.ts`) with a clearly-marked non-complaint payload:
   - `category: 'other'`
   - `complaint` body prefixed `[Delivery request — not a complaint. Please forward manually, do not triage as a bug.]`, followed by the user's account email, requested channel, phone number, and the result URL.

   This is a manual human-in-the-loop bridge: an admin reads the feedback-queue entry and forwards the link by hand. It works today with zero backend changes, at the cost of polluting the real complaint queue with non-complaint entries and depending on a person noticing them in time. **This section specs the real replacement.**

---

## 1. Database schema

```sql
-- One row per user; nullable columns mean "not set, fall back to account email only".
CREATE TABLE user_delivery_preferences (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notification_email  TEXT,                    -- already informally in use via /api/user/profile; move here if it isn't already a real column
  secondary_channel    TEXT CHECK (secondary_channel IN ('whatsapp', 'imessage')),
  secondary_contact    TEXT,                    -- E.164 phone number, e.g. "+15551234567"
  secondary_verified_at TIMESTAMPTZ,             -- null until verified (see §3)
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Snapshot the resolved delivery target onto the workflow at submission time, not just the live preference — so a later preference change doesn't retroactively change where an in-flight run's notification goes:

```sql
ALTER TABLE cad_workflows
  ADD COLUMN notify_email    TEXT,   -- resolved notification_email at submit time
  ADD COLUMN notify_channel  TEXT CHECK (notify_channel IN ('whatsapp', 'imessage')),
  ADD COLUMN notify_contact  TEXT;
```

(Table name `cad_workflows` is a placeholder — use whatever table already tracks `ring_cad_nurbs_v1` runs.)

---

## 2. Endpoints

### `GET /api/user/delivery-preferences`
Returns the authenticated user's current preferences.
```json
{
  "notification_email": "jo@example.com",
  "secondary_channel": "whatsapp",
  "secondary_contact": "+15551234567",
  "secondary_verified": true
}
```
All fields nullable/absent if unset.

### `PATCH /api/user/delivery-preferences`
Partial update — only send fields being changed.
```json
{ "secondary_channel": "whatsapp", "secondary_contact": "+15551234567" }
```
- Validate `secondary_contact` as E.164 (`^\+[1-9]\d{6,14}$`).
- Setting a new `secondary_contact` (or changing an existing one) should reset `secondary_verified_at` to `null` — see §3.
- Response 200: `{ "success": true }`.

If the team prefers to keep everything on the existing `/api/user/profile` resource instead of a new one, that's fine — the field shapes above are what matter, not the route. Whichever is chosen, **document it and keep `notification_email`'s shape consistent with what `onboarding-api.ts`'s `UserProfile` type already expects**, so the two don't drift.

---

## 3. Verification (recommended, not blocking)

WhatsApp Business API and iMessage delivery both require the destination number to have opted in / be reachable. Before treating `secondary_contact` as usable:

- Send a one-time verification code (WhatsApp template message or SMS) to the number.
- User confirms it in the frontend → `secondary_verified_at` set.
- Until verified, the frontend should show "pending verification" rather than "will notify you" — avoids promising delivery that silently fails.

If this is too much for a first cut, ship without verification but say so explicitly in the product copy ("we'll try to reach you here") rather than promising delivery.

---

## 4. Sending on completion

When a `ring_cad_nurbs_v1` (or any CAD) workflow transitions to `completed`:

1. Look up `notify_email` / `notify_channel` / `notify_contact` **from the workflow row** (the snapshot from §1), not the live user preference.
2. Always send to `notify_email` (falls back to account login email if unset — never skip email entirely).
3. If `notify_channel` is set and `secondary_verified_at` was non-null at submit time, also send via that channel:
   - WhatsApp: WhatsApp Business API (Cloud API or a provider like Twilio/MessageBird), template message with the result link.
   - iMessage: iMessage delivery generally requires Apple Business Chat / a third-party provider (e.g. Twilio's channel support) — confirm what's actually available before promising this in the UI; if there's no real iMessage-sending capability, say so and keep the frontend's "iMessage" option gated behind that.
4. Log delivery attempts (success/failure per channel) the same way `email_sent_at`/`email_error` already work for `/api/feedback` — reuse that pattern rather than inventing a new one.

---

## 5. Link contract (already decided, frontend side is done)

The result link is `{origin}{cad_route}?workflow_id={id}` (e.g. `/text-to-cad?workflow_id=state-...` or `/image-to-cad?workflow_id=state-...`) — **no eager GLB URL needed**. The frontend already resolves the actual GLB/3DM via `GET /api/result/{workflow_id}` when that link is opened (`restoreCompletedWorkflow` in `useImageToCADWorkflow.ts`), so:

- The link requires the recipient to be logged in as the account that owns the workflow — enforce that server-side on `/api/result/{workflow_id}` (already true today, since it goes through `authenticatedFetch`).
- The frontend already shows copy warning the user of this ("That link opens here and only works once you're signed in.") — no backend change needed for that part, just confirming the contract so the email copy can say the same thing consistently.

---

## 6. Migration off the `/api/feedback` bridge

Once §2 and §4 exist:
- Frontend removes `requestAltDeliveryNotification`'s call to `submitFeedback` (`src/lib/alt-delivery-preference.ts`) and calls `PATCH /api/user/delivery-preferences` instead.
- `localStorage` preference storage becomes a cache/optimistic-UI layer only, not the source of truth.
- No more non-complaint entries land in the admin feedback queue.

Until then, expect to see `[Delivery request — not a complaint...]`-prefixed entries in `GET /api/feedback` — they're intentional, not a bug, and safe to filter out of complaint triage by that prefix if useful.
