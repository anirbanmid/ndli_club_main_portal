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
  institution_name?: string;
  state?: string;
  zone?: string;
  email?: string;
  date_of_approval?: string;
}

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
export function fetchClubRows(): Promise<ClubSearchRow[]> {
  return request<{ clubs?: ClubSearchRow[]; results?: ClubSearchRow[] }>(
    '/api/v1/clubs/showcase/',
  ).then((body) => body.clubs ?? body.results ?? []);
}
