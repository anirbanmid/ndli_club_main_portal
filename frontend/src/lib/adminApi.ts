/**
 * NDLI Club Main Portal — typed client for the ADMIN door (M6 D5).
 *
 * Every route lives under `/admin/api/v1/` because the admin prefix is the only
 * admin door (M1 T3 gate: admin-module routes must live under /admin/).
 *
 * Contract notes:
 * - All calls are authenticated: `credentials: 'include'` + the CSRF header
 *   from `authApi.csrfHeader()`, matching `rosterApi` exactly.
 * - Zone scoping is enforced server-side. A zone-bound officer who asks for
 *   another zone's data gets 404 — never data, never a distinguishable error.
 * - 429 is surfaced as `ApiError('rate-limit')`; the UI retries later, it never
 *   invents a distinction the API refuses to make.
 * - The hard reset is the red zone: it is typed here but MUST NOT be callable
 *   without the operator typing the confirm phrase in the UI.
 */
import { ApiError } from './api';
import { csrfHeader } from './authApi';

export const ADMIN_API_BASE = '/admin/api/v1';

/** The literal the red-zone UI forces the operator to type. */
export const HARD_RESET_CONFIRM_PHRASE = 'HARD-RESET-FOR-HANDOVER';

type Query = Record<string, string | number | undefined>;

