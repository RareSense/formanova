# Supervised CAD runs, step 1: results that survive supervision. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CAD runs that wait for human review (hours) or are delivered as a hand-made replacement show as "in progress" and then the right model, never as a false failure.

**Architecture:** One model resolver in `src/lib/cad-result-api.ts` reads the `/result` body first and falls back to the CAD vault (`GET /cad/models`, matched by `version.source_workflow_id`). GenerationsContext uses it on both settle paths and treats its own poll deadline as "still running". The CAD page shows the existing `CadStatusDialog` for "in the queue" and "still in progress".

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library. Run everything in the worktree `C:\Users\Clubinternet\OneDrive\Desktop\frontend\fn_wt_supervised` (branch `feat/supervised-cad-runs`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-24-supervised-cad-safety-design.md`.
- Do not modify `src/components/text-to-cad/CADCanvas.tsx`, `src/components/cad-studio/materials.ts` or `src/lib/poll-workflow.ts`.
- Photoshoot polling stays byte-for-byte unchanged.
- Queue copy, verbatim: title "You're in the queue", message "Your CAD starts as soon as the queue clears, and you'll have the result within 24 hours."
- In-progress copy, verbatim: title "Still in progress", message "We're still working on this CAD. You'll have the result within 24 hours."
- Commits: plain ASCII messages, no Co-Authored-By line (FormaNova repo rule). Never push to `main`.
- Tests: `npx vitest run <file>`. Before finishing: full `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`.

---

### Task 1: The model resolver and the 409 rule in `cad-result-api.ts`

**Files:**
- Modify: `src/lib/cad-result-api.ts`
- Test: `src/lib/cad-result-api.test.ts`

**Interfaces:**
- Produces:
  - `export interface CadModelUrls { glbUrl: string | null; threedmUrl: string | null; stlUrls: string[]; stepUrls: string[]; estimatedMetalMassG: number | null; notAllSolid: boolean }`
  - `export function isExplicitCadFailure(raw: unknown): boolean`
  - `export async function findVaultModelForWorkflow(workflowId: string): Promise<{ glbUrl: string | null; threedmUrl: string | null } | null>`
  - `export async function resolveCadModel(workflowId: string, raw: unknown): Promise<CadModelUrls | null>`
  - `fetchCadResult` return type gains `pending: boolean` (true only for HTTP 409).

- [ ] **Step 1: Write the failing tests.** Add the vault mock under the existing `authenticated-fetch` mock at the top of `src/lib/cad-result-api.test.ts`:

```ts
const mockFindRingForWorkflow = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cad-versions-api', () => ({ findRingForWorkflow: mockFindRingForWorkflow }));
```

Change the import line to:

```ts
import { fetchCadResult, resolveCadModel } from './cad-result-api';
```

Append:

```ts
const vaultRing = (workflowId: string) => ({
  set_id: 'set-1',
  versions: [
    { asset_id: 'v0', position: 0, source_workflow_id: 'other', glb_url: '/old.glb', threedm_url: '/old.3dm' },
    { asset_id: 'v1', position: 1, source_workflow_id: workflowId, glb_url: '/rep.glb', threedm_url: '/rep.3dm' },
  ],
});

describe('supervised runs', () => {
  it('reads a 409 as still in progress and does not look anywhere else', async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: { message: 'workflow is waiting for human input', pending_human_tasks: [] } }),
    });
    const result = await fetchCadResult('wf-q');
    expect(result.pending).toBe(true);
    expect(result.glb_url).toBeNull();
    expect(mockFindRingForWorkflow).not.toHaveBeenCalled();
  });

  it('is not pending for an ordinary result', async () => {
    respondWith(nurbsResult(false));
    expect((await fetchCadResult('wf-1')).pending).toBe(false);
  });

  it('finds a hand-made replacement in the CAD vault when /result has no model', async () => {
    respondWith({ supervised_delivery: [{ note: 'replacement' }] });
    mockFindRingForWorkflow.mockResolvedValue(vaultRing('wf-r'));
    const result = await fetchCadResult('wf-r');
    expect(result.glb_url).toBe('/rep.glb');
    expect(result.threedm_url).toBe('/rep.3dm');
    expect(mockFindRingForWorkflow).toHaveBeenCalledWith('wf-r', { attempts: 1 });
  });

  it('never asks the vault about a run that says it failed', async () => {
    respondWith({ ok: false, status: 'failed', phase: 'cad_export' });
    const result = await fetchCadResult('wf-f');
    expect(result.glb_url).toBeNull();
    expect(mockFindRingForWorkflow).not.toHaveBeenCalled();
  });
});

