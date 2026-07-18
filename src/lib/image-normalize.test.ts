import { describe, it, expect, vi } from 'vitest';

// heic2any touches Worker/canvas at import time, which jsdom doesn't provide.
// We only test the pure isLikelyImageFile helper, so stub the module out.
vi.mock('heic2any', () => ({ default: vi.fn() }));

import { isLikelyImageFile } from './image-normalize';

function file(name: string, type: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type });
}

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
