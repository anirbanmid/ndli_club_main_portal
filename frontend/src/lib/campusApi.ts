/**
 * NDLI Club Main Portal — Typed client for the Institutional Club Module (CAMPUS).
 *
 * Implements:
 * 1. Sub-Club management & SSOT 1+N counting.
 * 2. School Offline-First Tangible Identity: bulk CSV roster upload & printable cards.
 * 3. Events: Institutional & Multi-Club collaboration, 30-min window attendance,
 *    password-gated certificate approvals, and conductor certificate generation.
 * 4. 3-Tier Curated Libraries with strict https://ndli.iitkgp.ac.in/ validation.
 * 5. Universal Forgot Password workflow (72-hour reset token) & Central Admin emergency reset.
 */

import { ApiError } from './api';
import { csrfHeader, detailMessage } from './authApi';

export const ACTIVITIES_API_BASE = '/api/v1/activities';
export const CLUBS_API_BASE = '/api/v1/clubs';
export const MEMBERS_API_BASE = '/api/v1/members';
export const SHARING_API_BASE = '/api/v1/sharing';
export const ACCOUNTS_API_BASE = '/api/v1/accounts';
export const ONBOARDING_API_BASE = '/api/v1/onboarding';

// --- Sub-Clubs (HEI) ---------------------------------------------------------

export interface SubClub {
  id: number;
  club_id: string;
  code: string;
  name: string;
  discipline: string;
  coordinator_name: string;
  coordinator_email: string;
  coordinator_phone: string;
  is_active: boolean;
  member_count?: number;
  created_at: string;
}

export interface SubClubInput {
  name: string;
  code: string;
  discipline: string;
  coordinator_name: string;
  coordinator_email: string;
  coordinator_phone?: string;
}

export async function fetchSubClubs(clubCode: string): Promise<SubClub[]> {
  const res = await fetch(`${CLUBS_API_BASE}/${encodeURIComponent(clubCode)}/subclubs/`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch sub-clubs', res.status);
  }
  const body = await res.json();
  const rawList: any[] = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.sub_clubs) ? body.sub_clubs : []);
  return rawList.map((item: any) => ({
    id: Number(item.id),
    club_id: String(item.club_id || clubCode),
    code: String(item.code || ''),
    name: String(item.name || ''),
    discipline: String(item.discipline || ''),
    coordinator_name: String(item.coordinator_name || ''),
    coordinator_email: String(item.coordinator_email || ''),
    coordinator_phone: String(item.coordinator_phone || ''),
    is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
    member_count: Number(item.member_count ?? item.members_count ?? 0),
    created_at: String(item.created_at || ''),
  }));
}

export async function createSubClub(clubCode: string, payload: SubClubInput): Promise<SubClub> {
  const res = await fetch(`${CLUBS_API_BASE}/${encodeURIComponent(clubCode)}/subclubs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to create sub-club', res.status);
  }
  return res.json();
}

// --- Institutional Branding (Logo & Signature) ------------------------------

export interface ClubBranding {
  institution_name: string;
  institution_type: 'higher_education' | 'school';
  affiliation_code: string;
  signing_authority_name: string;
  signing_authority_affiliation: string;
  has_logo: boolean;
  logo_url: string;
  has_signature: boolean;
  signature_url: string;
}

export async function fetchClubBranding(clubCode: string): Promise<ClubBranding> {
  const fallback: ClubBranding = {
    institution_name: clubCode,
    institution_type: 'higher_education',
    affiliation_code: '',
    signing_authority_name: '',
    signing_authority_affiliation: '',
    has_logo: false,
    logo_url: '',
    has_signature: false,
    signature_url: '',
  };
  try {
    const res = await fetch(`${CLUBS_API_BASE}/${encodeURIComponent(clubCode)}/branding/`, {
      headers: { Accept: 'application/json', ...csrfHeader() },
      credentials: 'include',
    });
    if (!res.ok) {
      return fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function saveClubBranding(
  clubCode: string,
  formData: FormData,
): Promise<{
  message: string;
  has_logo: boolean;
  has_signature: boolean;
  signing_authority_name: string;
  signing_authority_affiliation: string;
}> {
  const res = await fetch(`${CLUBS_API_BASE}/${encodeURIComponent(clubCode)}/branding/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: formData,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to save branding', res.status);
  }
  return body;
}

// --- School Offline Roster & Tangible Identity ------------------------------

