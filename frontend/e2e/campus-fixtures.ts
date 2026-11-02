import type { Page } from '@playwright/test';

/**
 * Hermetic API fixtures for the Campus (Branch 2), Club Member (Branch 4),
 * and IIT KGP Admin (Branch 3) modules.
 *
 * Shapes mirror the backend contracts in frontend/src/lib/campusApi.ts,
 * frontend/src/lib/onboardingApi.ts, and frontend/src/lib/authApi.ts.
 * All mocks are intentionally deterministic so the same URL always returns
 * the same payload — no timestamps, no random IDs.
 */

export const STUDENT_BHU_ME = {
  profile: {
    id: 1,
    user_id: 101,
    username: 'student.bhu',
    email: 'student.bhu@bhu.ac.in',
    full_name: 'Aarav Sharma',
    gender: 'male',
    department: 'Computer Science',
    roll_number: 'CS2021001',
    validity_years: 3,
    valid_until: '2029-03-31',
    is_suspended: false,
    avatar_url: '',
    date_of_birth: '2002-05-15',
    age: 24,
    hobbies: 'Reading, coding',
    address: 'Varanasi, Uttar Pradesh',
    state: 'UTTAR_PRADESH',
    pincode: '221005',
    social_facebook: '',
    social_instagram: '',
    social_x: '',
    club: {
      code: 'CLUB-BHU-008',
      name: 'BHU NDLI Club',
      institution_name: 'Banaras Hindu University',
      passkey: 'BHU-LIB-2026-X89',
    },
    sub_clubs: [
      { id: 1, name: 'Robotics' },
      { id: 2, name: 'Literary' },
    ],
  },
  stats: {
    points: 250,
    badge: 'silver',
    badge_label: 'Silver',
    profile_completeness: 78,
    streak_days: 12,
    events_attended: 5,
    certificates_earned: 3,
    next_tier_points: 500,
  },
};

export const STUDENT_IITKGP_ME = {
  ...STUDENT_BHU_ME,
  profile: {
    ...STUDENT_BHU_ME.profile,
    username: 'student.iitkgp',
    email: 'student.iitkgp@iitkgp.ac.in',
    full_name: 'Diya Mukherjee',
    roll_number: 'CS2021002',
    club: {
      ...STUDENT_BHU_ME.profile.club,
      code: 'CLUB-IITKGP-001',
      name: 'IIT Kharagpur NDLI Club',
      passkey: 'KGP-LIB-2026-A12',
    },
    sub_clubs: [{ id: 3, name: 'Debating' }],
  },
  stats: {
    ...STUDENT_BHU_ME.stats,
    points: 420,
    badge: 'gold',
    badge_label: 'Gold',
    profile_completeness: 92,
    events_attended: 8,
    certificates_earned: 6,
    next_tier_points: 500,
  },
};

export const CLUB_EVENTS: any[] = [
  {
    id: 101,
    event_ref: 'EVT-2026-001',
    host_club: 'CLUB-BHU-008',
    host_club_name: 'BHU NDLI Club',
    title: 'National Reading Marathon 2026',
    description: 'A 24-hour reading marathon across all NDLI clubs.',
    scope: 'institutional',
    status: 'published',
    start_time: '2026-11-15T10:00:00Z',
    end_time: '2026-11-15T18:00:00Z',
    joining_link: 'https://meet.ndli.example/reading-marathon',
    participants_count: 42,
    sub_clubs: [{ id: 1, name: 'Robotics' }],
    conductors: [
      { full_name: 'Prof. Anita Desai', affiliation: 'Dept. of Computer Science' },
    ],
    collaborations: [],
    is_attendance_open: true,
    is_window_open: true,
  },
  {
    id: 102,
    event_ref: 'EVT-2026-002',
    host_club: 'CLUB-BHU-008',
    host_club_name: 'BHU NDLI Club',
    title: 'Open Source Contribution Day',
    description: 'Contribute to open-source NDLI repositories.',
    scope: 'institutional',
    status: 'draft',
    start_time: '2026-12-01T09:00:00Z',
    end_time: '2026-12-01T17:00:00Z',
    participants_count: 0,
    sub_clubs: [],
    conductors: [],
    collaborations: [],
    is_attendance_open: false,
    is_window_open: false,
  },
];

export const SUBCLUBS: any[] = [
  {
    id: 1,
    club_id: 'CLUB-BHU-008',
    code: 'ROBOTICS-01',
    name: 'Robotics',
    discipline: 'Computer Science',
    coordinator_name: 'Prof. Anita Desai',
    coordinator_email: 'anita.desai@bhu.ac.in',
    coordinator_phone: '9876543210',
    is_active: true,
    member_count: 12,
    created_at: '2026-01-15',
  },
  {
    id: 2,
    club_id: 'CLUB-BHU-008',
    code: 'LITERARY-01',
    name: 'Literary',
    discipline: 'Humanities',
    coordinator_name: 'Dr. Ravi Kumar',
    coordinator_email: 'ravi.kumar@bhu.ac.in',
    coordinator_phone: '',
    is_active: true,
    member_count: 8,
    created_at: '2026-02-01',
  },
];

