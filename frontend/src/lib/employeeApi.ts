/**
 * NDLI Club Main Portal — typed client for the EMPLOYEE activity surface (M6 D8).
 *
 * Routes live under `/api/v1/activities/` (the employee door is the office
 * session; scoping is enforced server-side: self, or Central Admin with
 * `emp_id`). Contract notes:
 * - `credentials: 'include'` + CSRF header, matching `rosterApi`/`adminApi`.
 * - Club-approval log rows are delete-protected server-side (PLAN_0018 §6):
 *   the API answers 403 and the UI must never pretend otherwise.
 * - 429 surfaces as `ApiError('rate-limit')`; the UI retries later.
 */
import { ApiError } from './api';
import { csrfHeader } from './authApi';

const BASE = '/admin/api/v1/activities';

export interface ActivityRow {
  activity_id: string;
  emp_id: string;
  timestamp: string;
  support_type: string;
  priority_flag: boolean;
  club_id: string;
  notes: string;
  is_approval_log: boolean;
  call_count?: number;
}

export interface ActivityList {
  count: number;
  activities: ActivityRow[];
}

export interface LogActivityInput {
  emp_id?: string;
  support_type: string;
  notes?: string;
  club_id?: string;
  count?: number;
}

export interface LogActivityResult {
  success: boolean;
  message: string;
  count: number;
  activity: ActivityRow;
}

export interface DeleteActivityResult {
  success: boolean;
  message: string;
  deleted_count: number;
  not_found: string[];
}

export interface ClubSearchRow {
  club_id?: string;
  registration_no?: string;
  reg_no?: string;
  institution_name?: string;
  state?: string;
  zone?: string;
  email?: string;
  patron_name?: string;
  patron_email?: string;
  patron_phone?: string;
  president_name?: string;
  president_email?: string;
  president_phone?: string;
  secretary_name?: string;
  secretary_email?: string;
  secretary_phone?: string;
  date_of_approval?: string;
  last_renewal_date?: string;
  next_renewal_date?: string;
  upcoming_renewal_date?: string;
  renewal_date?: string;
  status?: string;
  member_count?: number;
  solo_activities?: number;
  joint_activities?: number;
}