export interface SchoolStudentCard {
  student_uid: string;
  full_name: string;
  gender: string;
  student_class: string;
  section: string;
  club_code: string;
  club_name: string;
  school_name: string;
  state_code: string;
  batch_year: number;
}

export interface SchoolRosterUploadResult {
  club_code: string;
  total_processed: number;
  created_count: number;
  students: {
    student_uid: string;
    full_name: string;
    student_class: string;
    section: string;
  }[];
}

export async function uploadSchoolRoster(clubCode: string, file: File): Promise<SchoolRosterUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${MEMBERS_API_BASE}/school/${encodeURIComponent(clubCode)}/upload/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to upload school roster', res.status);
  }
  return res.json();
}

export interface PreApprovalUploadResult {
  club_code: string;
  club_name: string;
  created: number;
  skipped: number;
  errors: Array<{ row: number; status: string; reason: string; key: string; data: Record<string, unknown> }>;
}

export async function uploadHEIBulkPreapproval(
  clubCode: string,
  file: File,
): Promise<PreApprovalUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${MEMBERS_API_BASE}/roster/import/preapprove/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to upload HEI pre-approval roster', res.status);
  }
  return res.json();
}

export async function fetchSchoolCards(clubCode: string): Promise<SchoolStudentCard[]> {
  const res = await fetch(`${MEMBERS_API_BASE}/school/${encodeURIComponent(clubCode)}/cards/`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch student cards', res.status);
  }
  return res.json();
}

// --- Events & Multi-Club Collaboration --------------------------------------

export interface EventConductor {
  id?: number;
  full_name: string;
  affiliation: string;
}

export interface ClubEvent {
  id: number;
  event_ref?: string;
  host_club: string;
  host_club_name?: string;
  title: string;
  description: string;
  scope: 'institutional' | 'multi_club';
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  start_time: string;
  end_time: string;
  joining_link?: string;
  participants_count?: number;
  sub_clubs?: { id: number; name: string }[];
  conductors?: EventConductor[];
  collaborations?: {
    id: number;
    partner_club?: string;
    partner_club_id?: string;
    partner_club_name?: string;
    status: 'invited' | 'pending' | 'accepted' | 'rejected';
    retry_count: number;
  }[];
  is_attendance_open?: boolean;
  is_window_open?: boolean;
}

export interface CreateEventInput {
  club_code?: string;
  title: string;
  description: string;
  scope: 'institutional' | 'multi_club';
  start_time: string;
  end_time: string;
  joining_link?: string;
  sub_club_ids?: number[];
  conductors?: { name: string; full_name?: string; affiliation: string }[];
  publish?: boolean;
  partner_clubs?: string[];
}

export async function fetchClubEvents(clubId?: string): Promise<ClubEvent[]> {
  const url = clubId
    ? `${ACTIVITIES_API_BASE}/events/?club_id=${encodeURIComponent(clubId)}`
    : `${ACTIVITIES_API_BASE}/events/`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch events', res.status);
  }
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.events)) return body.events;
  return [];
}

export async function createClubEvent(payload: CreateEventInput | FormData): Promise<ClubEvent> {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/`, {
    method: 'POST',
    headers: isFormData
      ? { Accept: 'application/json', ...csrfHeader() }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...csrfHeader(),
        },
    credentials: 'include',
    body: isFormData ? payload : JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to create event', res.status);
  }
  return res.json();
}

export async function participateInEvent(eventId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/participate/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Participation failed', res.status);
  }
  return body;
}

export async function inviteCollaboration(eventId: number, partnerClubId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/collaborate/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ partner_club_id: partnerClubId }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to send collaboration invite', res.status);
  }
  return body;
}

export async function respondCollaboration(collabId: number, action: 'accept' | 'reject'): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/collaborations/${collabId}/respond/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to respond to collaboration', res.status);
  }
  return body;
}

export async function retryEventCollaboration(collabId: number): Promise<{
  id: number;
  partner_club: string;
  status: string;
  retry_count: number;
  message: string;
}> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/collaborations/${collabId}/retry/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to resend collaboration request', res.status);
  }
  return body;
}

export async function uploadEventParticipants(
  eventId: number,
  file: File,
): Promise<{
  success: boolean;
  message: string;
  enrolled_count: number;
  created_attendances: number;
  participants: Array<{ student_uid: string; full_name: string; class: string; section: string }>;
}> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/upload-participants/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: formData,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to upload participants', res.status);
  }
  return body;
}

export function downloadEventCertificatesZipUrl(eventId: number): string {
  return `${ACTIVITIES_API_BASE}/events/${eventId}/download-certificates-zip/`;
}

export async function approveEventCertificates(
  eventId: number,
  passwordConfirm: string,
  options?: { approveAll?: boolean; attendeeIds?: number[] } | number[],
): Promise<{ success: boolean; approved_count: number; message?: string; certificates?: any[] }> {
  const approveAll = Array.isArray(options) ? false : (options?.approveAll ?? (!options?.attendeeIds || options.attendeeIds.length === 0));
  const attendeeIds = Array.isArray(options) ? options : (options?.attendeeIds || []);

  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/approve-certificates/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({
      password: passwordConfirm,
      password_confirm: passwordConfirm,
      approve_all: approveAll,
      attendee_ids: attendeeIds,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Certificate approval failed', res.status);
  }
  return {
    ...body,
    approved_count: body.issued_count ?? body.approved_count ?? 0,
    success: true,
  };
}

export interface EventAttendeeItem {
  id: number;
  name: string;
  email: string;
  roll_number: string;
  department: string;
  is_approved: boolean;
  approved_at: string | null;
  participated_at: string;
}

export async function fetchEventAttendees(eventId: number): Promise<{
  event_id: number;
  event_title: string;
  scope: string;
  is_closed: boolean;
  attendees: EventAttendeeItem[];
  total: number;
  pending_count: number;
}> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/attendees/`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to load attendees', res.status);
  }
  return body;
}

