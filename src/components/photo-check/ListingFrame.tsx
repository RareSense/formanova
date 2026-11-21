import type { ReactNode } from 'react';

/** Tallest the frame gets, so the status strip under it stays on screen. */
const MAX_H = 'min(52vh, 480px)';

/**
 * The photo as the marketplace will show it: a white tile in the
 * marketplace's shape (a square for Amazon, 4:3 for Etsy), the photo fitted
 * inside. Before a fix, empty space around a small piece shows the problem at
 * a glance. The tile's size depends only on the shape and the screen, never on
 * the photo, so nothing on the page moves between states.
 */
export function ListingFrame({ ratio, src, alt, children }: { ratio: number; src?: string; alt?: string; children?: ReactNode }) {
  return (
    <div
      className="relative mx-auto w-full bg-white shadow-sm ring-1 ring-black/5"
      style={{ aspectRatio: `${ratio}`, maxWidth: `calc(${MAX_H} * ${ratio})` }}
    >
      {src ? <img src={src} alt={alt ?? ''} className="absolute inset-0 h-full w-full object-contain" /> : children}
    </div>
  );
}
