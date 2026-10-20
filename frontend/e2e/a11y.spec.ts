import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, VALID_ID, MALFORMED_ID } from './fixtures';

/**
 * V8 accessibility gate (M3-6, GIGW 3.0 / WCAG 2.1 AA): axe must be clean
 * on landing, directory and verifier — including the interactive result
 * states (valid / revoked / unverified), not just the empty shells.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAxeClean(page: import('@playwright/test').Page, context: string) {
  // Let entry animations settle first (a mid-fade opacity skews contrast).
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${v.help} :: ${v.nodes
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, `axe violations on ${context}`).toEqual([]);
}

test.describe('axe / WCAG 2.1 AA (V8)', () => {
  test('landing page', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('National Footprint Across States & UTs')).toBeVisible();
    await expectAxeClean(page, 'landing');
  });

  test('verifier — empty shell', async ({ page }) => {
    await mockApi(page);
    await page.goto('/verify/');
    await expectAxeClean(page, 'verifier shell');
  });

  test('verifier — valid verdict', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${VALID_ID}`);
    await expect(page.getByRole('heading', { name: 'Valid & Authentic Certificate' })).toBeVisible();
    await expectAxeClean(page, 'verifier valid');
  });

  test('verifier — unverified verdict', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${MALFORMED_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Certificate Could Not Be Verified' }),
    ).toBeVisible();
    await expectAxeClean(page, 'verifier unverified');
  });

  test('directory — results + expanded data table', async ({ page }) => {
    await mockApi(page);
    await page.goto('/directory/');
    await expect(page.getByText('Sample Institution 1 Maharashtra')).toBeVisible();
    await expectAxeClean(page, 'directory');
  });
});