export interface MyEventCertificateResponse {
  approved: boolean;
  status: 'approved' | 'pending_approval' | 'not_participated';
  certificate_id?: string;
  recipient_name?: string;
  category?: string;
  event_title?: string;
  event_date?: string;
  institution_name?: string;
  issue_date?: string;
  hmac_tag?: string;
  verify_url?: string;
  message?: string;
}

export async function fetchMyEventCertificate(eventId: number): Promise<MyEventCertificateResponse> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/my-certificate/`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to check certificate', res.status);
  }
  return body;
}

export async function fetchConductorCertificate(
  eventId: number,
  conductorId: number,
): Promise<{
  certificate_id: string;
  conductor_name: string;
  affiliation: string;
  event_title: string;
  signature_hmac: string;
}> {
  const res = await fetch(`${ACTIVITIES_API_BASE}/events/${eventId}/conductors/${conductorId}/certificate/`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch conductor certificate', res.status);
  }
  return res.json();
}

// --- 3-Tier Curated Libraries ------------------------------------------------

export interface CuratedResourceLink {
  id: number;
  library_id: number;
  title: string;
  ndli_url: string;
  description?: string;
  created_at: string;
}

export interface CuratedLibrary {
  id: number;
  club_id: string;
  library_type: 'club' | 'personal' | 'community';
  title: string;
  topic_category: string;
  owner_id?: number;
  sub_club_id?: number;
  is_published_to_community: boolean;
  resources: CuratedResourceLink[];
  created_at: string;
}

export async function fetchLibraries(clubId?: string, libraryType?: string): Promise<CuratedLibrary[]> {
  const params = new URLSearchParams();
  if (clubId) {
    params.append('club_code', clubId);
    params.append('club_id', clubId);
  }
  if (libraryType) params.append('type', libraryType);

  const res = await fetch(`${SHARING_API_BASE}/libraries/?${params.toString()}`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch libraries', res.status);
  }
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.libraries)) return body.libraries;
  return [];
}

export async function devStudentQuickLogin(
  username: string = 'student.bhu',
  password: string = 'Password@123',
): Promise<void> {
  const res = await fetch('/api/v1/accounts/login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({
      username,
      password,
      captcha: 'DEV_TEST',
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(errBody) ?? 'Quick login failed', res.status);
  }
}

export async function createLibrary(payload: {
  title: string;
  topic_category: string;
  library_type: 'club' | 'personal' | 'community';
  club_code?: string;
  sub_club_id?: number;
}): Promise<CuratedLibrary> {
  const res = await fetch(`${SHARING_API_BASE}/libraries/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to create library', res.status);
  }
  return body;
}

