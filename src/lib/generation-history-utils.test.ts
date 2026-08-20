import { describe, expect, it, vi } from 'vitest';
import { getArtifactKey, isVisibleGeneration, retryNullable } from './generation-history-utils';

describe('retryNullable', () => {
  it('retries a transient empty result and returns the successful value', async () => {
    const task = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ok: true });

    await expect(retryNullable(task, 2)).resolves.toEqual({ ok: true });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('returns a terminal null after the configured attempts', async () => {
    const task = vi.fn().mockRejectedValue(new Error('temporary failure'));

    await expect(retryNullable(task, 2)).resolves.toBeNull();
    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe('getArtifactKey', () => {
  it('uses stable artifact proxy and content-addressed identities', () => {
    expect(getArtifactKey('/api/artifacts/artifact-123')).toBe('artifact-123');
    expect(getArtifactKey(`https://cdn.example/${'a'.repeat(64)}.glb`)).toBe('a'.repeat(64));
  });

  it('does not treat a generic positional filename as stable identity', () => {
    expect(getArtifactKey('https://cdn.example/runs/one/model.glb')).toBeNull();
  });
});

describe('generation history visibility', () => {
  it('only exposes completed workflows', () => {
    expect(isVisibleGeneration({ status: 'completed' })).toBe(true);
    expect(isVisibleGeneration({ status: 'failed' })).toBe(false);
    expect(isVisibleGeneration({ status: 'running' })).toBe(false);
  });
});
