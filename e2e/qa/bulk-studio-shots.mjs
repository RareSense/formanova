// QA screenshots for /studio/bulk/:type at several widths. Run on the H100:
//   BASE=http://localhost:5199 OUT=./shots node e2e/qa/bulk-studio-shots.mjs
// Fakes a stored session and stubs every backend call (no real API traffic).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = process.env.OUT ?? './shots';
const ROUTE = process.env.ROUTE ?? '/studio/bulk/rings';
fs.mkdirSync(OUT, { recursive: true });

const imgDir = 'src/assets/jewelry';
const imgs = fs.readdirSync(imgDir).filter((f) => f.endsWith('.webp')).slice(0, 4)
  .map((f) => ({ name: f, mimeType: 'image/webp', buffer: fs.readFileSync(path.join(imgDir, f)) }));

const VIEWPORTS = [
  { name: '360', width: 360, height: 780, touch: true },
  { name: '390', width: 390, height: 844, touch: true },
  { name: '768', width: 768, height: 1024, touch: true },
  { name: '1440', width: 1440, height: 900, touch: false },
  { name: '2560', width: 2560, height: 1300, touch: false },
];

const browser = await chromium.launch({ args: ['--use-angle=gl-egl'] });
const report = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 768,
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('formanova_auth_token', 'qa-token');
    localStorage.setItem('formanova_auth_user', JSON.stringify({ id: 'qa', email: 'qa@example.com', full_name: 'QA' }));
  });
  await ctx.route((url) => !url.href.startsWith(BASE), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route(`${BASE}/api/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = async (tag) => {
    await page.screenshot({ path: `${OUT}/${vp.name}-${tag}.png`, fullPage: true });
    report.push({ vp: vp.name, tag, overflowPx: await overflow(), url: page.url() });
  };
  await shot('empty');

  await page.locator('input[type=file][multiple]').last().setInputFiles(imgs.slice(0, 3));
  await page.waitForTimeout(400);
  await shot('single');

  await page.getByRole('radio', { name: 'Multi-Angle' }).click();
  await page.waitForTimeout(300);
  await shot('multi');

  // give row 1 a second angle -> High Precision
  const slot = page.locator('li').first().locator('input[type=file]').first();
  await slot.setInputFiles([imgs[3]]);
  await page.waitForTimeout(300);
  await shot('multi-2angles');

  // button heights in header must match
  const heights = await page.locator('header button, header [role=combobox]').evaluateAll((els) =>
    els.filter((e) => e.closest('[role=radiogroup]') === null || e.getAttribute('role') === 'radio')
      .map((e) => Math.round(e.getBoundingClientRect().height)));
  report.push({ vp: vp.name, tag: 'header-heights', heights: [...new Set(heights)] });
  if (errors.length) report.push({ vp: vp.name, tag: 'errors', errors });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
