import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExampleImage, revealElement } from './example-image';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const reply = (ok: boolean, status: number, type: string) =>
  vi.fn(async () => ({ ok, status, blob: async () => new Blob(['x'], { type }) })) as never;

describe('loadExampleImage', () => {
  it('returns the picture as a File with its own type', async () => {
    globalThis.fetch = reply(true, 200, 'image/webp');
    const file = await loadExampleImage('/assets/ladybug.webp', 'ladybug.webp');
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('ladybug.webp');
    expect(file.type).toBe('image/webp');
  });

  it('falls back to webp when the server sends no type', async () => {
    globalThis.fetch = reply(true, 200, '');
    expect((await loadExampleImage('/a.webp', 'a.webp')).type).toBe('image/webp');
  });

  it('fails on a missing picture instead of adding a broken one', async () => {
    globalThis.fetch = reply(false, 404, 'image/webp');
    await expect(loadExampleImage('/gone.webp', 'gone.webp')).rejects.toThrow(/404/);
  });

  it('fails when the reply is a page, not a picture', async () => {
    globalThis.fetch = reply(true, 200, 'text/html');
    await expect(loadExampleImage('/a.webp', 'a.webp')).rejects.toThrow(/not an image/);
  });
});

describe('revealElement', () => {
  const box = (top: number, bottom: number) => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top } as DOMRect);
    el.scrollIntoView = vi.fn();
    return el;
  };

  it('scrolls to the canvas when it is above the screen (phones)', () => {
    window.innerHeight = 800;
    const el = box(-900, -400);
    revealElement(el);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it('leaves the page alone when the canvas is in view', () => {
    window.innerHeight = 800;
    const el = box(100, 740);
    revealElement(el);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });
});