async function request<T>(
  path: string,
  init: RequestInit = {},
  query: Query = {},
): Promise<T> {
  const url = new URL(
    path.startsWith('/api/') ? path : ADMIN_API_BASE + path,
    window.location.origin,
  );
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

  if (response.status === 429) {
    throw new ApiError('rate-limit', 'rate limit exceeded, retry shortly', 429);
  }
  if (!response.ok) {
    let detail = `unexpected status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* non-JSON body: keep the generic message */
    }
    throw new ApiError('server', detail, response.status);
  }
  return (await response.json()) as T;
}

const get = <T,>(path: string, query: Query = {}) =>
  request<T>(path, { method: 'GET' }, query);

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });

const put = <T,>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body ?? {}),
  });

// ---------------------------------------------------------------------------
// Dashboards (apps.analytics_reports) — GET /admin/api/v1/dashboards/…
// ---------------------------------------------------------------------------

export interface AuditRow {
  seq: number;
  timestamp: string;
  actor_label: string;
  action: string;
  outcome: string;
  object_type: string;
  object_id: string;
  zone_code: string;
}

export interface ZoneDashboard {
  zone_code: string;
  recent_audit: AuditRow[];
  [key: string]: unknown;
}

export interface OfficerEvaluation {
  [key: string]: unknown;
}

export interface OfficerRatings {
  zone_code: string;
  officers: OfficerEvaluation[];
}

export interface AuditFeed {
  zone_code: string;
  results: AuditRow[];
}

/** GET /admin/api/v1/dashboards/zone/ — derived metrics + audit tail. */
export function fetchZoneDashboard(params: {
  zone?: string;
  limit?: number;
} = {}): Promise<ZoneDashboard> {
  return get<ZoneDashboard>('/dashboards/zone/', params);
}

/** GET /admin/api/v1/dashboards/officers/ — ranked star ratings. */
export function fetchOfficerRatings(params: {
  zone?: string;
  year?: number;
  month?: number;
} = {}): Promise<OfficerRatings> {
  return get<OfficerRatings>('/dashboards/officers/', params);
}

/** GET /admin/api/v1/dashboards/audit/ — recent audit-trail activity. */
export function fetchAuditFeed(params: {
  zone?: string;
  limit?: number;
} = {}): Promise<AuditFeed> {
  return get<AuditFeed>('/dashboards/audit/', params);
}

// ---------------------------------------------------------------------------
// Governance (apps.governance) — charter desk + renewal desk + insights
// ---------------------------------------------------------------------------

export interface CharterRow {
  id: string;
  institution_name: string;
  club_name: string;
  zone_code: string;
  state_code: string;
  district_code: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_reason: string;
}

/** One authority row from the charter detail (metadata only). */
export interface CharterAuthority {
  role: string;
  full_name: string;
  email: string;
  phone: string;
  designation: string;
  otp_verified: boolean;
}

/** Upload metadata only — the bytes live behind the scoped upload endpoint. */
export interface CharterUpload {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface CharterDetail extends CharterRow {
  authorities: CharterAuthority[];
  uploads: CharterUpload[];
}

/** The charter state machine's exact literals (apps.governance.services). */
export type CharterDecision = 'review' | 'sanction' | 'reject';

export interface RenewalRecordRow {
  id: number;
  club_code: string;
  status: string;
  request_note: string;
  requested_at: string;
  decision_note: string;
  decided_at: string | null;
  certificate_id: string | null;
}

export interface RenewalAttentionRow {
  club_code: string;
  club_name: string;
  zone_code: string;
  formation_date: string;
  last_renewal_date: string | null;
  due_date: string;
  days_left: number;
  open_request_id?: number | null;
}

export interface RenewalAttention {
  results: RenewalAttentionRow[];
  [key: string]: unknown;
}

export interface InsightsReport {
  [key: string]: unknown;
}

/** GET /admin/api/v1/governance/charter/queue/ — pending charters. */
export function fetchCharterQueue(): Promise<{ results: CharterRow[] }> {
  return get<{ results: CharterRow[] }>('/governance/charter/queue/');
}

/** GET /admin/api/v1/governance/charter/<id>/ — row + authorities + uploads. */
export function fetchCharter(id: string): Promise<CharterDetail> {
  return get<CharterDetail>(`/governance/charter/${id}/`);
}

/**
 * POST /admin/api/v1/governance/charter/<id>/decision/ — one state-machine move.
 * Literals: 'review' | 'sanction' | 'reject'. The server owns the transition
 * table; an illegal move surfaces as an ApiError, never a silent no-op.
 */
export function decideCharter(
  id: string,
  body: { decision: CharterDecision; reason?: string },
): Promise<CharterRow> {
  return post<CharterRow>(`/governance/charter/${id}/decision/`, body);
}

/** GET /admin/api/v1/governance/renewals/attention/ — the <=30d desk. */
export function fetchRenewalAttention(params: {
  zone?: string;
} = {}): Promise<RenewalAttention> {
  return get<RenewalAttention>('/governance/renewals/attention/', params);
}

/** GET /admin/api/v1/governance/renewals/ — full renewal history. */
export function fetchRenewalHistory(params: {
  zone?: string;
  page?: number;
} = {}): Promise<{ results: RenewalRecordRow[] }> {
  return get<{ results: RenewalRecordRow[] }>('/governance/renewals/', params);
}

/** POST /admin/api/v1/governance/renewals/issue/ — Path B: issue directly. */
export function issueRenewalDirect(body: Record<string, unknown>): Promise<RenewalRecordRow> {
  return post<RenewalRecordRow>('/governance/renewals/issue/', body);
}

/** POST /admin/api/v1/governance/renewals/<id>/issue/ — Path A: issue request. */
export function issueRenewal(
  id: number,
  body: Record<string, unknown> = {},
): Promise<RenewalRecordRow> {
  return post<RenewalRecordRow>(`/governance/renewals/${id}/issue/`, body);
}

/** POST /admin/api/v1/governance/renewals/<id>/reject/ — reject a request. */
export function rejectRenewal(
  id: number,
  body: { reason: string },
): Promise<RenewalRecordRow> {
  return post<RenewalRecordRow>(`/governance/renewals/${id}/reject/`, body);
}

/** GET /admin/api/v1/governance/insights/report/ — MCC strategic report. */
export function fetchInsightsReport(params: {
  zone?: string;
} = {}): Promise<InsightsReport> {
  return get<InsightsReport>('/governance/insights/report/', params);
}

// ---------------------------------------------------------------------------
// Grievances (apps.grievances) — zone desk
// ---------------------------------------------------------------------------

export interface GrievanceRow {
  id: string;
  club_id: string;
  raised_by: string | null;
  subject: string;
  description: string;
  status: string;
  state_code: string;
  zone_code: string;
  resolved_at: string | null;
  resolved_by: string | null;
  reminder_due_at: string;
  admin_reminder_due_at: string;
  is_admin_escalated: boolean;
  escalated_at: string | null;
  created_at: string;
}

export interface SlaEventRow {
  kind: string;
  occurred_at: string;
  note: string;
}

export interface GrievanceDetail extends GrievanceRow {
  sla_events: SlaEventRow[];
}

export interface GrievanceQueue {
  results: GrievanceRow[];
  [key: string]: unknown;
}

/**
 * GET /admin/api/v1/grievances/queue/ — the caller's grievance queue.
 * Scope is the server's job (zone-bound officers see their duty set only);
 * the UI filters the returned rows by zone display-side.
 */
export function fetchGrievanceQueue(): Promise<GrievanceQueue> {
  return get<GrievanceQueue>('/grievances/queue/');
}

/** GET /admin/api/v1/grievances/<id>/ — ticket + SLA ledger. */
export function fetchGrievance(id: string): Promise<GrievanceDetail> {
  return get<GrievanceDetail>(`/grievances/${id}/`);
}

/**
 * POST /admin/api/v1/grievances/<id>/resolve/ — Resolved / Not Resolved mark.
 * Literals: 'resolved' | 'not_resolved' (a 'not_resolved' restarts the 7-day
 * recurrence cycle; a central actor's mark schedules the 30-day escalation).
 */
export function resolveGrievance(
  id: string,
  body: { decision: 'resolved' | 'not_resolved'; reason?: string },
): Promise<GrievanceRow> {
  return post<GrievanceRow>(`/grievances/${id}/resolve/`, body);
}

/** POST /admin/api/v1/grievances/sweep/ — the bounded SLA self-heal pass. */
export function sweepGrievances(): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/grievances/sweep/', {});
}

// ---------------------------------------------------------------------------
// RED ZONE (apps.data_admin) — destructive. Read the warning.
// ---------------------------------------------------------------------------

export interface HardResetResult {
  success: boolean;
  message: string;
  accounts_kept: number;
  rows_wiped: number;
  checkpoint_backup_id: string;
  wipe_manifest: Array<{ model: string; objects: number }>;
}

/**
 * POST /admin/api/v1/data/hard-reset/ — wipe all product data.
 *
 * RED ZONE. This is destructive and is meant for one moment only: handing the
 * system to the client as a clean, fresh product.
 *
 * The server independently enforces the triple-layer guard (confirm phrase ->
 * handover PIN -> Master Admin re-auth) and aborts if the safety checkpoint
 * cannot be written. This function is a thin pass-through; the UI must make
 * the operator type `HARD_RESET_CONFIRM_PHRASE` before it will even call.
 */
export function hardReset(input: {
  confirm: string;
  password: string;
  pin: string;
}): Promise<HardResetResult> {
  return post<HardResetResult>('/data/hard-reset/', input);
}

// ---------------------------------------------------------------------------
// Employee Management (apps.accounts) — GET/PUT /admin/api/v1/employees/…

export interface DutyState {
  code: string;
  name: string;
  zone: string;
}

export interface EmployeeDutyRow {
  id: number;
  username: string;
  name: string;
  email: string;
  state_codes: string[];
  states: DutyState[];
}

export interface SessionSummary {
  username: string;
  email: string;
  category: string;
  sub_role: string;
  account_state: string;
  must_change_password: boolean;
}

/** GET /api/v1/accounts/me/ — who am I (view-vs-edit gating). */
export function fetchSession(): Promise<SessionSummary> {
  return request<SessionSummary>('/api/v1/accounts/me/', { method: 'GET' });
}

/** GET /admin/api/v1/employees/ — employees + current duty sets. */
export function fetchEmployees(): Promise<{ results: EmployeeDutyRow[] }> {
  return get('/employees/');
}

/** GET /admin/api/v1/employees/states/ — the multi-select dropdown source. */
export function fetchDutyStates(): Promise<{ results: DutyState[] }> {
  return get('/employees/states/');
}

/** PUT /admin/api/v1/employees/<id>/duty/ — replace the duty SET (masters only). */
export function saveEmployeeDuty(
  officerId: number,
  states: string[],
): Promise<{
  officer: number;
  state_codes: string[];
  added: string[];
  removed: string[];
}> {
  return put(`/employees/${officerId}/duty/`, { states });
}
