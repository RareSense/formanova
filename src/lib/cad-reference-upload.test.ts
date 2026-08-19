import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/microservices-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/microservices-api')>();
  return { ...actual, uploadCadReferenceImages: mockUpload };
});

import { buildReferenceInputs } from './cad-reference-upload';
import { CadReferenceUploadError } from './microservices-api';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

const ITEMS = [
  { asset_id: 'id-a', uri: 'azure://a', sha256: 'sa', type: 'image/jpeg', bytes: 101, position: 0 },
  { asset_id: 'id-b', uri: 'azure://b', sha256: 'sb', type: 'image/jpeg', bytes: 202, position: 1 },
];

beforeEach(() => {
  mockUpload.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('buildReferenceInputs', () => {
  it('returns the uploaded items unmodified, keeping all six keys', async () => {
    mockUpload.mockResolvedValue({ items: ITEMS, set_id: 'grp-1' });

    const result = await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')]);

    // Passed straight through: the workflow reads these objects as-is, and
    // stripping asset_id/position would contradict the backend contract.
    expect(result).toEqual(ITEMS);
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Array), { category: 'ring' });
  });

  it('sends no request at all for an empty file list', async () => {
    expect(await buildReferenceInputs([])).toEqual([]);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('falls back to inline base64 when the endpoint is not deployed (404)', async () => {
    mockUpload.mockRejectedValue(new CadReferenceUploadError(404, 'not found'));

    const result = await buildReferenceInputs([imageFile('a.jpg')]);

    expect(result).toHaveLength(1);
    expect(typeof result[0]).toBe('string');
    expect(result[0] as string).toMatch(/^data:/);
  });

  it.each([
    [400, 'unsupported image type'],
    [401, 'missing auth'],
    [422, 'too many files'],
  ])('surfaces a %i rather than silently degrading to base64', async (status, message) => {
    mockUpload.mockRejectedValue(new CadReferenceUploadError(status, message));

    await expect(buildReferenceInputs([imageFile('a.jpg')])).rejects.toThrow(message);
  });

  it('surfaces a non-upload error (e.g. network failure) untouched', async () => {
    mockUpload.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(buildReferenceInputs([imageFile('a.jpg')])).rejects.toThrow('Failed to fetch');
  });
});