export async function addResourceLink(
  libraryId: number,
  payload: { title: string; ndli_url: string; description?: string },
): Promise<CuratedResourceLink> {
  // Client-side mirror check for immediate feedback
  if (!payload.ndli_url.startsWith('https://ndli.iitkgp.ac.in/')) {
    throw new ApiError(
      'server',
      'NDLI Security Law: Only resources hosted on https://ndli.iitkgp.ac.in/ are permitted.',
      400,
    );
  }

  const res = await fetch(`${SHARING_API_BASE}/libraries/${libraryId}/resources/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to add resource', res.status);
  }
  return body;
}

export async function deleteResourceLink(linkId: number): Promise<void> {
  const res = await fetch(`${SHARING_API_BASE}/resources/${linkId}/`, {
    method: 'DELETE',
    headers: { ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to delete resource', res.status);
  }
}

// --- Universal Forgot Password & Central Admin Reset ------------------------

export interface ForgotPasswordResult {
  success: boolean;
  message: string;
  reset_token?: string;
  reset_url?: string;
}

export async function requestForgotPassword(
  email: string,
  role: 'Club Authority' | 'Club Member (Student Only)',
): Promise<ForgotPasswordResult> {
  const res = await fetch(`${ACCOUNTS_API_BASE}/password/forgot-check/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ email, role }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Exact spec failure string
    const msg = detailMessage(body) ?? 'No database found, please register yourself first.';
    throw new ApiError('server', msg, res.status);
  }
  return body;
}

export async function centralAdminEmergencyReset(
  email: string,
  temporaryPassword: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${ACCOUNTS_API_BASE}/emergency-reset/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({
      email,
      temporary_password: temporaryPassword,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Emergency reset failed', res.status);
  }
  return body;
}

// --- Authority Email Check & Succession Deactivation -----------------------

export interface AuthorityEmailCheckResult {
  exists: boolean;
  conflict: boolean;
  tier?: string;
  post?: string;
  club_code?: string;
  institution_name?: string;
  club_name?: string;
  message: string;
}

export async function checkAuthorityEmail(email: string): Promise<AuthorityEmailCheckResult> {
  const res = await fetch(`${ONBOARDING_API_BASE}/authority/check-email/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Email check failed', res.status);
  }
  return body;
}

export async function confirmAuthorityDeactivation(
  email: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${ONBOARDING_API_BASE}/authority/confirm-deactivation/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ email, confirmed: true }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Account deactivation failed', res.status);
  }
  return body;
}

// --- HEI Student Member & Joining Workflow ---------------------------------

export interface StudentJoinPayload {
  passkey: string;
  full_name: string;
  gender: 'male' | 'female' | 'other';
  email: string;
  password: string;
  department: string;
  roll_number: string;
  auto_activate?: boolean;
}

export interface StudentJoinResponse {
  success: boolean;
  message: string;
  club_code: string;
  institution_name: string;
  full_name: string;
  roll_number: string;
  profile_id?: number;
}

export async function registerStudentMember(
  payload: StudentJoinPayload,
): Promise<StudentJoinResponse> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Student registration failed', res.status);
  }
  return body;
}

export interface PreapprovalCheckPayload {
  passkey: string;
  email: string;
  full_name: string;
}

export interface PreapprovalCheckResponse {
  match: boolean;
  message: string;
  club_code?: string;
  institution_name?: string;
  roster_entry_id?: number;
  roster_name?: string;
  roster_email?: string;
}

export async function checkPreapproval(
  payload: PreapprovalCheckPayload,
): Promise<PreapprovalCheckResponse> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/check-preapproval/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      'server',
      detailMessage(body) ?? 'Pre-approval check failed',
      res.status,
    );
  }
  return body;
}

export interface PendingJoinItem {
  id: number;
  user_id: number;
  user?: { username: string; email: string };
  full_name: string;
  email: string;
  gender: string;
  department: string;
  roll_number: string;
  club_code: string;
  source: string;
  status: string;
  created_at: string;
}

export async function fetchPendingJoins(clubCode?: string): Promise<PendingJoinItem[]> {
  const url = clubCode
    ? `${MEMBERS_API_BASE}/joins/?status=pending&club_code=${encodeURIComponent(clubCode)}`
    : `${MEMBERS_API_BASE}/joins/?status=pending`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch pending join requests', res.status);
  }
  const data = await res.json();
  return data.results ?? [];
}

export async function approveJoinRequest(joinId: number): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/joins/${joinId}/confirm/`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to approve join request', res.status);
  }
}

export async function rejectJoinRequest(joinId: number): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/joins/${joinId}/reject/`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to reject join request', res.status);
  }
}

export async function batchApproveJoins(
  clubCode: string,
  approveAll: boolean,
  requestIds?: number[],
): Promise<number> {
  const res = await fetch(`${MEMBERS_API_BASE}/joins/batch-confirm/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({
      club_code: clubCode,
      approve_all: approveAll,
      request_ids: requestIds ?? [],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to batch approve joins', res.status);
  }
  return body.count ?? 0;
}

export interface StudentProfileItem {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  gender: string;
  department: string;
  roll_number: string;
  validity_years: number;
  valid_until: string;
  is_suspended: boolean;
  is_expired: boolean;
  status: 'active' | 'suspended' | 'expired';
  points: number;
  badge: string;
  sub_clubs: Array<{ id: number; name: string }>;
  joined_at: string;
}

export interface StudentProfileFilters {
  club_code?: string;
  year?: number | string;
  department?: string;
  gender?: string;
  sub_club_id?: number | string;
  main_club_only?: boolean;
  search?: string;
}

export async function fetchStudentProfiles(
  filters: StudentProfileFilters = {},
): Promise<{ results: StudentProfileItem[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.club_code) params.append('club_code', filters.club_code);
  if (filters.year) params.append('year', String(filters.year));
  if (filters.department) params.append('department', filters.department);
  if (filters.gender) params.append('gender', filters.gender);
  if (filters.sub_club_id) params.append('sub_club_id', String(filters.sub_club_id));
  if (filters.main_club_only) params.append('main_club_only', 'true');
  if (filters.search) params.append('search', filters.search);

  const res = await fetch(`${MEMBERS_API_BASE}/students/?${params.toString()}`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch student profiles', res.status);
  }
  return res.json();
}

export async function updateStudentValidity(
  profileId: number,
  validityYears: number,
): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/${profileId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ validity_years: validityYears }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to update validity', res.status);
  }
}

