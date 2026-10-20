import { test, expect } from '@playwright/test';
import {
  mockApi,
  VALID_ID,
  REVOKED_ID,
  UNKNOWN_ID,
  MALFORMED_ID,
  TELEMETRY,
} from './fixtures';

/**
 * M3 public pages E2E (V2/V4/V5/V8 surface):
 * verifier 3 states · anti-enumeration · deep-link + legacy routing ·
 * telemetry chart+table equivalence · directory search + pagination.
 */

test.describe('verifier (M3-3)', () => {
  test('deep link /verify/?id= auto-verifies a valid certificate', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${VALID_ID}`);

    await expect(
      page.getByRole('heading', { name: 'Valid & Authentic Certificate' }),
    ).toBeVisible();

    // Exactly the six disclosure fields — nothing else (M3-A4).
    for (const label of ['Recipient Name', 'Club', 'Institution', 'Event', 'Date', 'Status']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Ananya Sharma')).toBeVisible();
    await expect(page.getByText('NDLI Reading Club')).toBeVisible();
    await expect(page.getByText('Sample Engineering College Pune')).toBeVisible();
    await expect(page.getByText('National Reading Marathon 2026')).toBeVisible();
    // Dropped fields never appear on the public verifier.
    await expect(page.getByText(/Roll:/)).toHaveCount(0);
    await expect(page.getByText(/Performance Grade/)).toHaveCount(0);
  });

  test('focus moves to the result heading (WCAG) and result is announced', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${VALID_ID}`);
    const heading = page.getByRole('heading', { name: 'Valid & Authentic Certificate' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('[aria-live="polite"]')).toContainText('Valid & Authentic Certificate');
  });

  test('revoked certificate shows the revoked state with six fields', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${REVOKED_ID}`);

    await expect(page.getByRole('heading', { name: 'Certificate Revoked' })).toBeVisible();
    await expect(
      page.getByText('This certificate has been revoked by the issuing authority.'),
    ).toBeVisible();
    await expect(page.getByText('Ananya Sharma')).toBeVisible();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  });

  test('unknown id and malformed id produce ONE indistinguishable failure card', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/verify/?id=${UNKNOWN_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Certificate Could Not Be Verified' }),
    ).toBeVisible();
    const unknownCard = page.locator('[aria-live="polite"]').innerText();
    // No failure-mode wording is ever exposed (anti-enumeration, P0).
    expect(await unknownCard).not.toMatch(/not found/i);
    expect(await unknownCard).not.toMatch(/signature/i);
    expect(await unknownCard).not.toMatch(/invalid id/i);
    // The card shows NO disclosure fields.
    await expect(page.getByText('Recipient Name')).toHaveCount(0);

    await page.goto(`/verify/?id=${MALFORMED_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Certificate Could Not Be Verified' }),
    ).toBeVisible();
    // Same heading + same template body as the unknown-id card (only the
    // user's own typed input may differ).
    expect(await page.locator('[aria-live="polite"]').innerText()).toContain(
      'could not be verified',
    );
    await expect(page.getByText('Recipient Name')).toHaveCount(0);
  });

  test('legacy URL ?tab=verify&certId= still works', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/?tab=verify&certId=${VALID_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Valid & Authentic Certificate' }),
    ).toBeVisible();
  });

  test('manual search canonicalizes the URL to /verify/?id=', async ({ page }) => {
    await mockApi(page);
    await page.goto('/verify/');
    await page.getByLabel(/Enter Certificate Identification Number/).fill(VALID_ID);
    await page.getByRole('button', { name: 'Verify Authenticity' }).click();
    await expect(
      page.getByRole('heading', { name: 'Valid & Authentic Certificate' }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/verify/\\?id=${VALID_ID}$`));
  });

  test('sample chips trigger a verification', async ({ page }) => {
    await mockApi(page);
    await page.goto('/verify/');
    await page.getByRole('button', { name: VALID_ID }).click();
    await expect(
      page.getByRole('heading', { name: 'Valid & Authentic Certificate' }),
    ).toBeVisible();
  });
});

test.describe('telemetry (M3-1)', () => {
  test('landing renders live counters, chart and the accessible table (same payload)', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');

    // Summary counters from totals (scoped to their counter cards).
    await expect(page.getByText('National Footprint Across States & UTs')).toBeVisible();
    await expect(page.getByText('Active Institutions', { exact: true }).locator('..')).toContainText('5');
    await expect(page.getByText('Enrolled Members', { exact: true }).locator('..')).toContainText('180');

    // Accessible table alternative: every state/UT, zeros included.
    const details = page.locator('details', { hasText: 'View Full Data Table' });
    await details.locator('summary').click();
    const table = details.locator('table');
    for (const row of TELEMETRY.states) {
      await expect(table.getByRole('rowheader', { name: row.name })).toBeVisible();
    }
    await expect(
      table.getByRole('row', { name: 'Andaman & Nicobar Islands' }),
    ).toContainText('0');
    // Table equivalence: totals row present.
    await expect(table.getByRole('rowheader', { name: 'Total' })).toBeVisible();
    await expect(table).toContainText('180');
  });
});

test.describe('directory (M3-2)', () => {
  test('loads the directory and paginates', async ({ page }) => {
    await mockApi(page);
    await page.goto('/directory/');
    await expect(
      page.getByRole('heading', { name: 'Search the Public Institution Directory' }),
    ).toBeVisible();
    await expect(page.getByText('Sample Institution 1 Maharashtra')).toBeVisible();
    await expect(page.getByText(/Showing 1–20 of 21 institutions/)).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Sample Institution West Bengal')).toBeVisible();
    await expect(page.getByText(/Page 2 of 2/)).toBeVisible();
  });

  test('search sends filters to the API (state options come from telemetry)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/directory/');

    // State options are built from the telemetry payload (single source, P4).
    await page.getByLabel('State / UT').selectOption({ label: 'Maharashtra (IN-MH)' });
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/v1/public/directory/') && req.url().includes('state=IN-MH'),
    );
    await page.getByRole('button', { name: 'Search Directory' }).click();
    await requestPromise;
    await expect(page.getByText('Sample Institution 1 Maharashtra')).toBeVisible();
  });

  test('empty result state is explicit', async ({ page }) => {
    await mockApi(page, { emptyDirectory: true });
    await page.goto('/directory/');
    await expect(page.getByText('No institutions match your filters.')).toBeVisible();
  });
});
