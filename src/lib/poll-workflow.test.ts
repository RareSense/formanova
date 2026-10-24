/**
 * Tests for poll-workflow.ts
 *
 * All 11 cases from docs/POLLING_AND_RESULT_PARSING_PLAN.md section 5.
 *
 * vi.useFakeTimers() is NOT used because the helper relies on async/await
 * Promise resolution. Instead, intervalMs=0 and timeoutMs values are set
 * small so tests run in real time without noticeable delay.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollWorkflow } from './poll-workflow';

// -- Mock AuthExpiredError --

const mockAuthFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  AuthExpiredError: class AuthExpiredError extends Error {
    constructor() {
      super('AUTH_EXPIRED');
      this.name = 'AuthExpiredError';
    }
  },
}));

import { AuthExpiredError } from '@/lib/authenticated-fetch';

// -- Response helpers --

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function notOk(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response;
}

function r404(): Response {
  return notOk(404, {});
}

// -- Shared options used by most tests --

const identity = (d: unknown) => d as any;

function statusOpts(
  fetchStatus: () => Promise<Response>,
  fetchResult: () => Promise<Response>,
) {
  return {
    mode: 'status-then-result' as const,
    fetchStatus,
    fetchResult,
    resolveState: (d: any) => d?.state ?? 'running',
    parseResult: identity,
    intervalMs: 0,
    timeoutMs: 5000,
  };
}

function directOpts(fetchResult: () => Promise<Response>) {
  return {
    mode: 'result-direct' as const,
    fetchResult,
    parseResult: identity,
    intervalMs: 0,
    timeoutMs: 5000,
  };
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

// -- Tests --

describe('pollWorkflow - status-then-result mode', () => {

  it('test 1: status completed -> fetches result -> returns completed', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(okJson({ output: 'image.jpg' }));

    const out = await pollWorkflow(statusOpts(fetchStatus, fetchResult));

    expect(out.status).toBe('completed');
    expect((out as any).result).toEqual({ output: 'image.jpg' });
    expect(fetchResult).toHaveBeenCalledTimes(1);
  });

  it('test 2: status failed -> throws before fetching result', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'failed', error: 'GPU OOM' }));
    const fetchResult = vi.fn();

    await expect(pollWorkflow(statusOpts(fetchStatus, fetchResult)))
      .rejects.toThrow('GPU OOM');
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('client deadline rejects with a "Workflow timed out after" message', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(okJson({ state: 'running' }));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), timeoutMs: 30, intervalMs: 5 }),
    ).rejects.toThrow(/^Workflow timed out after /);
  });

  it('repeated /status errors reject with a "Status polling failed " message', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(notOk(502));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), maxPollErrors: 2 }),
    ).rejects.toThrow(/^Status polling failed 2 times \(last status: 502\)/);
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('test 3: status 404 over budget -> throws', async () => {
    // max404s default is 3; three 404s should throw
    const fetchStatus = vi.fn().mockResolvedValue(r404());
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), max404s: 3 }),
    ).rejects.toThrow('404');
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('test 4: status 404 below budget -> continues and succeeds', async () => {
    // 2 x 404, then completed - max404s=3 so should not throw
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(okJson({ output: 'ok' }));

    const out = await pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), max404s: 3 });

    expect(out.status).toBe('completed');
  });

  it('test 5: result 404 retry -> succeeds on second attempt', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(okJson({ output: 'retried.jpg' }));

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      maxResultRetries: 3,
      resultRetryDelayMs: 0,
    });

    expect(out.status).toBe('completed');
    expect((out as any).result).toEqual({ output: 'retried.jpg' });
    expect(fetchResult).toHaveBeenCalledTimes(2);
  });

  it('test 6: result 404 retries exhausted -> throws', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    // All result attempts return 404
    const fetchResult = vi.fn().mockResolvedValue(r404());

    await expect(
      pollWorkflow({
        ...statusOpts(fetchStatus, fetchResult),
        maxResultRetries: 3,
        resultRetryDelayMs: 0,
      }),
    ).rejects.toThrow('404');
    expect(fetchResult).toHaveBeenCalledTimes(3);
  });

  it('test 7: timeout -> throws, no extra fetch after deadline', async () => {
    // Mock Date.now so the deadline is computable but expires immediately:
    //   call 0 (deadline = Date.now() + 100): returns 0  -> deadline = 100
    //   call 1+ (loop checks):                returns 200 -> 200 > 100, throws before fetchStatus
    let nowCall = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => nowCall++ === 0 ? 0 : 200);

    const fetchStatus = vi.fn().mockResolvedValue(okJson({ state: 'running' }));
    const fetchResult = vi.fn();

    try {
      await expect(
        pollWorkflow({
          ...statusOpts(fetchStatus, fetchResult),
          intervalMs: 0,
          timeoutMs: 100,
        }),
      ).rejects.toThrow('timed out');

      expect(fetchStatus).not.toHaveBeenCalled();
      expect(fetchResult).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('test 8: AbortSignal cancellation -> returns cancelled', async () => {
    const controller = new AbortController();
    // Abort before any fetch completes
    const fetchStatus = vi.fn().mockImplementation(async () => {
      controller.abort();
      return okJson({ state: 'running' });
    });
    const fetchResult = vi.fn();

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      signal: controller.signal,
    });

    expect(out.status).toBe('cancelled');
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('test 9: AuthExpiredError propagation -> rethrows, not cancelled', async () => {
    const fetchStatus = vi.fn().mockRejectedValueOnce(new AuthExpiredError());
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow(statusOpts(fetchStatus, fetchResult)),
    ).rejects.toMatchObject({ name: 'AuthExpiredError', message: 'AUTH_EXPIRED' });
  });

});

describe('pollWorkflow - result-direct mode', () => {

  it('test 10: result-direct running then success -> returns completed', async () => {
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(okJson({ status: 'running' }))
      .mockResolvedValueOnce(okJson({ status: 'done', weight_g: 4.2 }));

    const out = await pollWorkflow(directOpts(fetchResult));

    expect(out.status).toBe('completed');
    expect((out as any).result).toEqual({ status: 'done', weight_g: 4.2 });
    expect(fetchResult).toHaveBeenCalledTimes(2);
  });

  it('test 11: result-direct timeout -> throws, no extra fetch after deadline', async () => {
    // timeoutMs: 0 sets deadline = Date.now() + 0, so the while condition
    // Date.now() < deadline is immediately false. The loop never enters,
    // fetchResult is never called, and the timeout error is thrown instantly.
    const fetchResult = vi.fn()
      .mockResolvedValue(okJson({ status: 'running' }));

    await expect(
      pollWorkflow({
        ...directOpts(fetchResult),
        intervalMs: 0,
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timed out');

    expect(fetchResult).not.toHaveBeenCalled();
  });

});

describe('pollWorkflow - optional features', () => {

  it('resolveTerminalNode success breaks the loop', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'running', node: 'success_final' }));
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(okJson({ glb: 'model.glb' }));

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      resolveTerminalNode: (d: any) =>
        d?.node === 'success_final' ? 'success'
        : d?.node === 'failed_final' ? 'failure'
        : null,
    });

    expect(out.status).toBe('completed');
    expect((out as any).result).toEqual({ glb: 'model.glb' });
  });

  it('resolveTerminalNode failure throws', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'running', node: 'failed_final' }));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({
        ...statusOpts(fetchStatus, fetchResult),
        resolveTerminalNode: (d: any) =>
          d?.node === 'success_final' ? 'success'
          : d?.node === 'failed_final' ? 'failure'
          : null,
      }),
    ).rejects.toThrow('terminal node');
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('onProgress is called with node info when resolveProgressNode returns a value', async () => {
    const onProgress = vi.fn();
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'running', active_node: 'generate_mesh', retries: 2 }))
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn()
      .mockResolvedValueOnce(okJson({}));

    await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      resolveProgressNode: (d: any) =>
        d?.active_node ? { node: d.active_node, retryCount: d.retries ?? 0 } : null,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({ node: 'generate_mesh', retryCount: 2 });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('pollErrors budget: below threshold continues, at threshold throws', async () => {
    // 9 non-ok errors, then completed - should not throw (budget=10)
    const fetchStatus = vi.fn();
    for (let i = 0; i < 9; i++) fetchStatus.mockResolvedValueOnce(notOk(500));
    fetchStatus.mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      maxPollErrors: 10,
    });
    expect(out.status).toBe('completed');
  });

  it('pollErrors budget: at limit throws', async () => {
    // 10 non-ok errors - should throw at the 10th
    const fetchStatus = vi.fn().mockResolvedValue(notOk(503));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({
        ...statusOpts(fetchStatus, fetchResult),
        maxPollErrors: 10,
      }),
    ).rejects.toThrow('503');
  });

  it('maxStatusPolls + fetch-result: proceeds to result fetch after N polls without terminal state', async () => {
    // All status polls return 'running'; after 3 iterations exhaustion fires -> result fetch
    const fetchStatus = vi.fn().mockResolvedValue(okJson({ state: 'running' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({ output: 'late.jpg' }));

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      maxStatusPolls: 3,
      onStatusExhausted: 'fetch-result',
    });

    expect(out.status).toBe('completed');
    expect((out as any).result).toEqual({ output: 'late.jpg' });
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(fetchResult).toHaveBeenCalledTimes(1);
  });

  it('maxStatusPolls + throw: throws after N polls without terminal state', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(okJson({ state: 'running' }));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({
        ...statusOpts(fetchStatus, fetchResult),
        maxStatusPolls: 3,
        onStatusExhausted: 'throw',
      }),
    ).rejects.toThrow('exhausted');

    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('statusNonOkBehavior=continue: non-ok responses do not count against error budget', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(notOk(500))
      .mockResolvedValueOnce(notOk(503))
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    // maxPollErrors: 1 would normally throw on the first non-ok, but continue mode skips counting
    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      statusNonOkBehavior: 'continue',
      maxPollErrors: 1,
    });

    expect(out.status).toBe('completed');
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('onStatusData: called once per successful status poll', async () => {
    const onStatusData = vi.fn();
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'running' }))
      .mockResolvedValueOnce(okJson({ state: 'running' }))
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    await pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), onStatusData });

    expect(onStatusData).toHaveBeenCalledTimes(3);
    expect(onStatusData).toHaveBeenCalledWith({ state: 'running' });
    expect(onStatusData).toHaveBeenCalledWith({ state: 'completed' });
  });

  it('onStatusData: called on the completed poll, before result fetch', async () => {
    const callOrder: string[] = [];
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockImplementation(async () => {
      callOrder.push('fetchResult');
      return okJson({});
    });
    const onStatusData = vi.fn().mockImplementation(() => {
      callOrder.push('onStatusData');
    });

    await pollWorkflow({ ...statusOpts(fetchStatus, fetchResult), onStatusData });

    // onStatusData must fire before fetchResult is called
    expect(callOrder).toEqual(['onStatusData', 'fetchResult']);
  });

  it('onStatusData: not called on 404 status response', async () => {
    const onStatusData = vi.fn();
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      max404s: 5,
      onStatusData,
    });

    // Called once for the completed poll; NOT called for the 404 poll
    expect(onStatusData).toHaveBeenCalledTimes(1);
    expect(onStatusData).toHaveBeenCalledWith({ state: 'completed' });
  });

  it('onStatusData: not called on non-ok status response', async () => {
    const onStatusData = vi.fn();
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(notOk(500))
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      statusNonOkBehavior: 'continue',
      onStatusData,
    });

    // Called once for the completed poll; NOT called for the non-ok poll
    expect(onStatusData).toHaveBeenCalledTimes(1);
    expect(onStatusData).toHaveBeenCalledWith({ state: 'completed' });
  });

  it('max404s: Number.MAX_SAFE_INTEGER tolerates many 404s and succeeds when status completes', async () => {
    // Simulates getPhotoshootStatus behavior: 404s mean "not ready yet", tolerated until terminal state
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(r404())
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({ output: 'ok.jpg' }));

    const out = await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      max404s: Number.MAX_SAFE_INTEGER,
    });

    expect(out.status).toBe('completed');
    expect(fetchStatus).toHaveBeenCalledTimes(6);
    expect(fetchResult).toHaveBeenCalledTimes(1);
  });

  it('maxPollErrors: 1 throws on the first non-ok status response', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(notOk(503));
    const fetchResult = vi.fn();

    await expect(
      pollWorkflow({
        ...statusOpts(fetchStatus, fetchResult),
        maxPollErrors: 1,
      }),
    ).rejects.toThrow('503');

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchResult).not.toHaveBeenCalled();
  });

  it('missing fetchStatus in status-then-result mode throws immediately', async () => {
    await expect(
      pollWorkflow({
        mode: 'status-then-result',
        fetchResult: async () => okJson({}),
        parseResult: identity,
      }),
    ).rejects.toThrow('fetchStatus is required');
  });

  it('onProgress is NOT called when resolveProgressNode returns null', async () => {
    const onProgress = vi.fn();
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(okJson({ state: 'running' }))
      .mockResolvedValueOnce(okJson({ state: 'completed' }));
    const fetchResult = vi.fn().mockResolvedValueOnce(okJson({}));

    await pollWorkflow({
      ...statusOpts(fetchStatus, fetchResult),
      resolveProgressNode: () => null,
      onProgress,
    });

    expect(onProgress).not.toHaveBeenCalled();
  });

});
