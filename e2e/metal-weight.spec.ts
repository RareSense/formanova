/**
 * The metal weight and tech spec sections must fit every screen: no
 * horizontal page scroll, no text running out of (or cut off inside) its box,
 * no section drawn over another, the selected row's tint inside the table.
 *
 * The CAD page runs for real against a mocked API (fixtures.ts): one ring
 * version with a measured volume, a 28 g ±5% target and a two-page spec sheet.
 * Screenshots go to SCREENSHOT_DIR when it is set.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

import { mockCadApi, WORKFLOW_ID, type MockOptions } from './fixtures';

const SHOTS = process.env.SCREENSHOT_DIR;
const LONGEST = '18K White Gold (palladium)';

type Mode = 'phone' | 'tablet' | 'desktop';
const modeFor = (width: number): Mode => (width >= 1280 ? 'desktop' : width >= 768 ? 'tablet' : 'phone');

async function openCad(page: Page, width: number, height: number, opts: MockOptions & { dark?: boolean } = {}) {
  await mockCadApi(page, opts);
  await page.addInitScript((dark) => { localStorage.setItem('formanova-theme', dark ? 'dark' : 'light'); }, Boolean(opts.dark));
  await page.setViewportSize({ width, height });
  await page.goto(`/image-to-cad?workflow_id=${WORKFLOW_ID}`);
  const mode = modeFor(width);
  if (mode === 'tablet') await page.getByTitle('Show left panel').click();
  if (mode === 'phone') await page.getByRole('tab', { name: 'Versions' }).click();
  const weight = page.getByRole('region', { name: 'Metal weight' });
  await expect(weight.locator('[data-weight-table]')).toBeVisible();
  if (opts.specSheet !== 'none' && opts.specSheet !== 'broken') {
    await expect(page.getByRole('img', { name: 'Spec sheet, page 1' })).toBeVisible();
  }
  return weight;
}

async function expandLongest(page: Page) {
  await page.getByRole('button', { name: 'More metals' }).click();
  await page.getByRole('radio', { name: LONGEST }).check();
  await expect(page.getByRole('radio', { name: LONGEST })).toBeChecked();
}

/**
 * Drags the left panel's resize handle past its min or max, where the panel
 * clamps. Not to 0: the panel is collapsible and snaps shut below half its min.
 */
async function dragLeftPanel(page: Page, to: 'min' | 'max') {
  const handle = page.locator('[data-panel-resize-handle-id]').first();
  const box = await handle.boundingBox();
  if (!box) throw new Error('no resize handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to === 'min' ? 200 : 1400, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  const width = await page.locator('#left-panel').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  // At 1440 px: min is 300 px (20.83 %), max is 35 % (504 px).
  expect(width).toBeGreaterThanOrEqual(to === 'min' ? 299 : 503);
  expect(width).toBeLessThanOrEqual(to === 'min' ? 301 : 505);
}

interface LayoutReport { problems: string[]; sectionWidth: number }

/** Every layout rule, checked in the page on the rendered boxes. */
async function layoutProblems(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.scrollingElement ?? document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls sideways: ${doc.scrollWidth} > ${window.innerWidth}`);

    const sections = ['Metal weight', 'Tech spec']
      .map((name) => document.querySelector<HTMLElement>(`section[aria-label="${name}"]`))
      .filter((s): s is HTMLElement => s !== null);
    const label = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`;

    for (const section of sections) {
      const box = section.getBoundingClientRect();
      // Nothing scrolls sideways inside the section, and nothing is cut off with an ellipsis.
      for (const el of [section, ...section.querySelectorAll<HTMLElement>('*')]) {
        // Screen-reader-only text is clipped to 1 px on purpose; popovers float outside.
        if (el.closest('[data-radix-popper-content-wrapper], .sr-only')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'inline' || el.clientWidth === 0) continue;
        if (el.scrollWidth > el.clientWidth + 1 && el.tagName !== 'IMG') problems.push(`${label(el)} overflows its box (${el.scrollWidth} > ${el.clientWidth})`);
      }
      // Every piece of text sits inside the section and inside its own cell or button.
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        if (text.width === 0) continue;
        const holder = parent.closest('td, th, button, p, h3, a') ?? section;
        const hb = holder.getBoundingClientRect();
        if (text.left < box.left - 1 || text.right > box.right + 1) problems.push(`text "${node.textContent.trim().slice(0, 30)}" leaves the section`);
        if (text.left < hb.left - 1 || text.right > hb.right + 1) problems.push(`text "${node.textContent.trim().slice(0, 30)}" leaves its ${holder.tagName.toLowerCase()}`);
      }
    }

    // A metal name may wrap, but only between words: never "Yello / w" or "(palla / dium)".
    for (const cell of document.querySelectorAll('[data-weight-table] tbody td:nth-child(2)')) {
      const node = [...cell.querySelectorAll('span')].map((s) => s.firstChild).find((n) => n?.nodeType === Node.TEXT_NODE);
      const text = node?.textContent ?? '';
      let top: number | null = null;
      for (let i = 0; node && i < text.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect || text[i] === ' ') continue;
        if (top !== null && rect.top > top + 2 && text[i - 1] !== ' ') problems.push(`"${text}" breaks inside a word at "${text.slice(0, i)}|"`);
        top = rect.top;
      }
    }

    // The selected row's tint and ring stay inside the table's border.
    const table = document.querySelector('[data-weight-table]');
    const selected = document.querySelector('[data-weight-table] tr[data-state="selected"]');
    if (table && selected) {
      const t = table.getBoundingClientRect();
      const r = selected.getBoundingClientRect();
      if (r.left < t.left - 0.5 || r.right > t.right + 0.5) problems.push('selected row spills out of the table');
    } else problems.push('no selected row');

    // The left panel's blocks (versions, weight, tech spec, start over) never overlap.
    const weight = sections[0];
    const column = weight?.parentElement;
    if (column) {
      const blocks = [...column.children].filter((el) => el.getBoundingClientRect().height > 0);
      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          const a = blocks[i].getBoundingClientRect();
          const b = blocks[j].getBoundingClientRect();
          const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const sideBySide = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          if (overlap > 1 && sideBySide > 1) problems.push(`${label(blocks[i])} overlaps ${label(blocks[j])}`);
        }
      }
    }
    return { problems, sectionWidth: Math.round(weight?.getBoundingClientRect().width ?? 0) };
  });
}

