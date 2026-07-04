import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSupportingImages, MAX_SUPPORTING_IMAGES } from './useSupportingImages';

vi.mock('@/lib/image-normalize', () => ({
  normalizeImageFile: async (f: File) => f,
  isLikelyImageFile: (f: File) => typeof f?.type === 'string' && f.type.startsWith('image/'),
}));
vi.mock('@/lib/image-compression', () => ({
  compressImageBlob: async (b: Blob) => ({ blob: b }),
}));
vi.mock('@/lib/jewelry-utils', () => ({ TO_SINGULAR: {} }));

const uploadToAzure = vi.hoisted(() => vi.fn());
vi.mock('@/lib/microservices-api', () => ({ uploadToAzure }));

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

describe('useSupportingImages', () => {
  beforeEach(() => {
    uploadToAzure.mockReset();
    uploadToAzure.mockResolvedValue({ sas_url: 'https://az/sas', https_url: 'https://az/https', asset_id: 'asset-1' });
  });

  it('caps supporting images at MAX_SUPPORTING_IMAGES and rejects the overflow', async () => {
    const onReject = vi.fn();
    const { result } = renderHook(() =>
      useSupportingImages({ isProductShot: false, category: 'earrings', onReject }),
    );

    await act(async () => {
      result.current.addFiles([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')]);
    });

    await waitFor(() => expect(result.current.supporting.length).toBe(MAX_SUPPORTING_IMAGES));
    expect(onReject).toHaveBeenCalled(); // third file over the 3-image total
  });

  it('fills url + assetId after the upload resolves', async () => {
    const { result } = renderHook(() =>
      useSupportingImages({ isProductShot: false, category: 'earrings' }),
    );

    await act(async () => {
      result.current.addFiles([imageFile('a.png')]);
    });

    await waitFor(() => expect(result.current.supporting[0]?.uploading).toBe(false));
    expect(result.current.supporting[0]?.url).toBe('https://az/sas');
    expect(result.current.supporting[0]?.assetId).toBe('asset-1');
  });

  it('skips non-image files and reports them', async () => {
    const onReject = vi.fn();
    const { result } = renderHook(() =>
      useSupportingImages({ isProductShot: false, category: 'earrings', onReject }),
    );

    await act(async () => {
      result.current.addFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    });

    expect(result.current.supporting.length).toBe(0);
    expect(onReject).toHaveBeenCalled();
  });

  it('removes and clears supporting images', async () => {
    const { result } = renderHook(() =>
      useSupportingImages({ isProductShot: false, category: 'earrings' }),
    );

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
