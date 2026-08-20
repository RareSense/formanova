import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pass files through untouched: format conversion is covered by
// image-normalize's own tests and would otherwise need real image bytes here.
vi.mock('@/lib/image-normalize', () => ({
  normalizeImageFiles: (files: File[]) => Promise.resolve(files),
}));

import { useReferenceImages } from './useReferenceImages';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  // jsdom does not implement object URLs.
  global.URL.createObjectURL = vi.fn((f: File) => `blob:${(f as File).name}`) as never;
  global.URL.revokeObjectURL = vi.fn() as never;
});

describe('useReferenceImages', () => {
  it('holds files and previews without uploading', async () => {
    // Uploading happens at generate time so the whole set shares one set_id.
    // Attaching must not touch the network.
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => { await result.current.addReferenceImages([imageFile('a.jpg')]); });

    expect(result.current.referenceImages).toHaveLength(1);
    expect(result.current.referenceImagePreviewUrls).toEqual(['blob:a.jpg']);
  });

  it('caps at five images and never previews the overflow', async () => {
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => {
      await result.current.addReferenceImages(
        Array.from({ length: 7 }, (_, i) => imageFile(`${i}.jpg`)),
      );
    });

    expect(result.current.referenceImages).toHaveLength(5);
    // Rejected files must not leak an object URL.
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(5);
  });

  it('does not exceed the cap across two separate attaches', async () => {
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => {
      await result.current.addReferenceImages([imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg')]);
    });
    await act(async () => {
      await result.current.addReferenceImages([imageFile('d.jpg'), imageFile('e.jpg'), imageFile('f.jpg')]);
    });

    expect(result.current.referenceImages).toHaveLength(5);
  });

  it('keeps files and previews aligned when one is removed', async () => {
    const { result } = renderHook(() => useReferenceImages());
    await act(async () => {
      await result.current.addReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);
    });

    act(() => result.current.removeReferenceImage(0));

    expect(result.current.referenceImages.map(f => f.name)).toEqual(['b.jpg']);
    expect(result.current.referenceImagePreviewUrls).toEqual(['blob:b.jpg']);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
  });

  it('revokes every preview on clear', async () => {
    const { result } = renderHook(() => useReferenceImages());
    await act(async () => {
      await result.current.addReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);
    });

    act(() => result.current.clearReferenceImages());

    expect(result.current.referenceImages).toEqual([]);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('replaces the whole set, revoking the previews it drops', async () => {
    const { result } = renderHook(() => useReferenceImages());
    await act(async () => { await result.current.addReferenceImages([imageFile('old.jpg')]); });

    await act(async () => { await result.current.replaceReferenceImages([imageFile('new.jpg')]); });

    expect(result.current.referenceImages.map(f => f.name)).toEqual(['new.jpg']);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:old.jpg');
  });
});