describe('resolveCadModel', () => {
  it('reads every file from a normal /result body without touching the vault', async () => {
    const model = await resolveCadModel('wf-1', nurbsResult(true));
    expect(model?.glbUrl).toContain('a'.repeat(64));
    expect(model?.threedmUrl).toContain('b'.repeat(64));
    expect(model?.notAllSolid).toBe(true);
    expect(mockFindRingForWorkflow).not.toHaveBeenCalled();
  });

  it('falls back to the vault version this run produced', async () => {
    mockFindRingForWorkflow.mockResolvedValue(vaultRing('wf-r'));
    const model = await resolveCadModel('wf-r', { supervised_delivery: [] });
    expect(model).toEqual({
      glbUrl: '/rep.glb', threedmUrl: '/rep.3dm', stlUrls: [], stepUrls: [],
      estimatedMetalMassG: null, notAllSolid: false,
    });
  });

  it('is null when neither /result nor the vault has a model', async () => {
    mockFindRingForWorkflow.mockResolvedValue(null);
    expect(await resolveCadModel('wf-x', { supervised_delivery: [] })).toBeNull();
  });

  it('is null for an explicit failure, without a vault lookup', async () => {
    expect(await resolveCadModel('wf-f', { ok: false, status: 'failed' })).toBeNull();
    expect(mockFindRingForWorkflow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
Run: `npx vitest run src/lib/cad-result-api.test.ts`
Expected: the new tests FAIL (`resolveCadModel` is not exported, `pending` is undefined); the existing 6 pass.

- [ ] **Step 3: Implement.** In `src/lib/cad-result-api.ts` add the import under the existing ones:

```ts
import { findRingForWorkflow } from '@/lib/cad-versions-api';
```

Add `pending: boolean;` to the `fetchCadResult` return type, after `not_all_solid: boolean;`, with this doc comment:

```ts
  /**
   * True when /result answered 409: a supervised run waiting in the queue or
   * for review. It is still running, not failed, and can stay so for hours.
   */
  pending: boolean;
```

Add `pending: false` to every existing `return { ... }` object in `fetchCadResult` (there are 9). Then, right after `const res = await authenticatedFetch(...)`, replace

```ts
    if (!res.ok) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false };
```

with

```ts
    if (res.status === 409) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: true };
    if (!res.ok) return { glb_url: null, threedm_url: null, azure_source: null, not_all_solid: false, pending: false };
```

In the `if (!isLegacyShape)` block, replace the `catch` body with:

```ts
      } catch {
        // No model in the body. A delivered hand-made replacement answers
        // {"supervised_delivery": [...]}; its model is in the vault instead.
        if (!isExplicitCadFailure(data)) {
          const vault = await findVaultModelForWorkflow(workflowId);
          if (vault) {
            return { glb_url: vault.glbUrl, threedm_url: vault.threedmUrl, azure_source: 'cad_models', not_all_solid: false, pending: false };
          }
        }
        // Not a ring_cad_nurbs_v1 result — fall through to the legacy nested shape.
      }
```

Append after `fetchCadResult`:

```ts
/** The files of a finished CAD run, whichever source they came from. */
export interface CadModelUrls {
  glbUrl: string | null;
  threedmUrl: string | null;
  stlUrls: string[];
  stepUrls: string[];
  estimatedMetalMassG: number | null;
  notAllSolid: boolean;
}

/** A /result body that itself says the run failed; no model is looked for elsewhere. */
export function isExplicitCadFailure(raw: unknown): boolean {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return false;
  return d.ok === false || (typeof d.status === 'string' && d.status.toLowerCase() === 'failed');
}

/**
 * The model the CAD vault (GET /cad/models) holds for this run's version.
 *
 * The vault is right for every run, including a supervised one the CAD team
 * replaced by hand, whose /result has no model fields. Called once /result has
 * answered, when the version row is already written, so one attempt is enough.
 */
export async function findVaultModelForWorkflow(
  workflowId: string,
): Promise<{ glbUrl: string | null; threedmUrl: string | null } | null> {
  const ring = await findRingForWorkflow(workflowId, { attempts: 1 });
  const version = ring?.versions?.find((v) => v.source_workflow_id === workflowId);
  if (!version || (!version.glb_url && !version.threedm_url)) return null;
  return { glbUrl: version.glb_url ?? null, threedmUrl: version.threedm_url ?? null };
}

/**
 * The model of a run /status reported completed: from the /result body, or
 * else from the vault. Null only when neither has one, i.e. a real failure.
 */
export async function resolveCadModel(workflowId: string, raw: unknown): Promise<CadModelUrls | null> {
  try {
    const parsed = parseRingCadResult(raw);
    return {
      glbUrl: parsed.glbUrl,
      threedmUrl: parsed.threedmArtifact?.url ?? null,
      stlUrls: parsed.stlArtifacts.map((artifact) => artifact.url),
      stepUrls: parsed.stepArtifacts.map((artifact) => artifact.url),
      estimatedMetalMassG: parsed.estimatedMetalMassG,
      notAllSolid: parsed.notAllSolid,
    };
  } catch {
    if (isExplicitCadFailure(raw)) return null;
    const vault = await findVaultModelForWorkflow(workflowId);
    return vault ? { ...vault, stlUrls: [], stepUrls: [], estimatedMetalMassG: null, notAllSolid: false } : null;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**
Run: `npx vitest run src/lib/cad-result-api.test.ts src/lib/generation-history-api.test.ts src/components/generations/WorkflowCard.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/cad-result-api.ts src/lib/cad-result-api.test.ts
git commit -m "CAD results: a 409 is in progress, and a model missing from /result is read from the CAD vault"
```

---

### Task 2: GenerationsContext never fails a run the backend has not ended

**Files:**
- Modify: `src/contexts/GenerationsContext.tsx` (`pollCadGeneration` around lines 625-745, `reconcileCadGenerations` around lines 778-876)
- Test: `src/contexts/GenerationsContext.test.tsx`

**Interfaces:**
- Consumes: `resolveCadModel(workflowId, raw): Promise<CadModelUrls | null>` from Task 1.

- [ ] **Step 1: Write the failing tests.** In `src/contexts/GenerationsContext.test.tsx` change the cad-versions-api mock and add one for cad-result-api:

```ts
vi.mock('@/lib/cad-versions-api', () => ({ fetchImproveOutcome: vi.fn(), findRingForWorkflow: vi.fn() }));
```

Below the existing `import { fetchImproveOutcome } ...` line, add:

```ts
import { findRingForWorkflow } from '@/lib/cad-versions-api';
const mockFindRingForWorkflow = vi.mocked(findRingForWorkflow);
```

In the `describe('GenerationsContext - Image to 3D runs'` block's `beforeEach`, add `mockFindRingForWorkflow.mockResolvedValue(null);`. Then add these tests to that block:

```ts
  it('keeps a cad run running when this tab reaches its own poll limit', async () => {
    mockPollWorkflow.mockRejectedValueOnce(new Error('Workflow timed out after 5400000ms'));
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-wait' }); });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.generations[0].status).toBe('running');
    expect(mockMarkFailed).not.toHaveBeenCalled();
    expect(mockFetchImproveOutcome).not.toHaveBeenCalled();
  });

  it('still fails it once the backend reports failed after the poll limit', async () => {
    mockPollWorkflow.mockRejectedValueOnce(new Error('Workflow timed out after 5400000ms'));
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ runtime: { state: 'failed' } }));
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-wait-fail', cadRoute: '/image-to-cad' }); });
    await waitFor(() => expect(mockPollWorkflow).toHaveBeenCalled());

    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(result.current.generations[0].status).toBe('failed'));
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
  });

  it('shows a hand-made replacement from the CAD vault', async () => {
    mockPollWorkflow.mockResolvedValue({ status: 'completed', result: { supervised_delivery: [{}] } } as never);
    mockFindRingForWorkflow.mockResolvedValue({
      set_id: 's', versions: [{ asset_id: 'v', position: 0, source_workflow_id: 'cad-rep', glb_url: 'https://s/rep.glb', threedm_url: 'https://s/rep.3dm' }],
    } as never);
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-rep' }); });

    await waitFor(() => expect(result.current.generations[0].status).toBe('completed'));
    expect(result.current.generations[0].glbUrl).toBe('https://s/rep.glb');
    expect(result.current.generations[0].threedmUrl).toBe('https://s/rep.3dm');
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it('shows a replacement found by the tab check from the CAD vault', async () => {
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse({ runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(jsonResponse({ supervised_delivery: [{}] }));
    mockFindRingForWorkflow.mockResolvedValue({
      set_id: 's', versions: [{ asset_id: 'v', position: 0, source_workflow_id: 'cad-rep2', glb_url: 'https://s/rep2.glb', threedm_url: null }],
    } as never);
    const { result } = renderHook(() => useGenerations(), { wrapper });
    act(() => { result.current.trackCadGeneration({ workflowId: 'cad-rep2' }); });

    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(result.current.generations[0].glbUrl).toBe('https://s/rep2.glb'));
    expect(result.current.generations[0].status).toBe('completed');
  });
```

- [ ] **Step 2: Run them and confirm the new ones fail.**
Run: `npx vitest run src/contexts/GenerationsContext.test.tsx`
Expected: the 4 new tests FAIL (the run is failed / glbUrl null); all others PASS.

- [ ] **Step 3: Implement.** Add the import next to the other `@/lib` imports:

```ts
import { resolveCadModel } from '@/lib/cad-result-api';
```

Above `export function GenerationsContextProvider`, add:

```ts
/**
 * This tab's own CAD poll deadline (poll-workflow's timeout error). It is not
 * a run outcome: a supervised run waits in the queue and for review for hours
 * while /status says "running". Only /status ends a run.
 */
function isClientPollTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Workflow timed out after');
}
```

In `pollCadGeneration`:
1. Make the `.then(pollResult => {` callback `async`: `.then(async pollResult => {`.
2. Replace the block from `let parsed: ReturnType<typeof parseRingCadResult>;` through the closing `}` of its `catch` with:

```ts
      // /status already reported runtime.state "completed". The model comes
      // from the /result body or, for a hand-made replacement whose body has
      // no model fields, from the CAD vault. No model anywhere is a failure.
      const model = await resolveCadModel(gen.workflowId, raw);
      if (!model) {
        const failure = parseRingCadFailure(raw);
        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId ? { ...g, status: 'failed', progress: 100 } : g
        ));
        markGenerationFailed(gen.workflowId, failure.userMessage ?? 'CAD run failed', startTime);
        // A failed run releases the entire credit hold.
        refreshCredits();
        toast({
          title: 'Your CAD could not be generated',
          description: failure.userMessage
            ?? 'The run did not complete. Your credits were not charged.',
          variant: 'destructive',
        });
        return;
      }
```

3. In the completed `setGenerations` call and the toast action below it, replace `parsed.` reads with the model:

```ts
              glbUrl: model.glbUrl,
              threedmUrl: model.threedmUrl,
              stlUrls: model.stlUrls,
              stepUrls: model.stepUrls,
              estimatedMetalMassG: model.estimatedMetalMassG,
              notAllSolid: model.notAllSolid,
```

and `buildCadRestorePath(gen.workflowId, model.glbUrl, gen.cadRoute, 'toast')`.

4. In the `.catch(async err => {` block, right after `if (ctrl.signal.aborted) return;`, insert:

```ts
      if (isClientPollTimeout(err)) {
        // Still running as far as anyone knows. The 30 s /status check below
        // (reconcileCadGenerations) settles it when the backend ends it.
        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId ? { ...g, generationStep: 'Still in progress...' } : g
        ));
        return;
      }
```

In `reconcileCadGenerations`, replace

```ts
          let parsed: ReturnType<typeof parseRingCadResult> | null = null;
```

with `let model: Awaited<ReturnType<typeof resolveCadModel>> = null;`. Inside its `try`, replace

```ts
            if (resultResponse.ok) {
              rawResult = await resultResponse.json();
              parsed = parseRingCadResult(rawResult);
            }
```

with

```ts
            if (resultResponse.ok) rawResult = await resultResponse.json();
            model = await resolveCadModel(gen.workflowId, rawResult);
```

Then in the `setGenerations` call and the toast after it, replace each `parsed` read: `parsed ? 'Completed' : ...` becomes `model ? 'Completed' : ...`, and so on:

```ts
                  generationStep: model ? 'Completed' : 'Completed — result unavailable',
                  glbUrl: model?.glbUrl ?? null,
                  threedmUrl: model?.threedmUrl ?? null,
                  stlUrls: model?.stlUrls ?? [],
                  stepUrls: model?.stepUrls ?? [],
                  estimatedMetalMassG: model?.estimatedMetalMassG ?? null,
                  notAllSolid: model?.notAllSolid ?? false,
```

The toast becomes `title: model ? 'Your CAD is ready' : 'Your CAD finished'`, `description: model ? (gen.label ?? 'Open the completed CAD result') : ...`, and `buildCadRestorePath(gen.workflowId, model?.glbUrl ?? null, gen.cadRoute, 'toast')`. Remove `parseRingCadResult` from the `@/lib/ring-cad-nurbs-api` import if nothing else in the file uses it (`grep -n parseRingCadResult src/contexts/GenerationsContext.tsx`).

- [ ] **Step 4: Run the tests and confirm they pass.**
Run: `npx vitest run src/contexts/GenerationsContext.test.tsx`
Expected: all PASS, including the existing failure, race and analytics tests.

- [ ] **Step 5: Commit.**

```bash
git add src/contexts/GenerationsContext.tsx src/contexts/GenerationsContext.test.tsx
git commit -m "CAD runs: only the backend ends a run; a replacement's model is read from the CAD vault"
```

---

### Task 3: "In the queue" and "Still in progress" on the CAD page

**Files:**
- Create: `src/lib/cad-supervision.ts`
- Modify: `src/lib/cad-status-copy.ts`, `src/hooks/useImageToCADWorkflow.ts` (restore around lines 498-508; generate start after `trackCadGeneration` around line 664; improve start after `trackCadGeneration` around line 402)
- Test: `src/lib/cad-status-copy.test.ts` (create if missing), `src/hooks/useImageToCADWorkflow.test.tsx`

**Interfaces:**
- Consumes: `fetchCadResult(...).pending` from Task 1.
- Produces: `isCadSupervisedRuns(): boolean`, `cadQueuedNotice(): CadStatusNotice`, `cadInProgressNotice(): CadStatusNotice`.

- [ ] **Step 1: Write the failing tests.** Create or extend `src/lib/cad-status-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cadInProgressNotice, cadQueuedNotice } from './cad-status-copy';

describe('supervised CAD copy', () => {
  it('says the run is queued and when the result arrives', () => {
    expect(cadQueuedNotice()).toEqual({
      tone: 'success',
      title: "You're in the queue",
      message: "Your CAD starts as soon as the queue clears, and you'll have the result within 24 hours.",
    });
  });

  it('says a waiting run is still in progress, never failed', () => {
    expect(cadInProgressNotice()).toEqual({
      tone: 'success',
      title: 'Still in progress',
      message: "We're still working on this CAD. You'll have the result within 24 hours.",
    });
  });
});
```

In `src/hooks/useImageToCADWorkflow.test.tsx`, add under the existing mocks:

```ts
const supervised = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/cad-supervision', () => ({ isCadSupervisedRuns: () => supervised.on }));
```

and append:

```ts
describe('useImageToCADWorkflow supervised runs', () => {
  beforeEach(() => {
    checkCredits.mockReset();
    mockFetch.mockReset();
    supervised.on = false;
  });

  it('opens a waiting run as still in progress, not as a failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: { message: 'workflow is waiting for human input', pending_human_tasks: [] } }),
    } as Response);
    const { result } = renderWorkflow();
    let restored: boolean | undefined;
    await act(async () => { restored = await result.current.restoreCompletedWorkflow('state-q', null); });

    expect(restored).toBe(true);
    expect(result.current.generationFailed).toBe(false);
    expect(result.current.statusNotice?.title).toBe('Still in progress');
  });

  it('tells the user they are queued after Generate when supervision is on', async () => {
    supervised.on = true;
    checkCredits.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-1' }) } as Response);
    const { result } = renderWorkflow();
    await act(async () => { await result.current.simulateGeneration(); });
    expect(result.current.statusNotice?.title).toBe("You're in the queue");
  });

  it('says nothing extra after Generate while supervision is off', async () => {
    checkCredits.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ workflow_id: 'state-1' }) } as Response);
    const { result } = renderWorkflow();
    await act(async () => { await result.current.simulateGeneration(); });
    expect(result.current.statusNotice).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.**
Run: `npx vitest run src/lib/cad-status-copy.test.ts src/hooks/useImageToCADWorkflow.test.tsx`
Expected: the new tests FAIL (the functions and module don't exist; restore reports failure).

- [ ] **Step 3: Implement.** Create `src/lib/cad-supervision.ts`:

```ts
/**
 * Supervised CAD runs (backend handoff 2026-10-24): a submitted CAD generate or
 * improve waits in a queue, an admin starts and reviews it, and the user gets
 * the result within 24 hours. The backend turns this on per environment; flip
 * this to true in the same environment when they tell us it is on.
 */
export const CAD_SUPERVISED_RUNS = false;

export function isCadSupervisedRuns(): boolean {
  return CAD_SUPERVISED_RUNS;
}
```

Append to `src/lib/cad-status-copy.ts`:

```ts
/** After submitting a CAD run while supervision is on. */
export function cadQueuedNotice(): CadStatusNotice {
  return {
    tone: 'success',
    title: "You're in the queue",
    message: "Your CAD starts as soon as the queue clears, and you'll have the result within 24 hours.",
  };
}

/** Opening a supervised run that is still queued or in review (/result 409). */
export function cadInProgressNotice(): CadStatusNotice {
  return {
    tone: 'success',
    title: 'Still in progress',
    message: "We're still working on this CAD. You'll have the result within 24 hours.",
  };
}
```

In `src/hooks/useImageToCADWorkflow.ts`, change the cad-status-copy import to

```ts
import { cadInProgressNotice, cadQueuedNotice, cadStatusNotice, type CadStatusNotice } from '@/lib/cad-status-copy';
```

and add `import { isCadSupervisedRuns } from '@/lib/cad-supervision';`. In `restoreCompletedWorkflow`, right after `const result = workflowId ? await fetchCadResult(workflowId) : null;`, insert:

```ts
    if (result?.pending) {
      // A supervised run still in the queue or in review: nothing has failed.
      setIsModelLoading(false);
      setProgressStep('');
      setStatusNotice(cadInProgressNotice());
      return true;
    }
```

Immediately after each of the two `trackCadGeneration({ ... });` calls (generate start and improve start), insert:

```ts
      if (isCadSupervisedRuns()) setStatusNotice(cadQueuedNotice());
```

- [ ] **Step 4: Run the tests and confirm they pass.**
Run: `npx vitest run src/lib/cad-status-copy.test.ts src/hooks/useImageToCADWorkflow.test.tsx src/components/text-to-cad/CadStatusDialog.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/cad-supervision.ts src/lib/cad-status-copy.ts src/lib/cad-status-copy.test.ts src/hooks/useImageToCADWorkflow.ts src/hooks/useImageToCADWorkflow.test.tsx
git commit -m "CAD page: queued and still-in-progress notices for supervised runs, behind CAD_SUPERVISED_RUNS"
```

---

### Task 4: Whole-app verification

**Files:** none changed unless a check fails.

- [ ] **Step 1:** `npx vitest run`. Expected: all pass, with the same count as `origin/main` plus the new tests. A failure in any file is diagnosed and fixed, never skipped.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.app.json`. Expected: no errors.
- [ ] **Step 3:** `npm run lint -- src/lib/cad-result-api.ts src/lib/cad-supervision.ts src/lib/cad-status-copy.ts src/contexts/GenerationsContext.tsx src/hooks/useImageToCADWorkflow.ts`. Expected: no new errors.
- [ ] **Step 4:** `npm run build`. Expected: build succeeds.
- [ ] **Step 5:** Browser check with the dev server (`npm run dev`, port 8080). Open `/text-to-cad` and `/image-to-cad`; no console errors. Render `CadStatusDialog` with `cadQueuedNotice()` once by temporarily setting `CAD_SUPERVISED_RUNS = true` locally (never committed), check it looks right at 390 px and 1440 px, then set it back.
- [ ] **Step 6:** `git diff origin/main --stat` and confirm only the files named in Tasks 1-3 plus the spec and plan changed.
