import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSupportingImages, MAX_SUPPORTING_IMAGES } from './useSupportingImages';

vi.mock('@/lib/image-normalize', () => ({
  normalizeImageFile: async (f: File) => f,
  isLikelyImageFile: (f: File) => typeof f?.type === 'string' && f.type.startsWith('image/'),
}));

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

describe('useSupportingImages', () => {
  it('caps supporting images at MAX_SUPPORTING_IMAGES and rejects the overflow', async () => {
    const onReject = vi.fn();
    const { result } = renderHook(() => useSupportingImages({ onReject }));

    await act(async () => {
      result.current.addFiles([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')]);
    });

    await waitFor(() => expect(result.current.supporting.length).toBe(MAX_SUPPORTING_IMAGES));
    expect(onReject).toHaveBeenCalled(); // third file over the 3-image total
  });

  it('retains the normalized file and a preview per entry (no per-file upload)', async () => {
    const { result } = renderHook(() => useSupportingImages());

    await act(async () => {
      result.current.addFiles([imageFile('a.png')]);
    });

    await waitFor(() => expect(result.current.supporting.length).toBe(1));
    expect(result.current.supporting[0]?.file).toBeInstanceOf(File);
    expect(typeof result.current.supporting[0]?.preview).toBe('string');
  });

  it('skips non-image files and reports them', async () => {
    const onReject = vi.fn();
    const { result } = renderHook(() => useSupportingImages({ onReject }));

    await act(async () => {
      result.current.addFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    });

    expect(result.current.supporting.length).toBe(0);
    expect(onReject).toHaveBeenCalled();
  });

  it('setVaultSupporting loads reusable vault entries (no file) and replaces prior entries', async () => {
    const { result } = renderHook(() => useSupportingImages());

    await act(async () => {
      result.current.addFiles([imageFile('a.png')]);
    });
    await waitFor(() => expect(result.current.supporting.length).toBe(1));

    // Clicking a grouped set replaces the list with its non-cover members.
    act(() => result.current.setVaultSupporting([
      { url: 'azure://m2', assetId: 'id-m2' },
      { url: 'azure://m3', assetId: 'id-m3' },
    ]));

    expect(result.current.supporting.length).toBe(2);
    expect(result.current.supporting[0]).toMatchObject({ assetId: 'id-m2', url: 'azure://m2' });
    expect(result.current.supporting[0]?.file).toBeUndefined();

    // Selecting an ungrouped product clears the angles.
    act(() => result.current.setVaultSupporting([]));
    expect(result.current.supporting.length).toBe(0);
  });

  it('setVaultSupporting caps at MAX_SUPPORTING_IMAGES', () => {
    const { result } = renderHook(() => useSupportingImages());
    act(() => result.current.setVaultSupporting([
      { url: 'u1', assetId: 'i1' },
      { url: 'u2', assetId: 'i2' },
      { url: 'u3', assetId: 'i3' },
    ]));
    expect(result.current.supporting.length).toBe(MAX_SUPPORTING_IMAGES);
  });

  it('removes and clears supporting images', async () => {
    const { result } = renderHook(() => useSupportingImages());

    await act(async () => {
      result.current.addFiles([imageFile('a.png'), imageFile('b.png')]);
    });
    await waitFor(() => expect(result.current.supporting.length).toBe(2));

    act(() => result.current.removeAt(0));
    expect(result.current.supporting.length).toBe(1);

    act(() => result.current.clear());
    expect(result.current.supporting.length).toBe(0);
  });
});
