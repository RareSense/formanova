import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mockCheckCredits = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockRun = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCredits: mockCheckCredits }) }));
vi.mock('@/contexts/CreditsContext', () => ({ useCredits: () => ({ refreshCredits: mockRefresh }) }));
vi.mock('@/lib/design-image-run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design-image-run')>()),
  runDesignImage: mockRun,
}));

import { DesignImageRunError } from '@/lib/design-image-run';
import { useDesignImageRun } from './useDesignImageRun';

const RESULT = { image: { uri: 'u', url: 'https://x/a', type: 'image/png', bytes: 1, sha256: 's' }, consistent: null, drift: [], view: null };

beforeEach(() => {
  mockCheckCredits.mockReset();
  mockRefresh.mockReset().mockResolvedValue(undefined);
  mockRun.mockReset();
});

describe('useDesignImageRun', () => {
  it('checks credits once for the whole batch, then runs each request', async () => {
    mockCheckCredits.mockResolvedValue(true);
    mockRun.mockResolvedValue(RESULT);
    const { result } = renderHook(() => useDesignImageRun());
    let outcomes: unknown;
    await act(async () => { outcomes = await result.current.generate([{ prompt: 'a' }, { prompt: 'b' }, { prompt: 'c' }, { prompt: 'd' }]); });
    expect(mockCheckCredits).toHaveBeenCalledTimes(1);
    expect(mockCheckCredits).toHaveBeenCalledWith('design_image_v1', 4);
    expect(mockRun).toHaveBeenCalledTimes(4);
    expect(outcomes).toHaveLength(4);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not start anything when credits are short', async () => {
    mockCheckCredits.mockResolvedValue(false);
    const { result } = renderHook(() => useDesignImageRun());
    let outcomes: unknown = 'unset';
    await act(async () => { outcomes = await result.current.generate([{ prompt: 'a' }]); });
    expect(outcomes).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('keeps the good pictures when one of the batch fails', async () => {
    mockCheckCredits.mockResolvedValue(true);
    mockRun.mockResolvedValueOnce(RESULT).mockRejectedValueOnce(new DesignImageRunError('That picture was blocked.', null, false));
    const { result } = renderHook(() => useDesignImageRun());
    let outcomes: Array<{ ok: boolean; message?: string; retryable?: boolean }> = [];
    await act(async () => { outcomes = (await result.current.generate([{ prompt: 'a' }, { prompt: 'b' }])) ?? []; });
    expect(outcomes[0].ok).toBe(true);
    expect(outcomes[1]).toEqual({ ok: false, message: 'That picture was blocked.', retryable: false });
  });

  it('cancels in-flight runs on unmount', async () => {
    mockCheckCredits.mockResolvedValue(true);
    let seenSignal: AbortSignal | undefined;
    mockRun.mockImplementation((_r: unknown, signal: AbortSignal) => { seenSignal = signal; return new Promise(() => {}); });
    const { result, unmount } = renderHook(() => useDesignImageRun());
    await act(async () => { void result.current.generate([{ prompt: 'a' }]); await Promise.resolve(); });
    expect(result.current.running).toBe(true);
    unmount();
    expect(seenSignal?.aborted).toBe(true);
  });

  it('reports each picture as soon as it lands', async () => {
    mockCheckCredits.mockResolvedValue(true);
    mockRun.mockResolvedValueOnce(RESULT).mockRejectedValueOnce(new DesignImageRunError('nope', null, true));
    const seen: Array<[number, boolean]> = [];
    const { result } = renderHook(() => useDesignImageRun());
    await act(async () => { await result.current.generate([{ prompt: 'a' }, { prompt: 'b' }], { onOutcome: (i, o) => seen.push([i, o.ok]) }); });
    expect(seen.sort()).toEqual([[0, true], [1, false]]);
  });
});
