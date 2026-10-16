/**
 * design-image-run.ts
 *
 * Starts one design_image_v1 run and waits for its picture. No React here, so
 * the start/poll/parse rules are testable on their own (AI_RULES 5 and 10);
 * useDesignImageRun adds the credit gate, cancellation on unmount and the
 * credit refresh.
 *
 * Polling (AI_RULES 5):
 *   start   POST /api/run/state/design_image_v1
 *   status  GET  /api/status/{id}   runtime.state; completed | failed | budget_exhausted are terminal
 *   result  GET  /api/result/{id}   fetched once, after status is terminal
 *   interval 2 s, timeout 4 min, up to 3 transient 404s while the run registers,
 *   up to 5 status errors, cancelled through the caller's AbortSignal.
 *
 * Pictures the customer uploads, and the flattened markup, are sent inline as
 * data: URLs; the backend stores them content-addressed. They deliberately do
 * not go through /upload/cad-reference, which creates a My Rings set per call:
 * a draft design picture is not a ring.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow, type PollWorkflowResult } from '@/lib/poll-workflow';
import {
  DESIGN_IMAGE_POLL_INTERVAL_MS,
  DESIGN_IMAGE_POLL_TIMEOUT_MS,
  DESIGN_IMAGE_WORKFLOW,
  buildDesignImageStartBody,
  isDesignImageSuccess,
  parseDesignImageFailure,
  parseDesignImageResult,
  type DesignImageResult,
  type DesignImageStartParams,
} from '@/lib/design-image-api';

/** A run that ended without a picture. `message` is safe to show the customer. */
export class DesignImageRunError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false) {
    super(message);
    this.name = 'DesignImageRunError';
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture'));
    reader.readAsDataURL(blob);
  });
}

export async function startDesignImage(params: DesignImageStartParams, signal?: AbortSignal): Promise<string> {
  const body = buildDesignImageStartBody(params);
  const res = await authenticatedFetch(`/api/run/state/${DESIGN_IMAGE_WORKFLOW}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.status === 402) throw new DesignImageRunError('Not enough credits for this picture.', 402);
    const detail = (err as Record<string, unknown>).error ?? (err as Record<string, unknown>).detail;
    throw new DesignImageRunError(typeof detail === 'string' && detail ? detail : `Couldn't start the picture (${res.status})`, res.status);
  }
  const data = (await res.json()) as { workflow_id?: string };
  if (!data.workflow_id) throw new DesignImageRunError("Couldn't start the picture (no run id)");
  return data.workflow_id;
}

/** Resolves with the picture, or null when the caller cancelled. */
export async function waitForDesignImage(workflowId: string, signal?: AbortSignal): Promise<DesignImageResult | null> {
  let polled: PollWorkflowResult<unknown>;
  try {
    polled = await pollWorkflow<unknown>({
      mode: 'status-then-result',
      fetchStatus: () => authenticatedFetch(`/api/status/${workflowId}`, { signal }),
      fetchResult: () => authenticatedFetch(`/api/result/${workflowId}`, { signal }),
      resolveState: (statusData) => {
        const s = statusData as { runtime?: { state?: string }; state?: string };
        return (s.runtime?.state || s.state || 'unknown').toLowerCase();
      },
      parseResult: (d) => d,
      intervalMs: DESIGN_IMAGE_POLL_INTERVAL_MS,
      timeoutMs: DESIGN_IMAGE_POLL_TIMEOUT_MS,
      max404s: 3,
      maxPollErrors: 5,
      maxResultRetries: 2,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return null;
    const message = err instanceof Error && /timed? ?out/i.test(err.message)
      ? 'This picture is taking too long. Please try again.'
      : "We couldn't make that picture. Please try again.";
    throw new DesignImageRunError(message, null, true);
  }
  if (polled.status === 'cancelled') return null;
  if (!isDesignImageSuccess(polled.result)) {
    const failure = parseDesignImageFailure(polled.result);
    throw new DesignImageRunError(failure.userMessage, null, failure.retryable);
  }
  return parseDesignImageResult(polled.result);
}

/** Start and wait in one call. */
export async function runDesignImage(params: DesignImageStartParams, signal?: AbortSignal): Promise<DesignImageResult | null> {
  const id = await startDesignImage(params, signal);
  return waitForDesignImage(id, signal);
}
