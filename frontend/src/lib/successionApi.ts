/**
 * NDLI Club Main Portal — typed client for the dual-control Succession desk
 * (M2-A3, backend `apps.succession`).
 *
 * Two doors, mirroring the backend exactly:
 *   CLUB  GET/POST /api/v1/succession/               (club-authority session)
 *   CLUB  POST      /api/v1/succession/<id>/decide/  (Main Admins; executive tier)
 *   DESK  GET       /admin/api/v1/succession/desk/   (MFA'd employee session)
 *   DESK  POST      /admin/api/v1/succession/<id>/decide/ (duty-scoped officer)
 *
 * Contract notes:
 * - Out-of-scope IDs answer 404 — never data (P0). The UI surfaces the API's
 *   message verbatim; it never invents a distinction the API refuses to make.
 * - 409 `conflict_confirmation_required` (submission) and 409
 *   `conflict_changed` (approval) both carry `conflicts` — the re-verification
 *   payload the approver decides on.
 * - An approval response may carry `temporary_password` (brand-new account
 *   ONLY; existing accounts keep their credentials). Show it ONCE.
 * - Tier labels: the club UI speaks Title case ("Executive Member"); storage
 *   is always the canonical `AuthorityAssignment.Tier` value.
 */
import { ApiError } from './api';
import { csrfHeader } from './authApi';

export const SUCCESSION_API_BASE = '/api/v1/succession';
export const SUCCESSION_DESK_API_BASE = '/admin/api/v1/succession';

export type SuccessionTier = 'patron' | 'president' | 'secretary' | 'executive';
export type SuccessionStatus = 'pending' | 'approved' | 'rejected';
export type SuccessionDecision = 'approve' | 'reject';

/** An ACTIVE post the proposed email holds outside the target post. */
export interface SuccessionConflict {
  tier: string;
  club_code: string;
  club_name: string;
  institution_name: string;
  state_code: string;
  from_date: string;
}

/** One row of either door (list + detail share this shape). */
export interface SuccessionRow {
  id: string;
  club_code: string;
  club_name: string;
  state_code: string;
  tier: SuccessionTier;
  status: SuccessionStatus;
  proposed_name: string;
  proposed_email: string;
  proposed_phone: string;
  reason: string;
  conflicts: SuccessionConflict[];
  conflicts_confirmed: boolean;
  /** Display name of the CURRENT holder of the post (None if vacant). */
  current_holder?: string | null;
  submitted_by: string | null;
  created_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string;
  /** Decide-response extras: a brand-new account was provisioned. */
  account_created?: boolean;
  temporary_password?: string;
}

/** DRF page shape (PageNumberPagination), page size 20. */
export interface SuccessionPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: SuccessionRow[];
}

/**
 * A typed API failure that keeps the backend's machine `code` and the
 * `conflicts` extra payload — the two 409 flows the UI must distinguish.
 */
export class SuccessionApiError extends ApiError {
  readonly code: string;
  readonly conflicts: SuccessionConflict[];

  constructor(
    status: number,
    message: string,
    code = '',
    conflicts: SuccessionConflict[] = [],
  ) {
    super('server', message, status);
    this.name = 'SuccessionApiError';
    this.code = code;
    this.conflicts = conflicts;
  }
}

/** Canonical tier -> the club UI's label. */
export const TIER_LABELS: Record<SuccessionTier, string> = {
  patron: 'Patron',
  president: 'President',
  secretary: 'Secretary',
  executive: 'Executive Member',
};

/** The club UI's Title-case labels -> canonical tier value. */
export function roleToTier(role: string): string {
  const raw = String(role || '').trim().toLowerCase();
  if (raw === 'executive member' || raw === 'executive') return 'executive';
  if (raw.startsWith('patron')) return 'patron';
  if (raw === 'president') return 'president';
  if (raw === 'secretary') return 'secretary';
  return raw; // unknown spellings reach the backend, which answers invalid_tier
}

/** Canonical tier -> display label (unknown values pass through untouched). */
export function tierLabel(tier: string): string {
  return TIER_LABELS[tier as SuccessionTier] ?? tier;
}

/** Backend status -> the portal's established display strings. */
export function statusLabel(status: SuccessionStatus): string {
  if (status === 'approved') return 'Approved & Updated';
  if (status === 'rejected') return 'Rejected';
  return 'Pending Admin Review';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, window.location.origin);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.method && init.method !== 'GET'
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...csrfHeader(),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('network', 'network request failed', 0);
  }

  const body: unknown = await response.json().catch(() => ({}));
  if (response.status === 429) {
    throw new ApiError('rate-limit', 'rate limit exceeded, retry shortly', 429);
  }
  if (!response.ok) {
    const err = (body ?? {}) as {
      detail?: string;
      code?: string;
      conflicts?: SuccessionConflict[];
    };
    throw new SuccessionApiError(
      response.status,
      err.detail ?? `unexpected status ${response.status}`,
      err.code ?? '',
      Array.isArray(err.conflicts) ? err.conflicts : [],
    );
  }
  return body as T;
}

const get = <T,>(path: string): Promise<T> => request<T>(path, { method: 'GET' });

const post = <T,>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

// --- Club door ---------------------------------------------------------------

/** GET /api/v1/succession/ — the caller's own-club rows (server-scoped). */
export function fetchClubSuccession(): Promise<SuccessionPage> {
  return get<SuccessionPage>(`${SUCCESSION_API_BASE}/`);
}

export interface SubmitSuccessionInput {
  tier: string;
  name: string;
  email: string;
  phone?: string;
  reason: string;
  /** True only after the conflicts panel was explicitly confirmed. */
  confirmConflict?: boolean;
}

/**
 * POST /api/v1/succession/ — intake (six fields, nothing else accepted).
 * 409 `conflict_confirmation_required` arrives as SuccessionApiError with
 * `.conflicts` populated; re-submit with confirmConflict: true.
 */
export function submitSuccession(input: SubmitSuccessionInput): Promise<SuccessionRow> {
  return post<SuccessionRow>(`${SUCCESSION_API_BASE}/`, {
    tier: input.tier,
    name: input.name,
    email: input.email,
    phone: input.phone ?? '',
    reason: input.reason,
    confirm_conflict: Boolean(input.confirmConflict),
  });
}

/** POST /api/v1/succession/<id>/decide/ — in-club decision (executive tier). */
export function decideClubSuccession(
  id: string,
  decision: SuccessionDecision,
  note = '',
): Promise<SuccessionRow> {
  return post<SuccessionRow>(
    `${SUCCESSION_API_BASE}/${encodeURIComponent(id)}/decide/`,
    { decision, note },
  );
}

// --- Employee desk door ------------------------------------------------------

/** GET /admin/api/v1/succession/desk/ — duty-scoped rows (Central sees all). */
export function fetchSuccessionDesk(): Promise<SuccessionPage> {
  return get<SuccessionPage>(`${SUCCESSION_DESK_API_BASE}/desk/`);
}

/** POST /admin/api/v1/succession/<id>/decide/ — the officer's decision. */
export function decideDeskSuccession(
  id: string,
  decision: SuccessionDecision,
  note = '',
): Promise<SuccessionRow> {
  return post<SuccessionRow>(
    `${SUCCESSION_DESK_API_BASE}/${encodeURIComponent(id)}/decide/`,
    { decision, note },
  );
}
