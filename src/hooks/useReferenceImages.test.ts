import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/microservices-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/microservices-api')>();
  return { ...actual, uploadCadReferenceImages: mockUpload };
});
// Pass files through untouched: format conversion is covered by image-normalize's
// own tests and would otherwise need real image bytes here.
vi.mock('@/lib/image-normalize', () => ({
  normalizeImageFiles: (files: File[]) => Promise.resolve(files),
}));

import { useReferenceImages } from './useReferenceImages';
import type { CadReferenceItem } from '@/lib/microservices-api';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

function item(id: string, position: number): CadReferenceItem {
  return { asset_id: id, uri: `azure://${id}`, sha256: `sha-${id}`, type: 'image/jpeg', bytes: 100, position };
}

beforeEach(() => {
  mockUpload.mockReset();
  mockUpload.mockResolvedValue({ items: [], set_id: 'grp-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom does not implement object URLs.
  global.URL.createObjectURL = vi.fn((f: File) => `blob:${(f as File).name}`) as never;
  global.URL.revokeObjectURL = vi.fn() as never;
});

describe('useReferenceImages', () => {
  it('uploads on attach, without waiting for a generation', async () => {
    mockUpload.mockResolvedValue({ items: [item('a', 0)], set_id: 'grp-1' });
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => { await result.current.addReferenceImages([imageFile('a.jpg')]); });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith([expect.any(File)], { category: 'ring' });
    await waitFor(() => expect(result.current.uploadedItems).toEqual([item('a', 0)]));
  });

  it('shows the preview immediately, before the upload resolves', async () => {
    let release!: (v: unknown) => void;
    mockUpload.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => { await result.current.addReferenceImages([imageFile('a.jpg')]); });

    // Usable straight away; the item is still pending.
    expect(result.current.referenceImagePreviewUrls).toHaveLength(1);
    expect(result.current.uploadedItems).toEqual([null]);

    await act(async () => { release({ items: [item('a', 0)], set_id: 'g' }); });
    await waitFor(() => expect(result.current.uploadedItems).toEqual([item('a', 0)]));
  });

  it('keeps the image usable when its upload fails', async () => {
    mockUpload.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => { await result.current.addReferenceImages([imageFile('a.jpg')]); });

    expect(result.current.referenceImages).toHaveLength(1);
    await waitFor(() => expect(result.current.uploadedItems).toEqual([null]));
  });

  it('caps at five images and never uploads or previews the overflow', async () => {
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => {
      await result.current.addReferenceImages(
        Array.from({ length: 7 }, (_, i) => imageFile(`${i}.jpg`)),
      );
    });

    expect(result.current.referenceImages).toHaveLength(5);
    // Rejected files must not leak an object URL.
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(5);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(File)]), { category: 'ring' },
    );
    expect(mockUpload.mock.calls[0][0]).toHaveLength(5);
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
    expect(mockUpload.mock.calls[1][0]).toHaveLength(2);
  });

  it('keeps items aligned when an earlier image is removed', async () => {
    mockUpload.mockResolvedValue({ items: [item('a', 0), item('b', 1)], set_id: 'g' });
    const { result } = renderHook(() => useReferenceImages());

    await act(async () => {
      await result.current.addReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);
    });
    await waitFor(() => expect(result.current.uploadedItems).toHaveLength(2));

    act(() => result.current.removeReferenceImage(0));

    expect(result.current.referenceImages).toHaveLength(1);
    expect(result.current.uploadedItems).toEqual([item('b', 1)]);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
  });

  it('revokes every preview on clear', async () => {
    const { result } = renderHook(() => useReferenceImages());
    await act(async () => {
      await result.current.addReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);
    });

    act(() => result.current.clearReferenceImages());

    expect(result.current.referenceImages).toEqual([]);
    expect(result.current.uploadedItems).toEqual([]);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