async function check(page: Page, shot: string) {
  const report = await layoutProblems(page);
  if (SHOTS) {
    await page.getByRole('region', { name: 'Metal weight' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, `${shot}.png`) });
  }
  expect(report.problems, `${shot} (section ${report.sectionWidth}px)`).toEqual([]);
  expect(report.sectionWidth).toBeGreaterThan(200);
}

const VIEWPORTS: Array<[number, number]> = [
  [320, 640], [375, 812], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
];

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width}x${height}`, () => {
    test('default', async ({ page }) => {
      await openCad(page, width, height);
      await check(page, `final-${modeFor(width)}-${width}`);
    });

    test('longest name, More metals open', async ({ page }) => {
      await openCad(page, width, height);
      await expandLongest(page);
      await check(page, `final-${modeFor(width)}-${width}-long-expanded`);
    });
  });
}

for (const to of ['min', 'max'] as const) {
  test(`1440 left panel at its ${to} width, longest name expanded`, async ({ page }) => {
    await openCad(page, 1440, 900);
    await dragLeftPanel(page, to);
    await expandLongest(page);
    await check(page, `final-desktop-1440-panel-${to}-long-expanded`);
  });
}

for (const width of [390, 1440]) {
  test(`${width} dark mode, longest name expanded`, async ({ page }) => {
    await openCad(page, width, width < 768 ? 844 : 900, { dark: true });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expandLongest(page);
    await check(page, `final-dark-${modeFor(width)}-${width}`);
  });
}

test('casting-check flags show as plain words and the weight stays', async ({ page }) => {
  const weight = await openCad(page, 1440, 900, { volumeFlags: ['thin_walls', 'touching_edges', 'odd_new_flag'] });
  await expect(weight.getByText('Estimate. Casting check flagged: thin walls, touching edges, odd new flag.')).toBeVisible();
  await expect(weight.getByRole('row', { name: /14K Yellow Gold/ })).toContainText('27.98');
  await check(page, 'final-desktop-1440-flags');
});

test('a broken spec sheet shows the fallback card, still laid out', async ({ page }) => {
  await openCad(page, 1440, 900, { specSheet: 'broken' });
  await expect(page.getByTestId('spec-sheet-fallback')).toBeVisible();
  await check(page, 'final-desktop-1440-spec-fallback');
});

test('picking a row sets All metal parts, and the other way round', async ({ page }) => {
  await openCad(page, 1440, 900);
  await page.getByRole('row', { name: /Sterling Silver 925/ }).click();
  await expect(page.getByRole('combobox', { name: 'Apply one metal to all metal parts' })).toContainText('Silver');
  await page.getByRole('combobox', { name: 'Apply one metal to all metal parts' }).click();
  await page.getByRole('option', { name: /Rose Gold/ }).first().click();
  await expect(page.getByRole('radio', { name: '14K Rose Gold' })).toBeChecked();
});

test('arrow keys move the metal choice and the focus ring shows', async ({ page }) => {
  await openCad(page, 1440, 900);
  await page.getByRole('radio', { name: '14K Yellow Gold' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: '18K Yellow Gold' })).toBeChecked();
  const ring = await page.getByRole('row', { name: /18K Yellow Gold/ }).evaluate((row) => getComputedStyle(row).outlineStyle);
  expect(ring).toBe('solid');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'final-desktop-1440-focus-ring.png') });
});

test('the spec sheet preview opens on page 1 and pages on', async ({ page }) => {
  await openCad(page, 1440, 900);
  await page.getByRole('button', { name: 'Open spec sheet preview' }).click();
  await expect(page.getByRole('img', { name: 'Spec sheet, page 1' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'final-desktop-1440-spec-dialog.png') });
});

test('Download saves <model>_v<version>_metal_weight.csv', async ({ page }) => {
  await openCad(page, 1440, 900);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download weight table (CSV)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Sample_signet_ring_v1_metal_weight.csv');
});
