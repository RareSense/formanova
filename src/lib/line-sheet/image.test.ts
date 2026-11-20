import { describe, expect, it } from 'vitest';
import { ImageError, MAX_FILE_BYTES, describeFailures, imageKind, loadImage } from './image';

const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('imageKind', () => {
  it('opens the common web formats directly, AVIF included', () => {
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['a.avif', 'image/avif'], ['a.gif', 'image/gif'], ['a.bmp', 'image/bmp']]) {
      expect(imageKind(file(name, type))).toBe('browser');
    }
  });

  it('sends iPhone photos to the HEIC converter, even when the browser gives no type', () => {
    expect(imageKind(file('IMG_0042.HEIC', ''))).toBe('heic');
    expect(imageKind(file('a.heif', 'image/heif'))).toBe('heic');
  });

  it('treats SVG logos separately', () => {
    expect(imageKind(file('logo.svg', 'image/svg+xml'))).toBe('svg');
  });

  it('refuses formats a browser cannot open', () => {
    expect(imageKind(file('scan.tiff', 'image/tiff'))).toBe('unsupported');
    expect(imageKind(file('DSC_1.NEF', ''))).toBe('unsupported');
    expect(imageKind(file('notes.pdf', 'application/pdf'))).toBe('unsupported');
  });
});

describe('loadImage', () => {
  it('explains, without decoding, when the type cannot be opened', async () => {
    await expect(loadImage(file('scan.tif', 'image/tiff'))).rejects.toThrow(/export it as JPG/);
  });

  it('explains when a photo is over 50 MB', async () => {
    const err = await loadImage(file('big.jpg', 'image/jpeg', MAX_FILE_BYTES + 1)).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.message).toMatch(/larger than 50 MB/);
  });
});

describe('describeFailures', () => {
  it('lists each skipped file with its reason', () => {
    expect(describeFailures([new ImageError('a.tif', 'Not supported.')])).toBe('a.tif: Not supported.');
  });
});
