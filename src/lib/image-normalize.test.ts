import { describe, it, expect, vi, beforeEach } from 'vitest';

// The HEIC decoder (heic-to) loads WebAssembly, which jsdom doesn't provide,
// so stub the module out and drive the conversion result from each test.
vi.mock('heic-to', () => ({ heicTo: vi.fn() }));

import { heicTo } from 'heic-to';
import { isLikelyImageFile, normalizeImageFile } from './image-normalize';

function file(name: string, type: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type });
}

// First bytes of a real iPhone photo: an ISO-BMFF "ftyp" box with brand "heic".
const HEIC_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x2c, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66, 0x31, 0x4d, 0x69, 0x48, 0x42,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

describe('normalizeImageFile', () => {
  const converted = new Blob([JPEG_BYTES], { type: 'image/jpeg' });

  beforeEach(() => {
    vi.mocked(heicTo).mockReset();
    vi.mocked(heicTo).mockResolvedValue(converted);
  });

  it('converts HEIC bytes even when the file claims to be a JPEG', async () => {
    const input = new File([HEIC_BYTES], 'IMG_0412.jpg', { type: 'image/jpeg' });

    const out = await normalizeImageFile(input);

    expect(heicTo).toHaveBeenCalledTimes(1);
    expect(heicTo).toHaveBeenCalledWith(expect.objectContaining({ blob: input, type: 'image/jpeg' }));
    expect(out).not.toBe(input);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0412.jpg');
    expect(out.size).toBe(converted.size);
  });

  it('converts HEIC bytes that arrive with an empty type and a .heic name', async () => {
    const input = new File([HEIC_BYTES], 'IMG_0412.HEIC', { type: '' });

    const out = await normalizeImageFile(input);

    expect(heicTo).toHaveBeenCalledTimes(1);
    expect(out.name).toBe('IMG_0412.jpg');
    expect(out.type).toBe('image/jpeg');
  });

  it('passes a real JPEG through untouched', async () => {
    const input = new File([JPEG_BYTES], 'ring.jpg', { type: 'image/jpeg' });

    const out = await normalizeImageFile(input);

    expect(out).toBe(input);
    expect(heicTo).not.toHaveBeenCalled();
  });
});

describe('isLikelyImageFile', () => {
  it('accepts standard image MIME types', () => {
    expect(isLikelyImageFile(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isLikelyImageFile(file('a.png', 'image/png'))).toBe(true);
    expect(isLikelyImageFile(file('a.webp', 'image/webp'))).toBe(true);
  });

  it('accepts .jfif even when the browser reports an empty MIME type', () => {
    expect(isLikelyImageFile(file('earring.jfif', ''))).toBe(true);
  });

  it('accepts .pjpeg and .jpe with empty MIME', () => {
    expect(isLikelyImageFile(file('a.pjpeg', ''))).toBe(true);
    expect(isLikelyImageFile(file('a.jpe', ''))).toBe(true);
  });

  it('accepts a known image extension with a non-image MIME', () => {
    // some systems report .jfif as application/octet-stream
    expect(isLikelyImageFile(file('a.jfif', 'application/octet-stream'))).toBe(true);
  });

  it('is case-insensitive on the extension', () => {
    expect(isLikelyImageFile(file('A.JFIF', ''))).toBe(true);
  });

  it('rejects non-image files', () => {
    expect(isLikelyImageFile(file('a.pdf', 'application/pdf'))).toBe(false);
    expect(isLikelyImageFile(file('a.txt', ''))).toBe(false);
    expect(isLikelyImageFile(file('noextension', ''))).toBe(false);
  });
});
