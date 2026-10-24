# Supervised CAD runs, step 1: results that survive supervision

Source: backend handoff "Supervised CAD runs: frontend handoff" (2026-10-24), Part 1 sections 1-3.
Steps 2-4 (download buttons, admin queue page, admin list filter) get their own specs.

## Problem

With supervision on, a CAD run can sit in "running" for up to 24 hours, and a delivered
replacement's `/result` body is `{"supervised_delivery": [...]}`. Today's frontend breaks on both:

- `pollCadGeneration` (GenerationsContext.tsx) gives up after `RING_CAD_POLL_TIMEOUT_MS`
  (90 min) and settles the run as failed ("Your credits were not charged").
- Every CAD path reads the model only from the `/result` body (`parseRingCadResult`); a body
  without a GLB/3DM is shown as failed.
- `fetchCadResult` treats a 409 (supervised run waiting) like any error, so reopening a waiting
  run says "The completed CAD result could not be loaded."

## Design

1. **Client timeout is not a failure.** In `pollCadGeneration`'s catch, a poll that ended
   because of the client-side deadline (the `Workflow timed out after` error from
   `poll-workflow.ts`) drops its controller and leaves the generation `running`. The existing
   30 s `reconcileCadGenerations` check settles it from `/status` (`completed` or a failed
   state). Every other poll error keeps today's behaviour.
2. **Model fallback through the CAD vault.** New helper in `src/lib/cad-result-api.ts`:
   `findVaultModelForWorkflow(workflowId)` -> `{ glbUrl, threedmUrl } | null`, built on the
   existing `findRingForWorkflow` (matches `version.source_workflow_id`). Used only when the
   `/result` body yields no model:
   - `pollCadGeneration` before settling as failed;
   - `reconcileCadGenerations` when `parseRingCadResult` throws;
   - `fetchCadResult` (restore path, history cards, admin) after its own parsing finds nothing.
   No "is supervised" flag is needed, and normal runs never reach it.
3. **409 is "in progress".** `fetchCadResult` returns `pending: true` on 409. The restore path in
   `useImageToCADWorkflow` then shows "Still in progress. You'll have the result within
   24 hours." instead of the failure message.
4. **Queue message from the backend's flag.** The start reply (generate start and
   `POST /cad/versions/{asset_id}/improve`) carries `"supervised": true | false` (backend,
   2026-10-24). When true, the CAD page shows: "You're in the queue. Your CAD starts as soon as the
   queue clears, and you'll have the result within 24 hours."
5. **Admin Fail.** `/result` answers 404 with `reason_code: "failed_by_admin"`. `cadStatusNotice`
   gets that case: "We couldn't make this design. We couldn't produce a result for this design.
   Your credits have been returned." (today it would say "AI is overwhelmed").

Update to 2: the vault lookup matches the version whose `asset_id` is `/result`'s top-level
`output_asset_id` first (backend contract), then `source_workflow_id`.

## Not touched

CADCanvas.tsx, cad-studio/materials.ts, photoshoot polling, `poll-workflow.ts` itself, prod.

## Trade-off

A run the backend leaves in `running` forever now spins until the backend ends it, instead of
being called failed at 90 minutes. That message was already wrong: it claimed "not charged"
while the run was still going.

## Tests

- vitest: the timeout keeps the run running and a later reconcile `failed` still fails it; a
  `supervised_delivery` body resolves through `/cad/models`; no model anywhere still fails; a 409
  restore shows the in-progress message; the queue message shows only with the switch on.
- Full `npx vitest run`, `tsc --noEmit`, `npm run build`; browser check on staging.
