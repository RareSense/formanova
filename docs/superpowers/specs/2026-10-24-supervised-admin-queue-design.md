# Supervised CAD runs, step 2: the admin CAD queue page

Source: backend handoff "Supervised CAD runs: frontend handoff" (2026-10-24), Part 2 sections 6-9, and
the backend's answers of the same day. Approved by the user 2026-10-24. Branch
`feat/supervised-admin-queue`, cut from `main` (independent of step 1).

## Goal

An admin can run the whole supervised flow from the browser: see the queue, Start runs, review and
Send, Reject and upload a hand-made replacement, Send replacement, Fail with a full refund, and add
notes. The CAD QC team uses it for the five staging tests.

## API (backend contract, verbatim in substance)

Prefix `/api/admin/supervised-runs` (the app's same-origin proxy of `/admin/supervised-runs`). Errors
are `{"detail": {"code": "...", ...}}`.

- `GET ?phase=..&phase=..&workflow_name=&user_email=&limit=&offset=` ->
  `{items:[{workflow_id, workflow_name, phase, attempt, created_at, updated_at, user_email, is_paying,
  last_error, decision, note_count}], total, limit, offset}`. Newest first, `limit` up to 100.
- `GET /{id}` -> `{run, supervision:{phase, attempt, attempt_started_at, last_error, last_error_at,
  decision, decided_by_email, decided_at, acknowledged_missing, delivery, events}, send_check:
  {has_model, missing} | null, replacement_check: {has_model, missing, final_preview} | null,
  uploads:[{upload_id, role, filename, status, bytes, sha256, uploaded_by_email, created_at,
  verified_at}], notes:[{id, author_email, body, created_at}], download_urls:{<role>: url}}`.
  `run` is exactly the body of `GET /admin/generations/{id}`.
- `POST /start {workflow_ids:[1..50]}` -> `{results:[{workflow_id, accepted:true} | {workflow_id,
  accepted:false, code: not_found|invalid_phase|signal_failed}]}`.
- `POST /{id}/send {acknowledge_missing:[...]}` -> 202 `{accepted, phase}`; 409 `no_model` |
  `acknowledgement_mismatch {missing}`.
- `POST /{id}/reject {}`, `POST /{id}/fail {}` -> 202.
- `POST /{id}/notes {body: 1..10000 chars}` -> 200 note; 422 `bad_note`.
- Uploads (phase `rejected` only), per file: `POST /{id}/uploads {role, filename, bytes}` -> `{upload_id,
  upload_url, expires_at, headers}` (422 `role_not_allowed` | `bad_size {max_bytes}`); then
  `PUT upload_url` with the file body and the returned headers (`x-ms-blob-type: BlockBlob`), ONCE;
  then `POST /{id}/uploads/{upload_id}/complete {}` -> `{upload_id, role, ref}` (422 `upload_invalid
  {reason}`, 409 `upload_not_pending`). `DELETE /{id}/uploads/{role}` -> `{removed}` (404
  `no_verified_upload`).
- `POST /{id}/send-replacement {acknowledge_missing, jewelry_type?}` -> 202; 409 as for send.
- Any action in the wrong phase: 409 `invalid_phase {phase, allowed}`. `502 signal_failed` means
  nothing happened; press again.

Phases and allowed actions: queued -> Start, Reject, Fail; errored -> Start, Reject, Fail;
awaiting_review -> Send, Reject, Fail; rejected -> uploads, Send replacement, Fail; running,
finalizing, delivered, failed -> none.

Upload roles and limits: glb (required, 1 GiB), threedm (1 GiB), viewer_threedm (1 GiB), code .py
(10 MiB), loop_state .json (10 MiB), thumbnail .png (20 MiB), design_contract .json and
reference_manifest .json (generate runs only, 10 MiB), stl, step, casting_stl (1 GiB), stones .json
(1 MiB).

## Design

New files:
- `src/lib/supervised-runs-api.ts`: typed client for every call above; an error class carrying
  `status`, `code` and the detail object; `ALLOWED_ACTIONS` per phase; upload role table; and
  `uploadReplacementFile(id, role, file, onProgress)` that runs the three steps, PUTs exactly once via
  XHR (progress events), and never retries the PUT.
- `src/pages/AdminCadQueuePage.tsx`: the list. Phase filter (default queued + errored +
  awaiting_review), email search, table (created, user, workflow, phase, attempt, last error
  truncated, notes, paying, open), row tick boxes on queued/errored rows, "Start selected" showing the
  not-accepted runs with their codes, pagination like the Generations page.
- `src/pages/AdminCadQueueDetailPage.tsx`: header (phase badge, attempt, full last error, decision,
  events), action bar with only the allowed buttons, Fail behind a confirm dialog ("Refunds every
  credit. The user gets no email. This can't be undone."), Send with one tick box per
  `send_check.missing` name (enabled only when ticks equal the list exactly; `[]` when nothing is
  missing), the replacement panel (`rejected` only: one row per role with picker, limit, status,
  progress, Remove, verified file link; then `replacement_check` preview + missing ticks + jewelry
  type picker when `jewelry_type` is missing + Send replacement), notes (list + add box + "Notes
  can't be edited or deleted."), and the run itself through the existing `DetailContent`. After any
  accepted action the page polls the detail every 5 s until the phase changes (max 2 min). On
  `invalid_phase` it refreshes and shows the current phase; on `signal_failed` it says "Nothing
  happened. Press again."

Small edits: `AdminLayout` adds the "CAD Queue" tab; `App.tsx` adds `/admin/cad-queue` (inside the
admin layout) and `/admin/cad-queue/:workflowId` (with `AdminRouteGuard`, like generation detail);
`admin-generations-api.ts` exports `normalizeAdminGenerationDetail(data, workflowId)` (the body of
`getAdminGenerationDetail`, unchanged) and accepts `supervised?: boolean` in
`listAdminGenerations`; `AdminGenerationsPage` passes `supervised: false`; `AdminGenerationDetailPage`
exports `DetailContent`.

Out of scope: uploads over 256 MB (need the Azure Storage SDK; QC files are far smaller - the picker
refuses them with a clear message), download buttons for users (step 3).

## Tests

Vitest: every API call's URL, method and body; error-code parsing; the upload sequence (PUT once,
headers passed, complete called, no PUT retry, oversize refused before any request); list filters and
Start-selected results; detail buttons per phase; the exact-ticks rule; the Fail confirm; notes.
Then full vitest, tsc, build, and screenshots at 390 and 1440 px with mocked API responses.
