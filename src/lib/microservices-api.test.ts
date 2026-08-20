import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockAuthFetch }));

import { bulkUploadJewelry, MAX_BULK_JEWELRY_FILES, uploadCadReferenceImages } from './microservices-api';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

const BULK_RESPONSE = {
  jewelry: [
    { asset_id: 'id-a', uri: 'azure://a', sha256: 'sa' },
    { asset_id: 'id-b', uri: 'azure://b', sha256: 'sb' },
  ],
  model: [],
  background: [],
  input_group_id: 'grp-1',
};

describe('bulkUploadJewelry', () => {
  beforeEach(() => mockAuthFetch.mockReset());

  it('posts to /upload/bulk with jewelry_files and group_jewelry=true', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(BULK_RESPONSE));

    const res = await bulkUploadJewelry([imageFile('a.jpg'), imageFile('b.jpg')]);

    const [url, options] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/\/upload\/bulk$/);
    expect(options.method).toBe('POST');

    const form = options.body as FormData;
    expect(form.getAll('jewelry_files')).toHaveLength(2);
    expect(form.get('group_jewelry')).toBe('true');
    // input_group_id is server-minted; never sent on the write path.
    expect(form.get('input_group_id')).toBeNull();

    expect(res.input_group_id).toBe('grp-1');
    expect(res.jewelry.map((j) => j.uri)).toEqual(['azure://a', 'azure://b']);
  });

  it('appends category and intended_use only when provided (truthy)', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(BULK_RESPONSE));
    await bulkUploadJewelry([imageFile('a.jpg')], { category: 'necklace', intended_use: 'on_model' });
    let form = mockAuthFetch.mock.calls[0][1].body as FormData;
    expect(form.get('category')).toBe('necklace');
    expect(form.get('intended_use')).toBe('on_model');

    // Omitted entirely: no keys on the wire (backend Form(None) default applies).
    mockAuthFetch.mockReset();
    mockAuthFetch.mockReturnValueOnce(okJson(BULK_RESPONSE));
    await bulkUploadJewelry([imageFile('a.jpg')]);
    form = mockAuthFetch.mock.calls[0][1].body as FormData;
    expect(form.get('category')).toBeNull();
    expect(form.get('intended_use')).toBeNull();

    // Empty strings are falsy: still nothing sent.
    mockAuthFetch.mockReset();
    mockAuthFetch.mockReturnValueOnce(okJson(BULK_RESPONSE));
    await bulkUploadJewelry([imageFile('a.jpg')], { category: '', intended_use: '' });
    form = mockAuthFetch.mock.calls[0][1].body as FormData;
    expect(form.get('category')).toBeNull();
    expect(form.get('intended_use')).toBeNull();
  });

  it('rejects an empty set and more than the max without calling the API', async () => {
    await expect(bulkUploadJewelry([])).rejects.toThrow(/1-3/);
    await expect(
      bulkUploadJewelry([imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg'), imageFile('d.jpg')]),
    ).rejects.toThrow(/1-3/);
    expect(MAX_BULK_JEWELRY_FILES).toBe(3);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('throws with the status on a non-ok response', async () => {
    mockAuthFetch.mockReturnValueOnce(Promise.resolve({
      ok: false,
      status: 422,
      text: () => Promise.resolve('too many files'),
    } as unknown as Response));

    await expect(bulkUploadJewelry([imageFile('a.jpg')])).rejects.toThrow(/422/);
  });
});

const CAD_RESPONSE = {
  items: [
    { asset_id: 'id-a', uri: 'azure://a', sha256: 'sa', type: 'image/jpeg', bytes: 101, position: 0 },
    { asset_id: 'id-b', uri: 'azure://b', sha256: 'sb', type: 'image/jpeg', bytes: 202, position: 1 },
  ],
  set_id: 'grp-cad-1',
};

describe('uploadCadReferenceImages', () => {
  beforeEach(() => mockAuthFetch.mockReset());

  it('posts every file to /upload/cad-reference under the files field', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(CAD_RESPONSE));

    const res = await uploadCadReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);

    const [url, options] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/\/upload\/cad-reference$/);
    expect(options.method).toBe('POST');

    const form = options.body as FormData;
    expect(form.getAll('files')).toHaveLength(2);
    // set_id is server-minted; never sent on the write path.
    expect(form.get('set_id')).toBeNull();

    expect(res.set_id).toBe('grp-cad-1');
  });

  it('returns items with all six keys, so they can be passed through unmodified', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(CAD_RESPONSE));

    const res = await uploadCadReferenceImages([imageFile('a.jpg'), imageFile('b.jpg')]);

    expect(Object.keys(res.items[0]).sort()).toEqual(
      ['asset_id', 'bytes', 'position', 'sha256', 'type', 'uri'],
    );
    // Upload order is preserved and position is zero-based: index 0 is IMAGE 1.
    expect(res.items.map((i) => i.position)).toEqual([0, 1]);
  });

  it('appends category only when truthy', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(CAD_RESPONSE));
    await uploadCadReferenceImages([imageFile('a.jpg')], { category: 'ring' });
    expect((mockAuthFetch.mock.calls[0][1].body as FormData).get('category')).toBe('ring');

    mockAuthFetch.mockReset();
    mockAuthFetch.mockReturnValueOnce(okJson(CAD_RESPONSE));
    await uploadCadReferenceImages([imageFile('a.jpg')], { category: '' });
    expect((mockAuthFetch.mock.calls[0][1].body as FormData).get('category')).toBeNull();
  });

  it('rejects an empty set and more than five files without calling the API', async () => {
    await expect(uploadCadReferenceImages([])).rejects.toThrow(/1-5/);
    await expect(
      uploadCadReferenceImages(Array.from({ length: 6 }, (_, i) => imageFile(`${i}.jpg`))),
    ).rejects.toThrow(/1-5/);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('throws with the status on a non-ok response', async () => {
    mockAuthFetch.mockReturnValueOnce(Promise.resolve({
      ok: false,
      status: 400,
      text: () => Promise.resolve('unsupported image type'),
    } as unknown as Response));

    await expect(uploadCadReferenceImages([imageFile('a.gif')])).rejects.toThrow(/400/);
  });
});
