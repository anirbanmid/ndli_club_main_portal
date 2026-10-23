import { test, expect, type Page } from '@playwright/test';

/**
 * DEC2/DEC4 verdict-translation smoke (automates manual smoke B/C/D).
 *
 * Hermetic by design, same philosophy as public-pages.spec.ts: the API is
 * mocked, so this runs against `vite preview` with no backend and no login.
 *
 * What it pins:
 *  - DEC4: the two authority-contact verdicts reach the field-level alert.
 *  - DEC2: every one of those verdicts is routed through t() at render, so it
 *    is BYTE-IDENTICAL to the API in English (i18next returns missing keys as
 *    themselves) and becomes the catalogue string in Hindi.
 *
 * Sequence matters: act in English first, then flip the picker and re-assert
 * the same node. App.tsx re-renders the whole tree after the lazy catalogue
 * chunk loads, so an already-rendered error re-translates in place.
 */

const PHONE_REQUIRED = 'An Indian mobile number is required.';
const PHONE_REQUIRED_HI = 'एक भारतीय मोबाइल नंबर आवश्यक है।';
const PHONE_INVALID = 'The mobile number must be a 10-digit Indian number.';
const PHONE_INVALID_HI = 'मोबाइल नंबर 10 अंकों का भारतीय नंबर होना चाहिए।';
const IDENTITY_REQUIRED = 'A institution name is required.';
const IDENTITY_REQUIRED_HI = 'संस्था का नाम आवश्यक है।';

const ROLES = ['patron', 'president', 'secretary', 'executive'] as const;

/** DraftPayload with identity stored (isStepComplete: identity is always true). */
function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dft-e2e-1',
    institution_name: 'Sample Engineering College',
    aishe_code: 'U-1000',
    club_name: 'NDLI Reading Club',
    zone_code: 'W',
    state_code: 'MH',
    district_code: 'Pune',
    status: 'draft',
    authorities: {},
    document_uploaded: false,
    ...overrides,
  };
}

/** Seed the one thing the wizard persists across reloads (onboardingResume). */
async function seedCapability(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ndli.onboarding.resume',
      JSON.stringify({ token: 'e2e-resume-token', draftId: 'dft-e2e-1' }),
    );
  });
}

/** Flip the picker while the UI is still English (its aria-label is English). */
async function switchToHindi(page: Page): Promise<void> {
  await page.locator('select[aria-label="Select Language"]').selectOption('hi');
}

test.describe('DEC2/DEC4 verdict translation', () => {
  test('create_draft verdict renders byte-exact in English, Hindi after switch', async ({ page }) => {
    await page.route('**/api/v1/onboarding/drafts/', (route) =>
      route.fulfill({ status: 400, json: { detail: IDENTITY_REQUIRED } }),
    );

    await page.goto('/onboarding/');
    // noValidate form: an empty submit is a legal request, the server judges it.
    await page.getByRole('button', { name: 'Start the wizard' }).click();

    const alert = page.locator('#identity-institution_name-error');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(IDENTITY_REQUIRED);

    await switchToHindi(page);
    await expect(alert).toHaveText(IDENTITY_REQUIRED_HI);
  });

  test('DEC4 phone verdict reaches the authority field and translates', async ({ page }) => {
    await seedCapability(page);
    await page.route('**/api/v1/onboarding/drafts/resume/', (route) =>
      route.fulfill({ status: 200, json: draft() }),
    );
    await page.route('**/api/v1/onboarding/drafts/*/authorities/*/', (route) =>
      route.fulfill({ status: 400, json: { detail: PHONE_REQUIRED } }),
    );

    await page.goto('/onboarding/');
    // resume lands on the first open step: authority:patron.
    await expect(page.locator('#authority-patron-phone')).toBeVisible();

    await page.locator('#authority-patron-name').fill('Test Patron');
    await page.locator('#authority-patron-email').fill('patron@example.com');
    await page.locator('#authority-patron-phone').fill('12345');
    await page.locator('#authority-patron-designation').fill('Patron');
    await page.getByRole('button', { name: 'Save this authority' }).click();

    // The hint <p> sits between input and error, so walk the siblings.
    const alert = page.locator(
      'xpath=//*[@id="authority-patron-phone"]/following-sibling::p[@role="alert"]',
    );
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(PHONE_REQUIRED);

    await switchToHindi(page);
    await expect(alert).toHaveText(PHONE_REQUIRED_HI);
  });

  test('submit-gate rejected-field verdicts translate', async ({ page }) => {
    await seedCapability(page);
    const complete = draft({
      authorities: Object.fromEntries(
        ROLES.map((role) => [
          role,
          {
            full_name: `Full ${role}`,
            email: `${role}@example.com`,
            phone: '9876543210',
            designation: 'Office bearer',
            otp_verified: true,
          },
        ]),
      ),
      document_uploaded: true,
    });

    await page.route('**/api/v1/onboarding/drafts/resume/', (route) =>
      route.fulfill({ status: 200, json: complete }),
    );
    await page.route('**/api/v1/onboarding/drafts/*/submit/', (route) =>
      route.fulfill({ status: 400, json: { detail: PHONE_INVALID } }),
    );

    await page.goto('/onboarding/');
    // every step complete -> lands on review.
    await page.getByRole('button', { name: 'Submit to the charter queue' }).click();

    // `{field}:` is an internal key and stays literal in both languages.
    // Scope to the Rejected-fields <ul> — the open-steps list has its own <li>s.
    const row = page.locator('ul.space-y-1 > li').filter({ hasText: 'phone:' });
    await expect(row).toBeVisible();
    await expect(row).toContainText(PHONE_INVALID);

    await switchToHindi(page);
    await expect(row).toContainText(PHONE_INVALID_HI);
  });
});
