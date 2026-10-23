/**
 * NDLI Club Main Portal — typed client for the M4-D4 roster surface (M5-D4).
 *
 * Contract notes (backend: apps/members/roster_views.py + roster_csv.py):
 * - Read/write/import/export are CLUB-AUTHORITY only and mechanically scoped
 *   to the caller's own club (W6/W9): an out-of-scope row is a 404, never a
 *   payload. A student caller sees ONLY their own rows, so the UI must not
 *   assume the list is a whole-club roster.
 * - Inline edits are SINGLE-FIELD and optimistic-locked (P2): send the row's
 *   `version` with every write. A stale write is 409 `version_conflict` and
 *   the body carries the CURRENT row under `current` — the client must adopt
 *   it, never retry blindly and never silently overwrite (W6).
 * - The CSV contract is FROZEN (M4-A3 / P4): header must be exactly
 *   `name,email,phone,admission_no,program,batch_year,role`, comma delimited,
 *   RFC4180, UTF-8 (BOM tolerant), hard caps of 10k rows / 5 MB.
 * - `dry-run` is literally the commit pipeline with commit=False: NOTHING is
 *   written and its totals equal the commit's totals (W8 zero-silent-loss).
 *   `total == ok + errors + duplicates` ALWAYS. The UI shows the dry-run
 *   numbers as the preview and the job payload as the final truth — it never
 *   computes or infers a success count of its own.
 * - Commit is IDEMPOTENT on club + file sha256 (W7): re-committing the same
 *   bytes returns the recorded job with `replayed: true` and is a NO-OP.
 *   The UI must say so instead of claiming a fresh import.
 * - Every input row ends in exactly one fate: `ok`, `error` (with a `reason`
 *   code), or `duplicate`. `row_report` accounts for ALL of them — the UI
 *   renders the report, it never summarizes a row away.
 * - Formula cells (leading `= + - @` / tab / CR) are rejected per row on
 *   import and neutralized on export (P0 CSV-injection). Never strip the
 *   leading apostrophe off an exported cell in the UI.
 * - `reason` values below are DATA pinned to apps/members/roster_csv.py —
 *   rendered by their code, never recomputed into a friendlier count (P4).
 */

import { ApiError, ApiErrorKind } from './api';
import { csrfHeader } from './authApi';

export const MEMBERS_API_BASE = '/api/v1/members';

// --- Frozen CSV contract (apps/members/roster_csv.py) ----------------------

export const CONTRACT_COLUMNS = [
  'name',
  'email',
  'phone',
  'admission_no',
  'program',
  'batch_year',
  'role',
] as const;

export type ContractColumn = (typeof CONTRACT_COLUMNS)[number];

export const CONTRACT_DELIMITER = ',';

/** Hard caps advertised by the dry-run `contract` block (settings-backed). */
export interface CsvContract {
  columns: string[];
  delimiter: string;
  max_rows: number;
  max_bytes: number;
}

// --- Row payloads (roster_views._entry_payload) ----------------------------

export type RosterRole = 'member' | 'volunteer' | 'core_team';
export type RosterStatus = 'active' | 'alumni' | 'suspended';

export const ROSTER_ROLES: RosterRole[] = ['member', 'volunteer', 'core_team'];
export const ROSTER_STATUSES: RosterStatus[] = ['active', 'alumni', 'suspended'];

/**
 * The CLOSED status machine (models.RosterEntry.VALID_TRANSITIONS).
 * The SERVER is authoritative — a 409 `invalid_transition` returns `allowed`.
 * This mirror only drives which controls to show before a write.
 */
export const VALID_TRANSITIONS: Record<RosterStatus, RosterStatus[]> = {
  active: ['alumni', 'suspended'],
  suspended: ['active', 'alumni'],
  alumni: [],
};

