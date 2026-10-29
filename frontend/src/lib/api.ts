/**
 * NDLI Club Main Portal — typed client for the anonymous public API (M3).
 *
 * Single source for the three public endpoints (PLAN_ACCESS_ARCHITECTURE §6,
 * single origin):
 *   GET /api/v1/public/telemetry/?...
 *   GET /api/v1/public/directory/?q=&state=&district=&aishe=&page=
 *   GET /api/v1/public/verify/?id=
 *
 * Contract notes (backend: apps/public_api/views.py):
 * - verify returns BYTE-IDENTICAL bodies for unknown id / bad signature /
 *   malformed id ({six nulls, status "invalid"}) — the UI must never
 *   invent a distinction the API refuses to make (P0 anti-enumeration).
 * - verdicts are HTTP 200; only a missing `id` parameter is 400.
 * - throttle: 429 with {"detail": ...}; surface as a typed error, retry later.
 * - cache: the server sends Cache-Control/ETag; plain fetch honors them.
 */

export const PUBLIC_API_BASE = '/api/v1/public';

/** Verdict status — mirrors certificates.services.STATUS_*. */
export type VerifyStatus = 'valid' | 'revoked' | 'invalid';

/**
 * The six public disclosure fields + status (services.DISCLOSURE_FIELDS).
 * Exactly six: nothing else is ever disclosed publicly (M3-A4).
 */
export interface VerifyVerdict {
  name: string | null;
  club: string | null;
  institution: string | null;
  event_title: string | null;
  date: string | null;
  status: VerifyStatus;
}

export interface TelemetryStateRow {
  code: string;
  name: string;
  kind: string;
  zone: string;
  institutions: number;
  clubs: number;
  members: number;
}

export interface TelemetryTotals {
  states: number;
  institutions: number;
  clubs: number;
  members: number;
}

export interface TelemetryPayload {
  states: TelemetryStateRow[];
  totals: TelemetryTotals;
}

export interface DirectoryInstitution {
  code: string;
  name: string;
  aishe_code: string | null;
  state: { code: string; name: string };
  district: { code: string; name: string } | null;
}

/** DRF page shape (PageNumberPagination), page size 20 (DIRECTORY_PAGE_SIZE). */
export interface DirectoryPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: DirectoryInstitution[];
}

export interface DirectoryQuery {
  q?: string;
  state?: string;
  district?: string;
  aishe?: string;
  page?: number;
}

/** Typed failure modes the UI is allowed to distinguish. */
export type ApiErrorKind = 'rate-limit' | 'network' | 'server';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(kind: ApiErrorKind, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(PUBLIC_API_BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError('network', 'network request failed', 0);
  }

  if (response.status === 429) {
    throw new ApiError('rate-limit', 'rate limit exceeded, retry shortly', 429);
  }
  if (!response.ok) {
    throw new ApiError('server', `unexpected status ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** GET /api/v1/public/verify/?id= — one verdict, six fields, nothing else. */
export function verifyCertificate(
  id: string,
  extraParams?: { reg_no?: string; club_id?: string },
): Promise<VerifyVerdict> {
  return getJson<VerifyVerdict>('/verify/', {
    id,
    reg_no: extraParams?.reg_no,
    club_id: extraParams?.club_id,
  });
}

/** GET /api/v1/public/telemetry/ — State/UT breakdown (chart + table source). */
export function fetchTelemetry(): Promise<TelemetryPayload> {
  return getJson<TelemetryPayload>('/telemetry/', {});
}

/** GET /api/v1/public/directory/ — paginated institution search. */
export function searchDirectory(query: DirectoryQuery = {}): Promise<DirectoryPage> {
  return getJson<DirectoryPage>('/directory/', {
    q: query.q,
    state: query.state,
    district: query.district,
    aishe: query.aishe,
    page: query.page && query.page > 1 ? query.page : undefined,
  });
}