export const MY_CERTIFICATE_APPROVED = {
  approved: true,
  status: 'approved',
  certificate_id: 'NDLI-A7KQ-2M4X',
  recipient_name: 'Aarav Sharma',
  category: 'participant',
  event_title: 'National Reading Marathon 2026',
  event_date: '2026-11-15',
  institution_name: 'Banaras Hindu University',
  issue_date: '2026-11-16',
  hmac_tag: 'a1b2c3d4e5f6',
  verify_url: 'https://ndli-club-portal.onrender.com/api/v1/public/verify/?id=NDLI-A7KQ-2M4X',
  message: 'Certificate approved and ready for download.',
};

export const MY_CERTIFICATE_PENDING = {
  approved: false,
  status: 'pending_approval',
  message: 'Your attendance is recorded! Participation certificate is awaiting authority sign-off.',
};

export const MY_CERTIFICATE_NOT_PARTICIPATED = {
  approved: false,
  status: 'not_participated',
  message: 'No attendance record found for this session. Participation must be logged during the 30-minute window.',
};

export const LIBRARIES: any[] = [
  {
    id: 1,
    club_id: 'CLUB-BHU-008',
    library_type: 'club',
    title: 'NDLI Core Collection',
    topic_category: 'Computer Science',
    owner_id: 1,
    sub_club_id: null,
    is_published_to_community: true,
    resources: [
      {
        id: 1,
        library_id: 1,
        title: 'Introduction to Algorithms',
        ndli_url: 'https://ndli.iitkgp.ac.in/ebook/algo-001',
        description: 'CLRS textbook chapter 1',
        created_at: '2026-01-10',
      },
    ],
    created_at: '2026-01-10',
  },
];

// --- Helper: mock the student quick-login flow ---------------------------------

/** Mock POST /api/v1/accounts/login/ (devStudentQuickLogin only checks res.ok). */
export function mockStudentLogin(page: Page): void {
  page.route('**/api/v1/accounts/login/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

/** Mock GET /api/v1/members/me/ (StudentMeResponse) and PATCH (profile update). */
export function mockStudentMe(page: Page, me: any = STUDENT_BHU_ME): void {
  page.route('**/api/v1/members/me/', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Profile updated successfully.', points: 10, badge: 'silver' }) });
    }
  });
}

/** Mock GET /api/v1/clubs/<code>/subclubs/ (SubClub[]). */
export function mockSubClubs(page: Page, subs: any[] = SUBCLUBS): void {
  page.route('**/api/v1/clubs/*/subclubs/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(subs) }),
  );
}

/** Mock GET /api/v1/activities/events/?club_id=... (ClubEvent[]). */
export function mockClubEvents(page: Page, events: any[] = CLUB_EVENTS): void {
  page.route('**/api/v1/activities/events/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) }),
  );
}

/** Mock POST /api/v1/activities/events/<id>/participate/ */
export function mockParticipateEvent(page: Page): void {
  page.route('**/api/v1/activities/events/*/participate/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Attendance recorded. +50 points awarded.' }),
    }),
  );
}

/** Mock GET /api/v1/activities/events/<id>/my-certificate/ */
export function mockMyCertificate(page: Page, cert: any = MY_CERTIFICATE_APPROVED): void {
  page.route('**/api/v1/activities/events/*/my-certificate/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cert) }),
  );
}

/** Mock POST /api/v1/members/me/subclubs/ (sub-club selection). */
export function mockUpdateStudentSubClubs(page: Page): void {
  page.route('**/api/v1/members/me/subclubs/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Sub-clubs updated successfully.',
        sub_clubs: [{ id: 1, name: 'Robotics' }, { id: 2, name: 'Literary' }],
        points: 20,
      }),
    }),
  );
}

/** Mock POST /api/v1/members/me/change-password/ */
export function mockChangeStudentPassword(page: Page): void {
  page.route('**/api/v1/members/me/change-password/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Password changed successfully.', success: true }),
    }),
  );
}

/** Mock POST /api/v1/accounts/password/forgot-check/ */
export function mockForgotPassword(page: Page): void {
  page.route('**/api/v1/accounts/password/forgot-check/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: "An email has been sent to your registered email id with password reset link and it will be valid for 72 hours.",
        reset_token: 'e2e-reset-token-abc123',
      }),
    }),
  );
}

/** Mock GET /api/v1/sharing/libraries/ (CuratedLibrary[]). */
export function mockLibraries(page: Page, libs: any[] = LIBRARIES): void {
  page.route('**/api/v1/sharing/libraries/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(libs) }),
  );
}

/** Seed student resume capability in localStorage (like dec2-verdicts.spec.ts). */
export function seedStudentSession(page: Page): void {
  page.addInitScript(() => {
    window.localStorage.setItem(
      'ndli.student.session',
      JSON.stringify({ username: 'student.bhu', club_code: 'CLUB-BHU-008' }),
    );
  });
}
