import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/microservices-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/microservices-api')>();
  return { ...actual, uploadCadReferenceImages: mockUpload };
});

import { buildReferenceInputs } from './cad-reference-upload';
import type { CadReferenceItem } from './microservices-api';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

function item(id: string, position: number): CadReferenceItem {
  return { asset_id: id, uri: `azure://${id}`, sha256: `sha-${id}`, type: 'image/jpeg', bytes: 100, position };
}

beforeEach(() => {
  mockUpload.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('buildReferenceInputs', () => {
  it('sends the whole set in one call, so the run gets a single set_id', async () => {
    // One call is what makes a set mean one generation. Uploading per file
    // would mint a set each and split one run across several vault cards.
    mockUpload.mockResolvedValue({ items: [item('a', 0), item('b', 1)], set_id: 'set-1' });

    await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')]);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][0]).toHaveLength(2);
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Array), { category: 'ring' });
  });

  it('passes the items through unmodified, keeping all six keys', async () => {
    const items = [item('a', 0), item('b', 1)];
    mockUpload.mockResolvedValue({ items, set_id: 'set-1' });

    expect(await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')])).toEqual(items);
  });

  it('sends no request at all for an empty file list', async () => {
    expect(await buildReferenceInputs([])).toEqual([]);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('inlines the files when the upload fails, rather than blocking the run', async () => {
    mockUpload.mockRejectedValue(new Error('500'));

    const result = await buildReferenceInputs([imageFile('a.jpg')]);

    expect(result).toHaveLength(1);
    expect(result[0] as string).toMatch(/^data:/);
  });

  it('inlines rather than silently dropping an image the response missed', async () => {
    // A short list would generate from fewer images than the user chose.
    mockUpload.mockResolvedValue({ items: [item('a', 0)], set_id: 'set-1' });

    const result = await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => typeof r === 'string' && r.startsWith('data:'))).toBe(true);
  });
});
