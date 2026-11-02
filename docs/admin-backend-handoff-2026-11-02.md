# Admin Generations: backend handoff (2026-11-02)

Frontend branch `feat/admin-costs-details` works around these. The fixes belong in
temporal-agentic-pipeline (`src/api/routes_admin_generations.py` and the result route).

## 1. `/api/result/{id}` returns 403 for admins viewing another user's run

The admin detail page called it to get the CAD 3DM / GLB, so the "Download 3DM" link never
showed on other users' runs. The frontend now reads files from the step outputs (and the
denormalised `/api/artifacts/<sha>` refs) first and uses `/result` only as a fallback.

Ask: let an admin (the same check `/admin/generations/{id}` uses) read `/result/{id}` for any
run in the tenant, or add the result to the admin detail response.

## 2. Expose per-step cost and outcome in `StepDetail`

`StepDetail` sends `tool, input, output, took_ms, at` only. `record_usage` already stores
`cost`, `is_success` and `is_retry` per tool invocation.

Ask: add `cost: int`, `is_success: bool`, `is_retry: bool` to `StepDetail`.

Why: today the page infers a failed call from the output (`{ "error": ... }` written by
http_tool, or `ok: false` / `status: "failed"` in the body) and calls a failure "retried"
when a later call of the same tool exists. That is a guess. With the real fields the page can
show which attempt cost what, and explain why Workflow cost (`total_provider_cost`) is above
User paid (`actual_cost`) exactly instead of "incl. failed retries".

## 3. Add `source_type` to the detail response

`GenerationDetailResponse` has no `source_type`, so the page classifies runs by
`workflow_name` (which is how `cad_to_catalog_fastload` was shown as an image workflow).
The frontend type already accepts `source_type`; it will be used as soon as it is sent.

## Smaller notes

- Step `input` is not passed through `denormalise_payload` (only `output` and
  `input_payload` are), so step inputs can still hold `azure://` refs. The frontend resolves
  them, but denormalising both would be consistent.
- The list item sends `total_provider_cost`; the frontend reads `provider_cost` first and
  falls back to it. No change needed, noted to avoid confusion.
