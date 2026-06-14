import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPhotoshootBatchStatus = vi.fn();
const fetchPhotoshootBatchResult = vi.fn();

vi.mock('./photoshoot-batch-api', async () => {
  const actual = await vi.importActual<typeof import('./photoshoot-batch-api')>('./photoshoot-batch-api');
  return {
    ...actual,
    fetchPhotoshootBatchStatus: (...args: unknown[]) => fetchPhotoshootBatchStatus(...args),
    fetchPhotoshootBatchResult: (...args: unknown[]) => fetchPhotoshootBatchResult(...args),
  };
});

import {
  MAX_CONSECUTIVE_ERRORS,
  POLL_INTERVAL_MS,
  pollPhotoshootWorkflows,
} from './photoshoot-batch-poller';

describe('photoshoot-batch-poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('progressively completes workflows as results arrive', async () => {
    const onProgress = vi.fn();
    const onResult = vi.fn();
    const onError = vi.fn();

    fetchPhotoshootBatchStatus
      .mockResolvedValueOnce({ progress: { total_nodes: 4, completed_nodes: 2, visited: ['prep_stage'] } })
      .mockResolvedValueOnce({ runtime: { state: 'completed' } })
      .mockResolvedValueOnce({ runtime: { state: 'completed' } });
    fetchPhotoshootBatchResult
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ output: [{ output_url: 'https://example.com/image.jpg' }] });

    const task = pollPhotoshootWorkflows({
      workflows: [{
        workflowId: 'wf-1',
        startedAt: Date.now(),
        job: {
          asset: { thumbnailUrl: 'j', assetId: 'a' },
          assignment: { url: 'm', label: 'M' },
          isProductShot: false,
          category: 'ring',
        },
      }],
      cancelled: () => false,
      onProgress,
      onResult,
      onError,
    });

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(onProgress).toHaveBeenCalledWith({ workflowId: 'wf-1', progress: 65, step: 'prep stage' });

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(onProgress).toHaveBeenCalledWith({ workflowId: 'wf-1', progress: 95, step: 'Fetching results...' });

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await task;
    expect(onResult).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      imageUrls: ['https://example.com/image.jpg'],
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('fails a workflow after repeated transient errors', async () => {
    const onError = vi.fn();
    fetchPhotoshootBatchStatus.mockResolvedValue(null);

    const task = pollPhotoshootWorkflows({
      workflows: [{
        workflowId: 'wf-2',
        startedAt: Date.now(),
        job: {
          asset: { thumbnailUrl: 'j', assetId: 'a' },
          assignment: { url: 'm', label: 'M' },
          isProductShot: false,
          category: 'ring',
        },
      }],
      cancelled: () => false,
      onProgress: vi.fn(),
      onResult: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * MAX_CONSECUTIVE_ERRORS);
    await task;
    expect(onError).toHaveBeenCalledWith({ workflowId: 'wf-2', finalState: 'failed' });
  });

  it('stops polling when cancelled', async () => {
    const cancelled = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const task = pollPhotoshootWorkflows({
      workflows: [{
        workflowId: 'wf-3',
        startedAt: Date.now(),
        job: {
          asset: { thumbnailUrl: 'j', assetId: 'a' },
          assignment: { url: 'm', label: 'M' },
          isProductShot: false,
          category: 'ring',
        },
      }],
      cancelled,
      onProgress: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await task;
    expect(fetchPhotoshootBatchStatus).not.toHaveBeenCalled();
  });
});
