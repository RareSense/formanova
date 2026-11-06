import { describe, it, expect, vi } from 'vitest';

const ms = vi.hoisted(() => ({ uploadToAzure: vi.fn() }));
vi.mock('@/lib/microservices-api', () => ms);

import { linkMessage, normalizeLink, uploadClientFile, uploadedMessage, uploadProblem } from './client-uploads';

const SHA = 'a'.repeat(64);

describe('client uploads', () => {
  it('uploads jewellery photos as jewelry_photo and references as inspiration_photo', async () => {
    ms.uploadToAzure.mockResolvedValue({ uri: `azure://bucket/${SHA}.jpg` });
    const file = new File(['img'], 'ring.jpg', { type: 'image/jpeg' });
    expect(await uploadClientFile(file, 'jewelry_photos')).toEqual({
      name: 'ring.jpg',
      uri: `azure://bucket/${SHA}.jpg`,
      sha256: SHA,
      purpose: 'jewelry_photos',
    });
    expect(ms.uploadToAzure).toHaveBeenLastCalledWith(btoa('img'), 'image/jpeg', 'jewelry_photo');
    await uploadClientFile(file, 'references');
    expect(ms.uploadToAzure.mock.calls.at(-1)?.[2]).toBe('inspiration_photo');
  });

  it('refuses non-images and huge files before uploading', async () => {
    expect(uploadProblem(new File(['x'], 'a.stl', { type: 'model/stl' }))).toMatch(/only images/i);
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    expect(uploadProblem(big)).toMatch(/20 MB/);
    ms.uploadToAzure.mockClear();
    await expect(uploadClientFile(new File(['x'], 'a.zip', { type: 'application/zip' }), 'references')).rejects.toThrow();
    expect(ms.uploadToAzure).not.toHaveBeenCalled();
  });

  it('normalizes links', () => {
    expect(normalizeLink('mystore.com/rings')).toBe('https://mystore.com/rings');
    expect(normalizeLink(' https://drive.google.com/x ')).toBe('https://drive.google.com/x');
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('hello there')).toBeNull();
    expect(normalizeLink('localhost')).toBeNull();
  });

  it('writes the messages Ruby gets (contract section 3)', () => {
    expect(uploadedMessage('jewelry_photos', ['a.jpg', 'b.jpg'])).toBe(
      'The client just uploaded 2 file(s) for jewelry photos (a.jpg, b.jpg). They are saved. Thank them briefly and continue.',
    );
    expect(linkMessage('https://x.y')).toBe('The client shared a link: https://x.y. It is saved. Thank them briefly and continue.');
  });
});
