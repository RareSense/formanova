import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINE_SHEET_PAGE, PHOTO_PAGES, STATIC_PAGES, TOOLS_PAGE, renderStaticHtml } from './static-pages';

// The real template, so a change to index.html that breaks the copy fails here first.
const indexHtml = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

describe('renderStaticHtml', () => {
  const html = renderStaticHtml(indexHtml, LINE_SHEET_PAGE, 'https://formanova.ai');

  it('gives the page its own title, description and canonical', () => {
    expect(html).toContain('<title>Free Jewelry Line Sheet Generator (PDF) | FormaNova</title>');
    expect(html).toContain(`<meta name="description" content="${LINE_SHEET_PAGE.description}" />`);
    expect(html).toContain('<link rel="canonical" href="https://formanova.ai/tools/jewelry-line-sheet-generator" />');
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:url" content="https://formanova.ai/tools/jewelry-line-sheet-generator" />');
  });

  it('puts the readable text inside #root, in place of the home page skeleton', () => {
    const root = html.slice(html.indexOf('<div id="root">'));
    expect(root).toContain('<h1>Jewelry Line Sheet Generator</h1>');
    expect(root).toContain('<h2>How to make a jewelry line sheet</h2>');
    expect(root).toContain('<h3>What is a jewelry line sheet?</h3>');
    expect(html).not.toContain('pre-react-loader');
  });

  it('keeps the app script, so React still loads and takes over', () => {
    expect(html).toMatch(/<script type="module"[^>]*src=/);
  });

  it('escapes text so it can never break the HTML', () => {
    const page = { ...TOOLS_PAGE, h1: 'Rings & <Things>' };
    expect(renderStaticHtml(indexHtml, page, 'https://formanova.ai')).toContain('<h1>Rings &amp; &lt;Things&gt;</h1>');
  });

  it('fails loudly if index.html loses a tag it relies on', () => {
    expect(() => renderStaticHtml(indexHtml.replace(/<title>[^<]*<\/title>/, ''), TOOLS_PAGE, 'https://formanova.ai')).toThrow(/missing/);
  });

  it('covers the tools home and each tool page', () => {
    expect(STATIC_PAGES.map((p) => p.path)).toEqual(['/tools', '/tools/jewelry-line-sheet-generator', '/tools/amazon-image-checker', '/tools/etsy-image-resizer', '/tools/shopify-image-resizer', '/tools/jewelry-cad-tech-sheet']);
  });
});

describe('photo tool pages', () => {
  it('gives each marketplace its own title, heading, intro and questions, not a copy', () => {
    const pages = Object.values(PHOTO_PAGES);
    for (const key of ['title', 'h1', 'intro', 'description'] as const) {
      expect(new Set(pages.map((p) => p[key])).size).toBe(3);
    }
    expect(new Set(pages.map((p) => p.faqs[0].q)).size).toBe(3);
  });

  it('keeps titles in search length and mentions jewelry', () => {
    for (const p of Object.values(PHOTO_PAGES)) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(160);
      expect(p.title.toLowerCase()).toContain('jewelry');
    }
  });
});
