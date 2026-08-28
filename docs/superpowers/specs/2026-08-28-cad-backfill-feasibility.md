# Can the missing CAD events be reconstructed from the backend?

Date: 2026-08-28
Status: Investigation only. Nothing changed.
Question: PostHog cannot reconstruct the events it never received. Can Postgres or
Temporal?

Short answer: yes, for `cad_generation_started` and `cad_generation_completed`,
deterministically, with no guessing and no Session Replay. The backend record is
strictly better than the frontend event was.

## 1. Where CAD generation jobs are persisted

`temporal-agentic-pipeline`, Postgres 15, table `workflow_executions`
(`src/database/models.py:421`, documented in `DATABASE.md`).

| Column | What it gives us |
|---|---|
| `id` (PK) | The Temporal workflow id. Same value the frontend calls `workflow_id`. |
| `user_id` (FK to `users.id`) | Who ran it |
| `workflow_name` | `ring_cad_nurbs_v1` for both CAD tools |
| `input_payload` (JSONB) | The whole submitted request |
| `status` | `running` / `completed` / `failed` / `cancelled` |
| `created_at` | Submission time |
| `finished_at` | Completion time, set by the settlement activity |

Supporting tables: `users` (email, `external_id`), `tool_invocations` (per-step
receipts with `execution_time_ms`), `billing_events`, and `user_assets` (the
produced `generated_cad` asset, linked by `source_workflow_id`).

Temporal's own workflow histories are a second copy, but they are not needed and
have a retention window. Postgres is the durable record and is the one to use.

## 2. Does every submitted generation have a record?

Yes, and the boundary matches the event's own semantics exactly.

The row is written in `authorize_workflow_budget`
(`src/database/repository.py:1016`) at the moment credits are reserved, with
`status='running'`, before any work runs. A submission that fails the credit check
never gets a row.

`cad_generation_started` fires only after the start call returns a `workflow_id`
(`useImageToCADWorkflow.ts:300`), which is exactly when that row exists. So
"rows in `workflow_executions`" and "runs that should have fired
`cad_generation_started`" are the same set. The backfill cannot invent a start
that never happened, and cannot miss one that did.

## 3. Timestamps

`created_at` is submission. `finished_at` is completion, set by settlement.
`duration_ms` for the completion event is `finished_at - created_at`, which is
more accurate than the live event's value, since the live one measures from a
browser clock and stops whenever the page noticed.

## 4. Tying a row back to a PostHog person

The chain holds, with one thing to confirm empirically.

- The frontend calls `posthog.identify(u.id, ...)` (`AuthContext.tsx:42,71`),
  where `u.id` is the auth service's user id.
- That value is the JWT `sub` claim.
- The backend stores `sub` as `users.external_id`
  (`src/auth/dependencies.py:353`, `external_id=ext_id`).

So **PostHog `distinct_id` equals `users.external_id`**, and the join is
`workflow_executions.user_id` to `users.id` to `users.external_id`.

Confirm before importing anything: take one known CAD user, read their PostHog
`distinct_id`, and check it equals their `users.external_id`. One row settles it.

### A separate finding worth raising

The backend's own PostHog call uses the *internal* UUID as the distinct id:

    src/auth/dependencies.py:91
    variant = _posthog_client.get_feature_flag("free-generation-experiment", user_uuid)

The frontend identifies people by `external_id`. If those two values differ, the
`free-generation-experiment` flag is being evaluated against a person record that
holds none of that user's frontend events. That is not part of this backfill, but
it is the same class of bug and someone should look at it.

## 5. Text-to-CAD vs Image-to-CAD

Deterministic, and already implemented server side.

`_resolve_cad_source_type` (`src/api/_workflow_helpers.py:65`) reads the stored
`input_payload`:

- `reference_image_artifacts` empty and `user_description` non-empty gives `text_to_cad`
- 1 to 5 images gives `image_to_cad`
- anything else gives `unknown`

Two properties of this matter for a backfill. It runs at read time on
already-persisted rows, so it works retroactively on every historical row without
a migration. And it trusts the stored artifact list over the caller-declared
`reference_image_count`, so a stale count cannot corrupt it. Ambiguous rows return
`unknown` rather than a guess, which is exactly the behaviour we want: those get
their `source` omitted, not invented.

The frontend already consumes this via `/workflows/me`
(`routes_history.py:39`), which returns `source_type` computed this way.

## 6. The other event properties

All present in `input_payload`, written by `buildRingCadStartBody`
(`ring-cad-nurbs-api.ts:176`):

| Event property | Source |
|---|---|
| `source` | `_resolve_cad_source_type(input_payload)` |
| `prompt_length` | length of `input_payload['user_description']`, trimmed |
| `reference_image_count` | length of `input_payload['reference_image_artifacts']` |
| `llm_tier` | `input_payload['llm_tier']` |
| `category` | `'ring'`, the only thing CAD makes |
| `duration_ms` | `finished_at` minus `created_at` |

`is_first_ever` is the one that does NOT reconstruct cleanly. The live event
derives it from a per-browser localStorage key
(`ph_first_cad_generation_done`), so it means "first CAD run in this browser".
The backend can only compute "first CAD run by this user". Those are different
claims. Omit the property on backfilled events rather than substituting a
different meaning under the same name.

