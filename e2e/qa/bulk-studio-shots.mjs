// QA screenshots for /studio/bulk/:type at several widths (run on a server, not the PC):
//   BASE=http://localhost:5199 OUT=./shots node e2e/qa/bulk-studio-shots.mjs
// Fakes a stored session and stubs every backend call (no real API traffic).
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = process.env.OUT ?? './shots';
const ROUTE = process.env.ROUTE ?? '/studio/bulk/rings';
const ONLY = process.env.ONLY?.split(',');
fs.mkdirSync(OUT, { recursive: true });

const imgDir = 'src/assets/jewelry';
const imgFiles = fs.readdirSync(imgDir).filter((f) => f.endsWith('.webp')).slice(0, 5);
const imgs = imgFiles.map((f) => ({ name: f, mimeType: 'image/webp', buffer: fs.readFileSync(path.join(imgDir, f)) }));

// Past Jewelry: one 2-angle set + three singles, thumbnails served by vite.
const t = (i) => `2026-11-0${i + 1}T00:00:00Z`;
const pastAssets = imgFiles.slice(0, 5).map((f, i) => ({
  id: `asset-${i}`, asset_type: 'jewelry_photo', created_at: t(i),
  thumbnail_url: `${BASE}/src/assets/jewelry/${f}`, name: `Piece ${i + 1}`,
  set_ids: i < 2 ? ['set-a'] : null, input_group_id: i < 2 ? 'set-a' : null,
}));

// Preset library: two categories of models/scenes using the same local images.
const presetCats = (key) => ['Plain', 'Editorial'].map((label, c) => ({
  id: label.toLowerCase(), label,
  [key]: imgFiles.map((f, i) => ({ id: `${label}-${i}`, label: `${label} ${i + 1}`, url: `${BASE}/src/assets/jewelry/${f}` })),
}));

const VIEWPORTS = [
  { name: '360', width: 360, height: 780, touch: true },
  { name: '390', width: 390, height: 844, touch: true },
  { name: '768', width: 768, height: 1024, touch: true },
  { name: '1440', width: 1440, height: 900, touch: false },
  { name: '2560', width: 2560, height: 1300, touch: false },
].filter((v) => !ONLY || ONLY.includes(v.name));

const BROWSER = process.env.BROWSER ?? 'chromium';
const browser = await { chromium, firefox, webkit }[BROWSER].launch();
const report = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, ...(BROWSER === 'firefox' ? {} : { isMobile: vp.touch && vp.width < 768 }),
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('formanova_auth_token', 'qa-token');
    localStorage.setItem('formanova_auth_user', JSON.stringify({ id: 'qa', email: 'qa@example.com', full_name: 'QA' }));
    localStorage.setItem('formanova_onboarding_qa', 'true');
  });
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route((url) => (!url.href.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) || url.pathname.startsWith('/api/') || url.pathname.endsWith('/assets'), (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/assets')) {
      const jewelry = u.searchParams.get('asset_type') === 'jewelry_photo';
      return r.fulfill(json({ items: jewelry ? pastAssets : [], total: jewelry ? pastAssets.length : 0, page: 0, page_size: 60 }));
    }
    if (u.pathname.endsWith('/api/models')) return r.fulfill(json({ categories: presetCats('models') }));
    if (u.pathname.endsWith('/api/inspirations')) return r.fulfill(json({ categories: presetCats('inspirations') }));
    return r.fulfill(json({}));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = async (tag, opts = {}) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${BROWSER}-${vp.name}-${tag}.png`, fullPage: !opts.viewportOnly });
    report.push({ b: BROWSER, vp: vp.name, tag, overflowPx: await overflow(), url: page.url().replace(BASE, '') });
  };
  const step = async (tag, fn) => {
    try { await fn(); } catch (e) { report.push({ vp: vp.name, tag, failed: String(e).split('\n')[0] }); }
  };

  await shot('01-empty');

  await step('drawer-upload', async () => {
    await page.getByRole('button', { name: 'Add Jewelry' }).first().click();
    await page.locator('[role=dialog] input[type=file]').setInputFiles(imgs.slice(0, 4));
    await shot('02-drawer-staged', { viewportOnly: true });
    // tap-to-merge pieces 1 and 2
    await page.getByRole('checkbox', { name: 'Select piece 1' }).click();
    await page.getByRole('checkbox', { name: 'Select piece 2' }).click();
    await shot('03-drawer-selected', { viewportOnly: true });
    await page.getByRole('button', { name: /^Merge 2$/ }).click();
    await shot('04-drawer-merged', { viewportOnly: true });
    await page.getByRole('button', { name: /to Shot List$/ }).click();
  });
  await shot('05-list-single');

  await step('multi', async () => {
    await page.getByRole('radio', { name: 'Multi-Angle' }).click();
    await shot('06-list-multi');
    await page.getByRole('checkbox', { name: 'Select piece 2' }).click();
    await page.getByRole('checkbox', { name: 'Select piece 3' }).click();
    await shot('07-list-selected');
  });

  await step('pairing', async () => {
    await page.getByRole('button', { name: 'Clear selection' }).first().click();
    await page.getByRole('button', { name: 'Choose model' }).first().click();
    await shot('10-assign-drawer', { viewportOnly: true });
    await page.getByRole('checkbox', { name: 'Plain 1' }).click();
    await page.getByRole('checkbox', { name: 'Plain 2' }).click();
    await shot('11-assign-picked', { viewportOnly: true });
    await page.getByRole('button', { name: /^Save 2 Models$/ }).click();
    await shot('12-row-paired');
    await page.getByRole('button', { name: /^Apply to all/ }).click();
    await shot('13-applied-all');
    await page.getByRole('checkbox', { name: 'Select piece 2' }).click();
    await page.getByRole('checkbox', { name: 'Select piece 3' }).click();
    await shot('14-selection-bar', { viewportOnly: true });
    await page.getByRole('button', { name: /^Assign Model to 2$/ }).click();
    await page.getByRole('tab', { name: 'Editorial' }).click();
    await page.getByRole('checkbox', { name: 'Editorial 3' }).click();
    await page.getByRole('button', { name: /^Assign \d+ to 2 Pieces$/ }).click();
    await shot('15-bulk-assigned');
    await page.getByRole('button', { name: /^Swap / }).first().click();
    await page.getByRole('tab', { name: 'Editorial' }).click();
    await page.getByRole('button', { name: 'Editorial 4' }).click();
    await shot('16-swapped');
    await page.getByRole('radio', { name: 'Product Shot' }).click();
    await shot('17-product-mode');
  });

  await step('drawer-past', async () => {
    await page.getByRole('button', { name: 'Add Jewelry' }).first().click();
    await page.getByRole('tab', { name: 'Past Jewelry' }).click();
    await page.getByRole('checkbox', { name: 'Piece 1' }).click();
    await shot('08-drawer-past', { viewportOnly: true });
    await page.getByRole('button', { name: /Selected to Shot List$/ }).click();
  });
  await shot('09-list-with-past');

  const heights = await page.locator('header button, header [role=combobox]').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)));
  report.push({ vp: vp.name, tag: 'header-heights', heights: [...new Set(heights)] });
  if (errors.length) report.push({ vp: vp.name, tag: 'errors', errors });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
