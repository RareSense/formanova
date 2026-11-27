// M4 QA: generate bar, dock stacking, background batch, results queue, post-actions.
//   BASE=http://localhost:5199 OUT=./shots BROWSER=chromium|webkit ONLY=360,768,1440 node e2e/qa/bulk-studio-m4.mjs
// Fakes a session and stubs every backend call: uploads, run start, status
// (2 "running" polls then completed), result, credits. No real API traffic.
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = process.env.OUT ?? './shots-m4';
const BROWSER = process.env.BROWSER ?? 'chromium';
const ONLY = (process.env.ONLY ?? '360,768,1440').split(',');
fs.mkdirSync(OUT, { recursive: true });

const imgDir = 'src/assets/jewelry';
const imgFiles = fs.readdirSync(imgDir).filter((f) => f.endsWith('.webp')).slice(0, 5);
const imgs = imgFiles.map((f) => ({ name: f, mimeType: 'image/webp', buffer: fs.readFileSync(path.join(imgDir, f)) }));
const asset = (i) => `${BASE}/src/assets/jewelry/${imgFiles[i % imgFiles.length]}`;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const presetCats = (key) => ['Plain', 'Editorial'].map((label) => ({
  id: label.toLowerCase(), label,
  [key]: imgFiles.map((f, i) => ({ id: `${label}-${i}`, label: `${label} ${i + 1}`, url: asset(i) })),
}));
const VIEWPORTS = [
  { name: '360', width: 360, height: 780, touch: true },
  { name: '768', width: 768, height: 1024, touch: true },
  { name: '1440', width: 1440, height: 900, touch: false },
].filter((v) => ONLY.includes(v.name));

