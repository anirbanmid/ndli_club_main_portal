import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Branch 3 — IIT KGP Admin Module', () => {
  test('admin login gate renders with email/password/captcha fields', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /3\. IIT KGP Admin Module/ }).click();

    // Login door renders
    await expect(page.getByRole('heading', { name: 'NDLI Club Management System' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/User ID|Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByLabel(/Security Verification|Captcha/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Unlock System Access/ })).toBeVisible();
  });

  test('admin login rejects invalid credentials', async ({ page }) => {
    // Mock the password login API to return 401
    page.route('**/api/v1/accounts/password/login/', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      }),
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /3\. IIT KGP Admin Module/ }).click();

    // Fill in login form
    await page.getByLabel(/User ID|Email/i).fill('admin@example.com');
    await page.getByLabel(/Password/i).fill('wrongpassword');
    await page.getByLabel(/Security Verification|Captcha/i).fill('DEV_TEST');

    await page.getByRole('button', { name: /Unlock System Access/ }).click();

    // Error alert banner should appear
    await expect(page.locator('#lock-alert')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#lock-alert')).toContainText(/Authentication|credentials/i);
  });
});