export async function toggleStudentSuspension(
  profileId: number,
  isSuspended: boolean,
): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/${profileId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ is_suspended: isSuspended }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to toggle suspension', res.status);
  }
}

export async function assignStudentSubClubs(
  profileId: number,
  subclubIds: number[],
): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/${profileId}/subclubs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ subclub_ids: subclubIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to assign sub-clubs', res.status);
  }
}

export async function removeStudentMember(profileId: number): Promise<void> {
  const res = await fetch(`${MEMBERS_API_BASE}/students/${profileId}/`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError('server', detailMessage(body) ?? 'Failed to remove student member', res.status);
  }
}

// --- Dedicated Student Member Portal (Me) -----------------------------------

export interface StudentMeResponse {
  profile: {
    id: number;
    user_id: number;
    username: string;
    email: string;
    full_name: string;
    gender: string;
    department: string;
    roll_number: string;
    validity_years: number;
    valid_until: string;
    is_suspended: boolean;
    avatar_url: string;
    date_of_birth: string | null;
    age: number | null;
    hobbies: string;
    address: string;
    state: string;
    pincode: string;
    social_facebook: string;
    social_instagram: string;
    social_x: string;
    club: {
      code: string;
      name: string;
      institution_name: string;
      passkey: string;
    };
    sub_clubs: Array<{ id: number; name: string }>;
  };
  stats: {
    points: number;
    badge: string;
    badge_label: string;
    profile_completeness: number;
    streak_days: number;
    events_attended: number;
    certificates_earned: number;
    next_tier_points: number;
  };
}

export async function fetchStudentMe(): Promise<StudentMeResponse> {
  const res = await fetch(`${MEMBERS_API_BASE}/me/`, {
    headers: { Accept: 'application/json', ...csrfHeader() },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('server', 'Failed to fetch student profile', res.status);
  }
  return res.json();
}

export async function updateStudentMe(
  data: Partial<StudentMeResponse['profile']> | FormData,
): Promise<{ message: string; points?: number; badge?: string }> {
  const isFormData = data instanceof FormData;
  const res = await fetch(`${MEMBERS_API_BASE}/me/`, {
    method: 'PATCH',
    headers: isFormData
      ? { Accept: 'application/json', ...csrfHeader() }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...csrfHeader(),
        },
    credentials: 'include',
    body: isFormData ? data : JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to update profile', res.status);
  }
  return body;
}

export async function updateStudentMeSubClubs(
  subclubIds: number[],
): Promise<{ message: string; sub_clubs: Array<{ id: number; name: string }>; points: number }> {
  const res = await fetch(`${MEMBERS_API_BASE}/me/subclubs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({ subclub_ids: subclubIds }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to update sub-clubs', res.status);
  }
  return body;
}

export async function changeStudentPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string; success: boolean }> {
  const res = await fetch(`${MEMBERS_API_BASE}/me/change-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...csrfHeader(),
    },
    credentials: 'include',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError('server', detailMessage(body) ?? 'Failed to change password', res.status);
  }
  return body;
}