const browser = await { chromium, webkit }[BROWSER].launch();
const report = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 768 });
  await ctx.addInitScript(() => {
    localStorage.setItem('formanova_auth_token', 'qa-token');
    localStorage.setItem('formanova_auth_user', JSON.stringify({ id: 'qa', email: 'qa@example.com', full_name: 'QA' }));
    localStorage.setItem('formanova_onboarding_qa', 'true');
  });
  let wf = 0; const polls = {};
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route((u) => (!/^(blob|data):/.test(u.protocol) && !u.href.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) || u.pathname.startsWith('/api/') || /\/(assets|upload|upload\/bulk)$/.test(u.pathname), (r) => {
    const u = new URL(r.request().url()); const p = u.pathname;
    if (p.endsWith('/upload/bulk')) return r.fulfill(json({ jewelry: Array.from({ length: (r.request().postDataBuffer()?.toString('latin1').match(/name="jewelry_files"/g) ?? []).length }, (_, i) => ({ asset_id: uuid(20 + i), uri: `azure://bulk-${i}`, sha256: 'x' })), model: [], background: [], input_group_id: 'g1' }));
    if (p.endsWith('/upload')) return r.fulfill(json({ uri: 'azure://one', sas_url: asset(0), https_url: '', asset_id: uuid(10) }));
    if (p.endsWith('/assets')) return r.fulfill(json({ items: [], total: 0, page: 0, page_size: 60 }));
    if (p.endsWith('/api/models')) return r.fulfill(json({ categories: presetCats('models') }));
    if (p.endsWith('/api/inspirations')) return r.fulfill(json({ categories: presetCats('inspirations') }));
    if (p.endsWith('/credits/estimate')) return r.fulfill(json({ projected_max_hold: 8, estimated_credits: 8 }));
    if (p.endsWith('/credits/balance/me')) return r.fulfill(json({ balance: 500, available: 500 }));
    if (p.includes('/run/')) { wf += 1; return r.fulfill(json({ workflow_id: `wf-${wf}`, status_url: '', result_url: '' })); }
    const st = p.match(/\/api\/status\/(wf-\d+)/);
    if (st) { polls[st[1]] = (polls[st[1]] ?? 0) + 1; return r.fulfill(json(polls[st[1]] > 2 ? { state: 'completed' } : { state: 'running', progress: { state: 'running', completed_nodes: 1, total_nodes: 3 } })); }
    const rs = p.match(/\/api\/result\/wf-(\d+)/);
    if (rs) return r.fulfill(json({ output: [{ image_url: asset(Number(rs[1])) }], output_asset_id: uuid(100 + Number(rs[1])) }));
    return r.fulfill(json({}));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/studio/bulk/rings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = async (tag, full = false) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${BROWSER}-${vp.name}-${tag}.png`, fullPage: full });
    report.push({ b: BROWSER, vp: vp.name, tag, overflowPx: await overflow() });
  };
  const step = async (tag, fn) => { try { await fn(); } catch (e) { report.push({ b: BROWSER, vp: vp.name, tag, failed: String(e).split('\n')[0] }); await page.screenshot({ path: `${OUT}/${BROWSER}-${vp.name}-FAIL-${tag}.png` }).catch(() => {}); } };

  await shot('01-empty');
  await step('setup', async () => {
    await page.getByRole('button', { name: 'Add Jewelry' }).first().click();
    await page.locator('[role=dialog] input[type=file]').setInputFiles(imgs.slice(0, 4));
    await page.getByRole('checkbox', { name: 'Select piece 2' }).click();
    await page.getByRole('checkbox', { name: 'Select piece 3' }).click();
    await page.getByRole('button', { name: /^Merge 2$/ }).click();
    await page.getByRole('button', { name: /to Shot List$/ }).click();
    await page.getByRole('button', { name: 'Choose model' }).first().click();
    await page.getByRole('checkbox', { name: 'Plain 1' }).click();
    await page.getByRole('checkbox', { name: 'Plain 2' }).click();
    await page.getByRole('button', { name: /^Save 2 Models$/ }).click();
    await page.getByRole('button', { name: 'Choose model' }).first().click();
    await page.getByRole('checkbox', { name: 'Plain 3' }).click();
    await page.getByRole('button', { name: /^Save 1 Model$/ }).click();
  });
  await shot('02-ready');

  await step('dock', async () => {
    await page.getByRole('checkbox', { name: 'Select piece 1' }).click();
    await page.getByRole('checkbox', { name: 'Select piece 3' }).click();
    await shot('03-dock-stacked');
    const sel = await page.getByRole('toolbar', { name: 'Selected pieces' }).boundingBox();
    const gen = await page.getByRole('button', { name: /^Generate/ }).boundingBox();
    report.push({ b: BROWSER, vp: vp.name, tag: 'dock-gap', selBottom: Math.round(sel.y + sel.height), genTop: Math.round(gen.y), ok: sel.y + sel.height <= gen.y });
    await page.getByRole('button', { name: 'Clear selection' }).last().click();
  });

  await step('generate', async () => {
    const cta = await page.getByRole('button', { name: /^Generate/ }).innerText();
    report.push({ b: BROWSER, vp: vp.name, tag: 'cta', cta });
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.waitForTimeout(700);
    if (vp.width < 1280) await page.getByRole('button', { name: /^Results/ }).click();
    await shot('04-rendering');
    // the list stays editable while rendering
    if (vp.width < 1280) await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Select piece 2' }).click();
    report.push({ b: BROWSER, vp: vp.name, tag: 'editable-while-rendering', selected: await page.getByRole('toolbar', { name: 'Selected pieces' }).isVisible() });
    await page.getByRole('button', { name: 'Clear selection' }).last().click();
  });

  await step('completed', async () => {
    if (vp.width < 1280) await page.getByRole('button', { name: /^Results/ }).click();
    await page.getByText(/^3 of 3 ready$/i).filter({ visible: true }).first().waitFor({ timeout: 60000 });
    await shot('05-completed');
  });

  await step('post-actions', async () => {
    await page.getByRole('button', { name: 'Fix with AI' }).first().click();
    await shot('06-fix-ai');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Fix with Human' }).first().click();
    await shot('07-fix-human');
  });

  if (errors.length) report.push({ b: BROWSER, vp: vp.name, tag: 'errors', errors });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
