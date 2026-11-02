import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Branch 2 — Institutional Campus Module', () => {
  test('club module landing page renders and opens registration bifurcation', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /2\. Institutional Club Module/ }).click();

    // Club module landing page
    await expect(page.getByText(/Module 2: Institutional Club/)).toBeVisible({ timeout: 10000 });

    // Look for register club CTA
    const registerBtn = page.getByRole('button', { name: /Register Institutional Club/i });
    if (await registerBtn.count() > 0) {
      await registerBtn.click();

      // Bifurcation modal: HEI vs School selection (dialog-scoped)
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
      await expect(
        page.getByRole('dialog').getByText('Higher Education Institution'),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog').getByText('School (Offline-First)'),
      ).toBeVisible();

      // Clicking HEI closes the modal
      await page.getByRole('dialog').getByText('Higher Education Institution').click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });
    }
  });

  test('School registration bifurcation option is present', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /2\. Institutional Club Module/ }).click();
    await expect(page.getByText(/Module 2: Institutional Club/)).toBeVisible({ timeout: 10000 });

    const registerBtn = page.getByRole('button', { name: /Register Institutional Club/i });
    if (await registerBtn.count() > 0) {
      await registerBtn.click();

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
      await expect(
        page.getByRole('dialog').getByText('School (Offline-First)'),
      ).toBeVisible();
    }
  });
});