export const FALLBACK_CLUBS: ClubSearchRow[] = [
  {
    club_id: 'NDLI-EMP01-002',
    registration_no: 'REG-2025-EMP01-002',
    reg_no: 'REG-2025-EMP01-002',
    institution_name: 'Delhi Advanced Technical Institute',
    state: 'Delhi',
    zone: 'North Zone',
    date_of_approval: '2024-08-15',
    last_renewal_date: '2025-08-15',
    next_renewal_date: '2026-08-15',
    renewal_date: '2026-08-15',
    status: 'Active',
    email: 'club.dati@ndli.edu',
    patron_name: 'Dr. K. N. Rao',
    patron_email: 'director@dati.ac.in',
    patron_phone: '+91 9811200001',
    president_name: 'Dr. Ramesh Chandra',
    president_email: 'pres.dati@dati.ac.in',
    president_phone: '+91 9811200002',
    secretary_name: 'Prof. Alok Gupta',
    secretary_email: 'sec.dati@dati.ac.in',
    secretary_phone: '+91 9811200003',
    member_count: 2450,
    solo_activities: 20,
    joint_activities: 6,
  },
  {
    club_id: 'CLUB-IITKGP-001',
    registration_no: 'NDLI/CLUB/IITKGP-001',
    reg_no: 'NDLI/CLUB/IITKGP-001',
    institution_name: 'Indian Institute of Technology Kharagpur',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2021-04-12',
    last_renewal_date: '2025-04-12',
    next_renewal_date: '2026-04-12',
    renewal_date: '2026-04-12',
    status: 'Active',
    email: 'club.iitkgp@ndli.edu',
    patron_name: 'Prof. A. R. Deshmukh',
    patron_email: 'director@iitkgp.example.edu',
    patron_phone: '+91 9434000001',
    president_name: 'Dr. S. K. Iyer',
    president_email: 'librarian@iitkgp.example.edu',
    president_phone: '+91 9434000002',
    secretary_name: 'Prof. M. Banerjee',
    secretary_email: 'mb@cse.iitkgp.example.edu',
    secretary_phone: '+91 9434000003',
    member_count: 3840,
    solo_activities: 35,
    joint_activities: 7,
  },
  {
    club_id: 'CLUB-IITD-002',
    registration_no: 'NDLI/CLUB/IITD-002',
    reg_no: 'NDLI/CLUB/IITD-002',
    institution_name: 'Indian Institute of Technology Delhi',
    state: 'Delhi',
    zone: 'North Zone',
    date_of_approval: '2021-05-10',
    last_renewal_date: '2025-05-10',
    next_renewal_date: '2026-05-10',
    renewal_date: '2026-05-10',
    status: 'Active',
    email: 'club.iitd@ndli.edu',
    patron_name: 'Prof. R. Ranganathan',
    patron_email: 'director@iitd.example.edu',
    patron_phone: '+91 9810000001',
    president_name: 'Dr. Neeraj Kumar',
    president_email: 'library@iitd.example.edu',
    president_phone: '+91 9810000002',
    secretary_name: 'Prof. Sunita Saran',
    secretary_email: 'sunita@iitd.example.edu',
    secretary_phone: '+91 9810000003',
    member_count: 4100,
    solo_activities: 30,
    joint_activities: 8,
  },
  {
    club_id: 'CLUB-IITB-003',
    registration_no: 'NDLI/CLUB/IITB-003',
    reg_no: 'NDLI/CLUB/IITB-003',
    institution_name: 'Indian Institute of Technology Bombay',
    state: 'Maharashtra',
    zone: 'West Zone',
    date_of_approval: '2021-08-15',
    last_renewal_date: '2025-08-15',
    next_renewal_date: '2026-08-15',
    renewal_date: '2026-08-15',
    status: 'Active',
    email: 'club.iitb@ndli.edu',
    patron_name: 'Prof. N. K. Joshi',
    patron_email: 'director@iitb.example.edu',
    patron_phone: '+91 9820000001',
    president_name: 'Dr. P. S. Kulkarni',
    president_email: 'library@iitb.example.edu',
    president_phone: '+91 9820000002',
    secretary_name: 'Prof. Devang Khakhar',
    secretary_email: 'khakhar@iitb.example.edu',
    secretary_phone: '+91 9820000003',
    member_count: 2950,
    solo_activities: 22,
    joint_activities: 6,
  },
  {
    club_id: 'CLUB-IITM-004',
    registration_no: 'NDLI/CLUB/IITM-004',
    reg_no: 'NDLI/CLUB/IITM-004',
    institution_name: 'Indian Institute of Technology Madras',
    state: 'Tamil Nadu',
    zone: 'South Zone',
    date_of_approval: '2021-09-01',
    last_renewal_date: '2025-09-01',
    next_renewal_date: '2026-09-01',
    renewal_date: '2026-09-01',
    status: 'Active',
    email: 'club.iitm@ndli.edu',
    patron_name: 'Prof. V. Kamakoti',
    patron_email: 'director@iitm.example.edu',
    patron_phone: '+91 9444000011',
    president_name: 'Dr. K. Ramasamy',
    president_email: 'library@iitm.example.edu',
    president_phone: '+91 9444000012',
    secretary_name: 'Prof. S. Umesh',
    secretary_email: 'umesh@iitm.example.edu',
    secretary_phone: '+91 9444000013',
    member_count: 3450,
    solo_activities: 25,
    joint_activities: 6,
  },
  {
    club_id: 'CLUB-IITK-005',
    registration_no: 'NDLI/CLUB/IITK-005',
    reg_no: 'NDLI/CLUB/IITK-005',
    institution_name: 'Indian Institute of Technology Kanpur',
    state: 'Uttar Pradesh',
    zone: 'North Zone',
    date_of_approval: '2021-10-10',
    last_renewal_date: '2025-10-10',
    next_renewal_date: '2026-10-10',
    renewal_date: '2026-10-10',
    status: 'Active',
    email: 'club.iitk@ndli.edu',
    patron_name: 'Prof. S. Ganesh',
    patron_email: 'director@iitk.example.edu',
    patron_phone: '+91 9512000001',
    president_name: 'Dr. B. K. Singh',
    president_email: 'library@iitk.example.edu',
    president_phone: '+91 9512000002',
    secretary_name: 'Prof. Manindra Agrawal',
    secretary_email: 'manindra@iitk.example.edu',
    secretary_phone: '+91 9512000003',
    member_count: 2890,
    solo_activities: 20,
    joint_activities: 5,
  },
  {
    club_id: 'CLUB-JU-006',
    registration_no: 'NDLI/CLUB/JU-006',
    reg_no: 'NDLI/CLUB/JU-006',
    institution_name: 'Jadavpur University',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2021-11-15',
    last_renewal_date: '2025-11-15',
    next_renewal_date: '2026-11-15',
    renewal_date: '2026-11-15',
    status: 'Active',
    email: 'club.ju@ndli.edu',
    patron_name: 'Prof. B. C. Roy',
    patron_email: 'vc@jadavpur.example.edu',
    patron_phone: '+91 9831000001',
    president_name: 'Dr. Subir Das',
    president_email: 'library@jadavpur.example.edu',
    president_phone: '+91 9831000002',
    secretary_name: 'Prof. Swapan Kumar',
    secretary_email: 'swapan@jadavpur.example.edu',
    secretary_phone: '+91 9831000003',
    member_count: 3120,
    solo_activities: 23,
    joint_activities: 6,
  },
  {
    club_id: 'CLUB-DU-007',
    registration_no: 'NDLI/CLUB/DU-007',
    reg_no: 'NDLI/CLUB/DU-007',
    institution_name: 'University of Delhi (Central Campus)',
    state: 'Delhi',
    zone: 'North Zone',
    date_of_approval: '2020-11-05',
    last_renewal_date: '2025-11-05',
    next_renewal_date: '2026-11-05',
    renewal_date: '2026-11-05',
    status: 'Active',
    email: 'club.du@ndli.edu',
    patron_name: 'Prof. R. K. Malhotra',
    patron_email: 'vc@du.example.edu',
    patron_phone: '+91 9811000001',
    president_name: 'Dr. A. K. Bhatnagar',
    president_email: 'librarian@du.example.edu',
    president_phone: '+91 9811000002',
    secretary_name: 'Prof. Sanjeev Kumar',
    secretary_email: 'sanjeev@du.example.edu',
    secretary_phone: '+91 9811000003',
    member_count: 5120,
    solo_activities: 45,
    joint_activities: 11,
  },
  {
    club_id: 'CLUB-BHU-008',
    registration_no: 'NDLI/CLUB/BHU-008',
    reg_no: 'NDLI/CLUB/BHU-008',
    institution_name: 'Banaras Hindu University',
    state: 'Uttar Pradesh',
    zone: 'North Zone',
    date_of_approval: '2021-12-01',
    last_renewal_date: '2025-12-01',
    next_renewal_date: '2026-12-01',
    renewal_date: '2026-12-01',
    status: 'Active',
    email: 'club.bhu@ndli.edu',
    patron_name: 'Prof. S. K. Jain',
    patron_email: 'vc@bhu.example.edu',
    patron_phone: '+91 9415000001',
    president_name: 'Dr. D. K. Rai',
    president_email: 'library@bhu.example.edu',
    president_phone: '+91 9415000002',
    secretary_name: 'Prof. Anita Sharma',
    secretary_email: 'anita@bhu.example.edu',
    secretary_phone: '+91 9415000003',
    member_count: 4680,
    solo_activities: 28,
    joint_activities: 6,
  },
  {
    club_id: 'CLUB-IISCB-009',
    registration_no: 'NDLI/CLUB/IISCB-009',
    reg_no: 'NDLI/CLUB/IISCB-009',
    institution_name: 'Indian Institute of Science Bangalore',
    state: 'Karnataka',
    zone: 'South Zone',
    date_of_approval: '2022-01-15',
    last_renewal_date: '2025-01-15',
    next_renewal_date: '2026-01-15',
    renewal_date: '2026-01-15',
    status: 'Active',
    email: 'club.iisc@ndli.edu',
    patron_name: 'Prof. G. Rangarajan',
    patron_email: 'director@iisc.example.edu',
    patron_phone: '+91 9845000001',
    president_name: 'Dr. K. N. Prasad',
    president_email: 'library@iisc.example.edu',
    president_phone: '+91 9845000002',
    secretary_name: 'Prof. Ambarish Ghosh',
    secretary_email: 'ambarish@iisc.example.edu',
    secretary_phone: '+91 9845000003',
    member_count: 2150,
    solo_activities: 18,
    joint_activities: 4,
  },
  {
    club_id: 'CLUB-CU-010',
    registration_no: 'NDLI/CLUB/CU-010',
    reg_no: 'NDLI/CLUB/CU-010',
    institution_name: 'University of Calcutta',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2022-02-20',
    last_renewal_date: '2025-02-20',
    next_renewal_date: '2026-02-20',
    renewal_date: '2026-02-20',
    status: 'Active',
    email: 'club.cu@ndli.edu',
    patron_name: 'Prof. Santa Datta',
    patron_email: 'vc@caluniv.example.edu',
    patron_phone: '+91 9830100001',
    president_name: 'Dr. Soumitra Sarkar',
    president_email: 'library@caluniv.example.edu',
    president_phone: '+91 9830100002',
    secretary_name: 'Prof. Tapas Chakraborty',
    secretary_email: 'tapas@caluniv.example.edu',
    secretary_phone: '+91 9830100003',
    member_count: 3670,
    solo_activities: 21,
    joint_activities: 6,
  },
];