/** Fields the server accepts in an inline edit (roster_views.EDITABLE_FIELDS). */
export const EDITABLE_FIELDS = [
  'name',
  'email',
  'phone',
  'admission_no',
  'program',
  'batch_year',
  'role',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** One roster row — the exact `_entry_payload` field set. */
export interface RosterEntry {
  id: number;
  club: string;
  name: string;
  email: string;
  phone: string;
  admission_no: string;
  program: string;
  batch_year: number | null;
  role: RosterRole;
  status: RosterStatus;
  version: number;
  updated_at: string;
  user_id: number | null;
}

export interface RosterPage {
  entries: RosterEntry[];
  count: number;
  total: number;
  offset: number;
  limit: number;
}

export interface RosterListQuery {
  status?: RosterStatus | '';
  limit?: number;
  offset?: number;
}

// --- Import job payloads (roster_views._job_payload) -----------------------

export type ImportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

/** One row's fate — `data` carries the parsed cells for ok rows. */
export interface RowReportRow {
  row: number;
  status: 'ok' | 'error' | 'duplicate';
  reason: string;
  key: string;
  data: Record<string, string | number | null>;
}

/** The W8 accounting identity: total == ok + errors + duplicates. */
export interface ImportTotals {
  total: number;
  ok: number;
  errors: number;
  duplicates: number;
}

export interface ImportJob {
  id: number;
  status: ImportJobStatus;
  idempotency_key: string;
  totals: ImportTotals;
  rows_processed: number;
  row_report: RowReportRow[];
  /** True when this commit was a NO-OP replay of an already-recorded job. */
  replayed: boolean;
}

export interface UploadReceipt {
  upload_id: string;
  sha256: string;
  size_bytes: number;
}

export interface DryRunResult {
  committed: false;
  totals: ImportTotals;
  rows: RowReportRow[];
  contract: CsvContract;
}

// --- Row-level reason codes (roster_csv.field_problems + RowOutcome) -------

/**
 * Stable reason codes exactly as emitted by the CSV contract. They are DATA:
 * the UI renders them by code and never invents a different verdict.
 */
export const CSV_REASONS = {
  wrong_column_count: 'Wrong column count',
  formula_cell: 'Formula cell rejected',
  name_required: 'Name is required',
  value_too_long: 'Value too long',
  bad_email: 'Email is not valid',
  bad_phone: 'Phone is not valid',
  bad_batch_year: 'Batch year is not valid',
  bad_role: 'Role is not one of the allowed values',
  missing_identity: 'Admission number or email is required',
  duplicate_existing: 'Already in this club roster',
  duplicate_in_file: 'Repeated inside this file',
  bad_header: 'Header must be exactly the template header',
  empty_file: 'File is empty',
  too_many_rows: 'File exceeds the row cap',
  malformed_csv: 'Malformed CSV',
  bad_encoding: 'File is not valid UTF-8',
  file_too_large: 'File exceeds the size cap',
  sync_limit_exceeded: 'File is too large for the sync runner',
  bad_upload_id: 'Unknown upload',
  upload_not_found: 'Unknown upload',
} as const;

/** Human label for a `reason` code; the code itself stays the source of truth. */
export function reasonLabel(reason: string): string {
  const base = reason.split(':')[0] as keyof typeof CSV_REASONS;
  const label = CSV_REASONS[base];
  if (label) return reason.includes(':') ? `${label} (${reason.split(':')[1]})` : label;
  return reason;
}

/** Contract-level verdicts pinned to roster_views / roster_csv error codes. */
export const ROSTER_ERRORS = {
  file_required: 'A CSV file is required.',
  unsupported_file: 'Only .csv files are accepted.',
  unknown_field: 'Unknown fields.',
  duplicate_entry: 'Another roster row already uses that value.',
  single_field_only: 'Edit exactly one field per request.',
  field_not_editable: 'That field cannot be edited inline.',
  version_required: 'A row version is required.',
  bad_updated_at: 'Unreadable updated_at.',
  version_conflict: 'The row changed since you loaded it.',
  invalid_transition: 'That status transition is not allowed.',
  network: 'network request failed',
} as const;

export class RosterApiError extends ApiError {
  /** The server's `code` (or null on a bare failure). Render `detail` verbatim. */
  readonly code: string | null;
  /** Present on 409 version_conflict / invalid_transition — adopt this row. */
  readonly current: RosterEntry | null;
  /** Present on 409 invalid_transition — the server's closed transition set. */
  readonly allowed: RosterStatus[] | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number,
    options: { detail?: string | null; code?: string | null; current?: RosterEntry | null; allowed?: RosterStatus[] | null } = {},
  ) {
    super(kind, options.detail ?? message, status);
    this.name = 'RosterApiError';
    this.code = options.code ?? null;
    this.current = options.current ?? null;
    this.allowed = options.allowed ?? null;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function bodyField(body: unknown, field: string): unknown {
  if (body !== null && typeof body === 'object' && field in body) {
    return (body as Record<string, unknown>)[field];
  }
  return undefined;
}

function detailOf(body: unknown): string | null {
  const detail = bodyField(body, 'detail');
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(String).join('\n');
  return null;
}

function toError(status: number, body: unknown): RosterApiError {
  const detail = detailOf(body);
  const code = bodyField(body, 'code');
  const current = bodyField(body, 'current');
  const allowed = bodyField(body, 'allowed');
  return new RosterApiError(status === 429 ? 'rate-limit' : 'server', detail ?? `unexpected status ${status}`, status, {
    detail,
    code: typeof code === 'string' ? code : null,
    current: (current && typeof current === 'object' ? current : null) as RosterEntry | null,
    allowed: Array.isArray(allowed) ? (allowed as RosterStatus[]) : null,
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...csrfHeader(),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new RosterApiError('network', ROSTER_ERRORS.network, 0);
  }
  const body = await parseBody(response);
  if (!response.ok) throw toError(response.status, body);
  return body as T;
}

// --- Roster rows -----------------------------------------------------------

/** GET /api/v1/members/roster/ — scoped rows (page cap: 1000). */
export function listRoster(query: RosterListQuery = {}): Promise<RosterPage> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  params.set('limit', String(query.limit ?? 1000));
  params.set('offset', String(query.offset ?? 0));
  return request<RosterPage>(`${MEMBERS_API_BASE}/roster/?${params.toString()}`);
}

/** POST /api/v1/members/roster/add/ — the single-row add (409 on clash). */
export function addRosterEntry(cells: Partial<Record<ContractColumn, string>>): Promise<RosterEntry> {
  return request<RosterEntry>(`${MEMBERS_API_BASE}/roster/add/`, {
    method: 'POST',
    body: JSON.stringify(cells),
  });
}

/** PATCH /api/v1/members/roster/<pk>/ — ONE field, optimistic-locked. */
export function patchRosterField(
  id: number,
  field: EditableField,
  value: string | null,
  version: number,
): Promise<RosterEntry> {
  return request<RosterEntry>(`${MEMBERS_API_BASE}/roster/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ field, value, version }),
  });
}

/** POST /api/v1/members/roster/<pk>/status/ — the closed transition set. */
export function changeRosterStatus(id: number, status: RosterStatus, version: number): Promise<RosterEntry> {
  return request<RosterEntry>(`${MEMBERS_API_BASE}/roster/${id}/status/`, {
    method: 'POST',
    body: JSON.stringify({ status, version }),
  });
}

// --- Bulk CSV import (upload -> dry-run -> commit -> job) ------------------

/** POST /api/v1/members/roster/import/upload/ — multipart, hash-stored. */
export function uploadRosterCsv(file: File): Promise<UploadReceipt> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadReceipt>(`${MEMBERS_API_BASE}/roster/import/upload/`, {
    method: 'POST',
    body: form,
  });
}

/** POST /api/v1/members/roster/import/dry-run/ — writes NOTHING (preview). */
export function dryRunRosterCsv(uploadId: string): Promise<DryRunResult> {
  return request<DryRunResult>(`${MEMBERS_API_BASE}/roster/import/dry-run/`, {
    method: 'POST',
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

/** POST /api/v1/members/roster/import/commit/ — idempotent (club + sha256). */
export function commitRosterCsv(uploadId: string): Promise<ImportJob> {
  return request<ImportJob>(`${MEMBERS_API_BASE}/roster/import/commit/`, {
    method: 'POST',
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

/** GET /api/v1/members/roster/import/jobs/<pk>/ — progress + row report. */
export function fetchImportJob(id: number): Promise<ImportJob> {
  return request<ImportJob>(`${MEMBERS_API_BASE}/roster/import/jobs/${id}/`);
}

// --- Downloads (template + export) ----------------------------------------

/**
 * GET .../import/template/ and .../export/ — the frozen header and the
 * formula-neutralized roster dump. Triggered as a real navigation so the
 * browser keeps the server's Content-Disposition.
 */
export function downloadRosterCsv(kind: 'template' | 'export'): void {
  const path =
    kind === 'template'
      ? `${MEMBERS_API_BASE}/roster/import/template/`
      : `${MEMBERS_API_BASE}/roster/export/`;
  window.location.assign(path);
}
