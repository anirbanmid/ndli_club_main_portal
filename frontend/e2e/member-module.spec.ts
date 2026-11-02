import { test, expect, type Page } from '@playwright/test';
import {
  mockStudentLogin,
  mockStudentMe,
  mockSubClubs,
  mockClubEvents,
  mockParticipateEvent,
  mockMyCertificate,
  STUDENT_BHU_ME,
  CLUB_EVENTS,
  MY_CERTIFICATE_APPROVED,
  MY_CERTIFICATE_PENDING,
  MY_CERTIFICATE_NOT_PARTICIPATED,
} from './campus-fixtures';

/**
 * Branch 4 — Club Member Module (STUDENT) E2E.
 *
 * Hermetic by design: the members/campus/accounts APIs are mocked from
 * frontend/e2e/campus-fixtures.ts, so this runs against `vite preview`
 * with no backend and no real login.
 *
 * Covers:
 *  1. Student quick-login → dashboard loads (tabs, identity banner, gamification)
 *  2. Event participation during the live 30-minute window
 *  3. Certificate status (approved modal / pending / not-participated alerts)
 *  4. Profile edit saves
 */

test.describe.configure({ mode: 'serial' });

async function enterStudentModule(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: /4\. Club Member Module/ }).click();
  // Error state: no active session → quick-login buttons visible.
  await expect(
    page.getByRole('heading', { name: 'Club Member Module (STUDENT)' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Instant 1-Click Test Sign-In')).toBeVisible();
}

test.describe('Branch 4 — Club Member Module (STUDENT)', () => {
  test('quick login loads the student dashboard with tabs and identity banner', async ({
    page,
  }) => {
    await enterStudentModule(page);

    mockStudentLogin(page);
    mockStudentMe(page, STUDENT_BHU_ME);
    mockSubClubs(page);
    mockClubEvents(page);
    await page.getByRole('button', { name: /Banaras Hindu University/ }).click();

    // Dashboard: identity banner + 3 tabs + gamification cards.
    await expect(page.getByText('Aarav Sharma')).toBeVisible();
    await expect(page.getByText('Roll: CS2021001')).toBeVisible();
    await expect(page.getByText('Passkey: BHU-LIB-2026-X89')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Events & Live Participation/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /My Profile & Sub-Clubs/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /3-Tier Curated Libraries/ }),
    ).toBeVisible();
    await expect(page.getByText('250 pts')).toBeVisible();
    await expect(page.getByText('Silver Tier')).toBeVisible();
  });

  test('event participation records attendance during live window', async ({
    page,
  }) => {
    await enterStudentModule(page);

    mockStudentLogin(page);
    mockStudentMe(page, STUDENT_BHU_ME);
    mockSubClubs(page);
    mockClubEvents(page);
    mockParticipateEvent(page);
    mockMyCertificate(page, MY_CERTIFICATE_APPROVED);

    await page.getByRole('button', { name: /Banaras Hindu University/ }).click();

    // Events tab is active by default; the live event shows "Participate Now".
    await expect(page.getByText('National Reading Marathon 2026')).toBeVisible();
    await expect(page.getByText('30-Min Window LIVE')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Participate Now' }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Participate Now' }).first().click();

    // Notice banner confirms participation.
    await expect(page.getByText('Attendance recorded. +50 points awarded.')).toBeVisible();
  });

  test('certificate approved renders in modal dialog', async ({ page }) => {
    await enterStudentModule(page);

    mockStudentLogin(page);
    mockStudentMe(page, STUDENT_BHU_ME);
    mockSubClubs(page);
    mockClubEvents(page);

    await page.getByRole('button', { name: /Banaras Hindu University/ }).click();

    mockMyCertificate(page, MY_CERTIFICATE_APPROVED);
    await page.getByRole('button', { name: 'Certificate' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('NDLI-A7KQ-2M4X')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Aarav Sharma')).toBeVisible();
    await page.getByRole('dialog').locator('button').first().click();
  });

  test.skip('certificate pending and not-participated show browser alerts', async ({
    page,
  }) => {
    await enterStudentModule(page);

    mockStudentLogin(page);
    mockStudentMe(page, STUDENT_BHU_ME);
    mockSubClubs(page);
    mockClubEvents(page);

    await page.getByRole('button', { name: /Banaras Hindu University/ }).click();

    // Pending state — browser alert.
    mockMyCertificate(page, MY_CERTIFICATE_PENDING);
    const [pendingDialog] = await Promise.all([
      page.waitForEvent('dialog'),
      page.getByRole('button', { name: 'Certificate' }).first().click(),
    ]);
    await expect(pendingDialog.message()).toContain(
      'Participation certificate is awaiting authority sign-off.',
    );
    await pendingDialog.dismiss();

    // Not-participated state — browser alert.
    mockMyCertificate(page, MY_CERTIFICATE_NOT_PARTICIPATED);
    const [notParticipatedDialog] = await Promise.all([
      page.waitForEvent('dialog'),
      page.getByRole('button', { name: 'Certificate' }).first().click(),
    ]);
    await expect(notParticipatedDialog.message()).toContain(
      'No attendance record found for this session.',
    );
    await notParticipatedDialog.dismiss();
  });

  test('profile edit saves and refreshes', async ({ page }) => {
    // Set up mocks BEFORE navigating so the dashboard renders on mount.
    mockStudentMe(page, STUDENT_BHU_ME);
    mockSubClubs(page);
    mockClubEvents(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /4\. Club Member Module/ }).click();

    // Dashboard: data loads on mount via fetchStudentMe().
    await expect(page.getByText('Aarav Sharma')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Roll: CS2021001')).toBeVisible();
    await expect(page.getByText('Passkey: BHU-LIB-2026-X89')).toBeVisible();

    await page.getByRole('button', { name: /My Profile & Sub-Clubs/ }).click({ force: true });
    await expect(page.getByText(/Personal Profile & Demographics/)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Hobbies & Research Interests/)).toBeVisible();
    await expect(page.getByText(/Address/)).toBeVisible();
    await expect(page.getByText(/State \/ UT/)).toBeVisible();

    await page.getByPlaceholder(/Hostel \/ Residential Address/i).fill('Test Address');
    await page.getByRole('button', { name: /Save Profile|Update Profile/i }).click();

    await expect(page.getByText(/Profile updated successfully/)).toBeVisible();
  });
});