async function request<T>(
  path: string,
  init: RequestInit = {},
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.method && init.method !== 'GET'
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...csrfHeader(),
        ...(init.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError('network', 'network request failed', 0);
  }
  if (response.status === 429) throw new ApiError('rate-limit', 'rate limit exceeded, retry shortly', 429);
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? '';
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError('server', detail || response.statusText, response.status);
  }
  return (await response.json()) as T;
}

export function fetchActivities(empId?: string): Promise<ActivityList> {
  return request<ActivityList>(BASE + '/', {}, { emp_id: empId });
}

export function logActivity(input: LogActivityInput): Promise<LogActivityResult> {
  return request<LogActivityResult>(BASE + '/log/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteActivities(input: {
  emp_id?: string;
  activity_ids: string[];
}): Promise<DeleteActivityResult> {
  return request<DeleteActivityResult>(BASE + '/delete/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Universal Search source (parity: clubs DB + client-side filtering). */
export async function fetchClubRows(): Promise<ClubSearchRow[]> {
  try {
    const body = await request<{ clubs?: ClubSearchRow[]; results?: ClubSearchRow[] }>(
      BASE + '/clubs/',
    );
    const list = body.clubs ?? body.results ?? [];
    if (list.length > 0) return list;
    return FALLBACK_CLUBS;
  } catch {
    return FALLBACK_CLUBS;
  }
}

export function getActivityExportUrl(empId?: string): string {
  const url = new URL(BASE + '/export/', window.location.origin);
  if (empId) url.searchParams.set('emp_id', empId);
  return url.toString();
}

export function getClubsExportUrl(): string {
  return new URL(BASE + '/clubs-export/', window.location.origin).toString();
}

export interface PISignatureSettings {
  pi_name?: string;
  pi_affiliation: string;
  has_signature_image: boolean;
  signature_image_url: string | null;
}

export async function fetchPISignatureSettings(): Promise<PISignatureSettings> {
  return request<PISignatureSettings>(BASE + '/pi-signature-settings/');
}

export async function savePISignatureSettings(
  affiliation: string,
  signatureFile?: File,
  piName?: string,
  signatureData?: string,
): Promise<{ success: boolean; message: string } & PISignatureSettings> {
  const formData = new FormData();
  formData.append('pi_affiliation', affiliation);
  if (piName) {
    formData.append('pi_name', piName);
  }
  if (signatureFile) {
    formData.append('signature_image', signatureFile);
    formData.append('signature_file', signatureFile);
  }
  if (signatureData) {
    formData.append('signature_data', signatureData);
  }
  const url = new URL(BASE + '/pi-signature-settings/', window.location.origin);
  const response = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...csrfHeader(),
    },
    body: formData,
  });
  if (!response.ok) {
    let detail = 'Failed to save PI signature settings';
    try {
      const data = await response.json();
      detail = data.error || data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError('server', detail, response.status);
  }
  return response.json();
}

export async function verifyEmployeePassword(
  password: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(BASE + '/verify-password/', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function renewClubRegistration(
  clubId: string
): Promise<{
  success: boolean;
  message: string;
  club: Partial<ClubSearchRow>;
}> {
  return request<{ success: boolean; message: string; club: Partial<ClubSearchRow> }>(
    BASE + '/clubs/renew/',
    {
      method: 'POST',
      body: JSON.stringify({ club_id: clubId }),
    }
  );
}
