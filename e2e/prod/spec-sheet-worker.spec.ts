/**
 * The production build's pdf.js worker must load from a server that does not
 * know `.mjs` (nginx's stock mime.types sends it as application/octet-stream,
 * and browsers refuse a module worker that is not served as JavaScript). With
 * the spec sheet behind a cross-origin signed link, as on Azure, page 1 must
 * still render in the Tech spec section.
 */
import { expect, test } from '@playwright/test';

import { mockCadApi, WORKFLOW_ID } from '../fixtures';

test('page 1 of the spec sheet renders from the production build', async ({ page }) => {
  const workerTypes: string[] = [];
  page.on('response', (response) => {
    if (/pdf\.worker/.test(response.url())) workerTypes.push(response.headers()['content-type'] ?? '');
  });
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await mockCadApi(page, { specSheetHost: 'azure' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/image-to-cad?workflow_id=${WORKFLOW_ID}`);

  await expect(page.getByRole('img', { name: 'Spec sheet, page 1' })).toBeVisible();
  await expect(page.getByTestId('spec-sheet-fallback')).toHaveCount(0);
  expect(workerTypes.length).toBeGreaterThan(0);
  for (const type of workerTypes) expect(type).toMatch(/javascript/);
  expect(errors.filter((e) => /TechSpec|worker|MIME/i.test(e))).toEqual([]);
});