## 7. How far back the data goes

Unknown from here, and deliberately not guessed. I have no database credentials,
so I could not query row counts or the earliest `created_at`. `workflow_executions`
has no TTL or archival job in the repo, so the expectation is that it goes back to
the table's creation, but that needs confirming.

Run this to answer it:

    SELECT min(created_at) AS earliest,
           max(created_at) AS latest,
           count(*)        AS total_cad_runs,
           count(*) FILTER (WHERE status = 'completed')    AS completed,
           count(*) FILTER (WHERE finished_at IS NOT NULL) AS have_finish_time
    FROM workflow_executions
    WHERE workflow_name = 'ring_cad_nurbs_v1';

## 8. Can we reconstruct without guessing?

| Event | Verdict |
|---|---|
| `cad_generation_started` | Yes. One row is one start, by construction. All properties available except `is_first_ever`, which is omitted. |
| `cad_generation_completed` | Yes, for `status='completed'` with a non-null `finished_at`. |
| `cad_generation_failed` | Yes in principle, from the failed and cancelled rows, though `failure_stage` does not map cleanly. Out of scope. |
| `cad_studio_open` | No. Page views are not backend state. Do not attempt. |
| `cad_reference_uploaded` | No. The payload proves images existed, not that an upload interaction happened, and never when. Do not attempt. |
| `cad_result_restored` | No. Purely a frontend navigation. Do not attempt. |
| `download_clicked` | No. The backend serves artifact bytes but does not record a user-attributed download event. Do not attempt. |

So the funnel can be repaired at both generation steps and nowhere else. That is
the honest ceiling, and it happens to cover both of the events that are actually
missing.

## 9. Importing it without creating duplicates

The obstacle: existing `cad_generation_*` events carry no `workflow_id`, so a new
import cannot be matched against them by id.

Order of operations that removes the problem instead of working around it:

**Step 1. Ship `workflow_id` on the live events first.**
Add it to `cad_generation_started`, `cad_generation_completed` and
`cad_generation_failed`. From that deploy forward, every event is joinable to its
row, and duplicate detection becomes exact.

**Step 2. Backfill only the window that ends at that deploy.**
Nothing after it needs backfilling, so the ambiguous overlap is bounded and
closed.

**Step 3. Give every imported event a deterministic uuid.**
`uuid5(NAMESPACE, workflow_id + ':' + event_name)`. PostHog deduplicates on event
uuid, so a re-run of a partially completed import cannot double-write. This makes
the import idempotent, which matters more than getting it right first time.

**Step 4. Mark them.**
Every imported event carries `backfilled: true` and
`backfill_source: 'workflow_executions'`, plus `workflow_id`. Anyone reading a
chart can then separate observed from reconstructed, and the import stays
reversible as a filter even though the events are not deletable one by one.

**Step 5. Exclude runs that already fired an event.**
For the pre-`workflow_id` window, list the runs to skip by matching on person and
time. Backend and browser timestamps for the same run agree to within seconds:

    SELECT person.properties.email AS email,
           timestamp,
           properties.source AS source
    FROM events
    WHERE event = 'cad_generation_started'
      AND timestamp >= '2026-08-21'
    ORDER BY email, timestamp

A backend row whose `created_at` is within 60 seconds of an existing event for the
same person is already represented. Skip it. Import the rest.

**Step 6. Set `historical_migration: true` on the batch.**
PostHog treats timestamped historical imports differently from live ingestion.
Without it, person properties and session stitching can be rewritten by
out-of-order events.

**Step 7. Verify before trusting.**
After import, for the backfilled window, the `cad_generation_started` count should
equal the row count from the query in section 7, and no person should hold two
starts with the same `workflow_id`.

## 10. The production fix, so this cannot recur

Root cause: the events were emitted from a React component that does not outlive
the thing it is reporting on. A CAD run takes minutes and survives navigation,
refresh and tab closure. The component does not.

1. **Emit from the layer that owns the run, not the page.** Done for
   `cad_generation_completed` in the fix landed today: it now fires from
   `GenerationsContext`, which owns the poll and outlives the page, guarded by
   the existing `settledCadIds` so it fires exactly once. `cad_generation_started`
   was never affected, since a start requires the user to be present.

2. **Add `workflow_id` to all three generation events.** This is what makes the
   funnel joinable and every future gap self-diagnosable. Without it, "did this
   event fire?" is unanswerable, which is the reason this investigation was
   needed at all.

3. **Carry event properties on the run, not in page state.** Also done today: the
   property bundle is captured at submission and travels with the tracked run,
   persisted across refresh. A completion can no longer report properties from
   whatever state the page happens to be in when the backend answers.

4. **Consider emitting the generation events from the backend instead.** The
   backend already has a PostHog client (`src/server.py:108`) and already knows
   the authoritative moment a run starts and finishes. A server-side
   `cad_generation_completed`, keyed on `external_id`, would be immune to every
   failure mode in this document. The blocker is the distinct-id mismatch in
   section 4, which would need fixing first. Worth its own discussion.

The general rule, which is what to remember: an analytics event about a
long-running job should be emitted by whatever owns the job's lifecycle. If it is
emitted by a view, it measures who was watching, not what happened.
