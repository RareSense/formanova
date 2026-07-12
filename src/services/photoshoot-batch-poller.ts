import {
  fetchPhotoshootBatchResult,
  fetchPhotoshootBatchStatus,
  RESULT_ENDPOINT,
  STATUS_ENDPOINT,
  type PhotoshootBatchJob,
} from './photoshoot-batch-api';
import {
  derivePhotoshootProgress,
  extractPhotoshootResultImages,
  resolvePhotoshootWorkflowState,
  type PhotoshootWorkflowState,
} from './photoshoot-batch-parser';

// AI_RULES.md §5 contract
export const START_ENDPOINT = 'photoshoot-job-specific';
export const STATUS_ENDPOINT_TEMPLATE = STATUS_ENDPOINT;
export const RESULT_ENDPOINT_TEMPLATE = RESULT_ENDPOINT;
export const POLL_INTERVAL_MS = 3_000;
export const POLL_TIMEOUT_MS = 12 * 60 * 1_000;
export const TERMINAL_STATES = new Set<PhotoshootWorkflowState>(['completed', 'failed', 'budget_exhausted']);
export const TRANSIENT_404_POLICY = 'retry';
export const MAX_CONSECUTIVE_ERRORS = 5;

export interface PhotoshootTrackedWorkflow {
  workflowId: string;
  job: PhotoshootBatchJob;
  startedAt: number;
}

export interface PhotoshootPollProgress {
  workflowId: string;
  progress: number;
  step: string;
}

export interface PhotoshootPollResult {
  workflowId: string;
  imageUrls: string[];
}

export interface PhotoshootPollError {
  workflowId: string;
  finalState: Exclude<PhotoshootWorkflowState, 'running' | 'unknown'>;
}

export interface PollPhotoshootWorkflowsOptions {
  workflows: PhotoshootTrackedWorkflow[];
  onProgress: (progress: PhotoshootPollProgress) => void;
  onResult: (result: PhotoshootPollResult) => void;
  onError: (error: PhotoshootPollError) => void;
  onAllDone?: () => void;
  cancelled: () => boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollPhotoshootWorkflows({
  workflows,
  onProgress,
  onResult,
  onError,
  onAllDone,
  cancelled,
}: PollPhotoshootWorkflowsOptions): Promise<void> {
  if (workflows.length === 0) {
    onAllDone?.();
    return;
  }

  const pending = new Map(workflows.map((workflow) => [workflow.workflowId, workflow]));
  const errorCounts = new Map<string, number>();
  const startedAt = Date.now();

  while (pending.size > 0) {
    if (cancelled()) return;
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      for (const workflowId of pending.keys()) {
        onError({ workflowId, finalState: 'failed' });
      }
      break;
    }

    await sleep(POLL_INTERVAL_MS);
    if (cancelled()) return;

    await Promise.all(
      Array.from(pending.entries()).map(async ([workflowId]) => {
        try {
          const status = await fetchPhotoshootBatchStatus(workflowId);
          if (!status) {
            const nextErrorCount = (errorCounts.get(workflowId) ?? 0) + 1;
            errorCounts.set(workflowId, nextErrorCount);
            if (nextErrorCount >= MAX_CONSECUTIVE_ERRORS) {
              pending.delete(workflowId);
              onError({ workflowId, finalState: 'failed' });
            }
            return;
          }

          errorCounts.set(workflowId, 0);
          const workflowState = resolvePhotoshootWorkflowState(status);
          if (!TERMINAL_STATES.has(workflowState)) {
            onProgress({ workflowId, ...derivePhotoshootProgress(status) });
            return;
          }

          if (workflowState !== 'completed') {
            pending.delete(workflowId);
            onError({ workflowId, finalState: workflowState });
            return;
          }

          onProgress({ workflowId, progress: 95, step: 'Fetching results...' });
          const result = await fetchPhotoshootBatchResult(workflowId);
          if (!result) {
            const nextErrorCount = (errorCounts.get(workflowId) ?? 0) + 1;
            errorCounts.set(workflowId, nextErrorCount);
            if (nextErrorCount >= MAX_CONSECUTIVE_ERRORS) {
              pending.delete(workflowId);
              onError({ workflowId, finalState: 'failed' });
            }
            return;
          }

          const imageUrls = extractPhotoshootResultImages(result);
          pending.delete(workflowId);
          if (imageUrls.length === 0) {
            onError({ workflowId, finalState: 'failed' });
            return;
          }
          onResult({ workflowId, imageUrls });
        } catch {
          const nextErrorCount = (errorCounts.get(workflowId) ?? 0) + 1;
          errorCounts.set(workflowId, nextErrorCount);
          if (nextErrorCount >= MAX_CONSECUTIVE_ERRORS) {
            pending.delete(workflowId);
            onError({ workflowId, finalState: 'failed' });
          }
        }
      }),
    );
  }

  onAllDone?.();
}
