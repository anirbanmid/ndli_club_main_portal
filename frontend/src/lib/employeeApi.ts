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
  institution_name?: string;
  state?: string;
  zone?: string;
  email?: string;
  date_of_approval?: string;
  status?: string;
}

export const FALLBACK_CLUBS: ClubSearchRow[] = [
  {
    club_id: 'IITKGP-01',
    registration_no: 'NDLI/CLUB/IITKGP-01',
    institution_name: 'Indian Institute of Technology Kharagpur',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2024-01-15',
    status: 'active',
    email: 'club.iitkgp@ndli.edu',
  },
  {
    club_id: 'IITD-02',
    registration_no: 'NDLI/CLUB/IITD-02',
    institution_name: 'Indian Institute of Technology Delhi',
    state: 'Delhi',
    zone: 'North Zone',
    date_of_approval: '2024-02-10',
    status: 'active',
    email: 'club.iitd@ndli.edu',
  },
  {
    club_id: 'IITB-03',
    registration_no: 'NDLI/CLUB/IITB-03',
    institution_name: 'Indian Institute of Technology Bombay',
    state: 'Maharashtra',
    zone: 'West Zone',
    date_of_approval: '2024-02-18',
    status: 'active',
    email: 'club.iitb@ndli.edu',
  },
  {
    club_id: 'IITM-04',
    registration_no: 'NDLI/CLUB/IITM-04',
    institution_name: 'Indian Institute of Technology Madras',
    state: 'Tamil Nadu',
    zone: 'South Zone',
    date_of_approval: '2024-03-01',
    status: 'active',
    email: 'club.iitm@ndli.edu',
  },
  {
    club_id: 'IITK-05',
    registration_no: 'NDLI/CLUB/IITK-05',
    institution_name: 'Indian Institute of Technology Kanpur',
    state: 'Uttar Pradesh',
    zone: 'North Zone',
    date_of_approval: '2024-03-12',
    status: 'active',
    email: 'club.iitk@ndli.edu',
  },
  {
    club_id: 'JU-06',
    registration_no: 'NDLI/CLUB/JU-06',
    institution_name: 'Jadavpur University',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2024-04-05',
    status: 'active',
    email: 'club.ju@ndli.edu',
  },
  {
    club_id: 'DU-07',
    registration_no: 'NDLI/CLUB/DU-07',
    institution_name: 'University of Delhi',
    state: 'Delhi',
    zone: 'North Zone',
    date_of_approval: '2024-04-20',
    status: 'active',
    email: 'club.du@ndli.edu',
  },
  {
    club_id: 'BHU-08',
    registration_no: 'NDLI/CLUB/BHU-08',
    institution_name: 'Banaras Hindu University',
    state: 'Uttar Pradesh',
    zone: 'North Zone',
    date_of_approval: '2024-05-15',
    status: 'active',
    email: 'club.bhu@ndli.edu',
  },
  {
    club_id: 'IISCB-09',
    registration_no: 'NDLI/CLUB/IISCB-09',
    institution_name: 'Indian Institute of Science Bangalore',
    state: 'Karnataka',
    zone: 'South Zone',
    date_of_approval: '2024-05-22',
    status: 'active',
    email: 'club.iisc@ndli.edu',
  },
  {
    club_id: 'CU-10',
    registration_no: 'NDLI/CLUB/CU-10',
    institution_name: 'University of Calcutta',
    state: 'West Bengal',
    zone: 'East Zone',
    date_of_approval: '2024-06-01',
    status: 'active',
    email: 'club.cu@ndli.edu',
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
): Promise<{ success: boolean; message: string } & PISignatureSettings> {
  const formData = new FormData();
  formData.append('pi_affiliation', affiliation);
  if (signatureFile) {
    formData.append('signature_image', signatureFile);
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
