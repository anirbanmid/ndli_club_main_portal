/**
 * NDLI Club Main Portal — typed client for the M4-D3 clubs surface (M5-D3).
 *
 * Contract notes (backend: apps/clubs/views.py + apps/clubs/services.py):
 * - The PUBLIC index is `GET /api/v1/clubs/showcase/` — there is NO
 *   `/api/v1/clubs/` and the UI must never ask for one. Detail is
 *   `GET /api/v1/clubs/showcase/<slug>/` (404 body: {"detail": "Not found."}).
 * - Both GETs are anonymous, throttled per IP (429 body: {"detail": …}) and
 *   carry `Cache-Control: public, max-age=60`.
 * - The join MUTATIONS live in lib/authApi.ts (requestJoinOtp / completeJoin,
 *   single source, M5-D1) and are NEVER auto-retried (P5). This module owns
 *   the D3 verdict pins (gate F6: byte-consistent verdict screens) and the
 *   bounded retry for the IDEMPOTENT GETs only.
 * - Error bodies on the join door carry {"detail", "code"} (ClubError); the
 *   UI renders `detail` VERBATIM (P4 — never recomputed, never translated).
 * - Join verdict strings below are DATA pinned to the server bytes
 *   (views.JOIN_OTP_ACCEPTED / services.ClubError messages), exactly like
 *   AUTH_VERDICTS (gate F2 precedent) — change the server, change these.
 */

import { ApiError, ApiErrorKind } from './api';

export const CLUBS_API_BASE = '/api/v1/clubs';

// --- Showcase payloads (public-safe aggregates, M4-A2) ---------------------

/** One showcase card in the index (ShowcaseIndexView cards). */
export interface ShowcaseCard {
  slug: string;
  tagline: string;
  club: { code: string; name: string };
  institution: { code: string; name: string };
  state: { code: string; name: string };
}

/** DRF page shape (PageNumberPagination) over the showcase index. */
export interface ShowcasePage {
  count: number;
  next: string | null;
  previous: string | null;
  results: ShowcaseCard[];
}

export interface ShowcaseSection {
  heading: string;
  body: string;
}

/** Public-safe membership COUNTS (domain_queries.roster_aggregates) — never rows. */
export interface RosterAggregates {
  members_total: number;
  members_active: number;
  alumni: number;
  members_suspended: number;
}

/** The full public showcase body (services.showcase_payload). */
export interface ShowcaseDetail {
  slug: string;
  tagline: string;
  about: string;
  club: { code: string; name: string; status: string };
  institution: { code: string; name: string };
  zone: { code: string; name: string };
  state: { code: string; name: string };
  district: { code: string; name: string } | null;
  sections: ShowcaseSection[];
  roster: RosterAggregates;
}

// --- Join verdict pins (DATA — rendered verbatim, never translated) --------

/**
 * Verdict strings exactly as emitted by the clubs join door (gate F6 pins).
 * Bytes come from apps/clubs/views.py (JOIN_OTP_ACCEPTED, _throttled) and
 * apps/clubs/services.py (ClubError messages + Throttled), plus the shared
 * accounts OTP verdicts (AUTH_VERDICTS in authApi.ts).
 */
export const JOIN_VERDICTS = {
  /** 202 POST /clubs/join/otp/request/ — fixed body, no enumeration (P0). */
  otpAccepted: 'If that address is reachable, a join code is on its way.',
  /** 201 POST /clubs/join/complete/ — the "joined" verdict sentence. */
  joined: 'Join requested; the club admin confirms it in the roster.',
  /** 409 code=already_member — membership row already exists. */
  alreadyMember: 'That account is already a member of this club.',
  /** 409 code=join_pending_exists — one pending request per (user, club). */
  joinPendingExists: 'A pending join request already exists for that account.',
  /** 403 — student_account_for_join refuses non-student identities. */
  nonStudent: 'That address belongs to a non-student account.',
  /** 400 code=credential_conflict. */
  credentialConflict: 'Provide either a passkey or a join link, not both.',
  /** 400 code=credential_missing. */
  credentialMissing: 'A passkey or join link is required.',
  /** 400 code=passkey_missing. */
  passkeyMissing: 'A passkey is required.',
  /** 400 code=passkey_invalid. */
  passkeyInvalid: 'That passkey is not valid.',
  /** 400 code=passkey_revoked. */
  passkeyRevoked: 'That passkey is no longer active.',
  /** 400 code=passkey_expired. */
  passkeyExpired: 'That passkey has expired.',
  /** 400 code=token_missing. */
  tokenMissing: 'A join link is required.',
  /** 400 code=token_invalid. */
  tokenInvalid: 'That join link is not valid.',
  /** 410 code=token_expired. */
  tokenExpired: 'That join link has expired.',
  /** 400 code=invalid_email (also the DRF ValidationError body). */
  invalidEmail: 'A valid email address is required.',
  /** 429 — services._throttle_club_attempt (per IP+club window). */
  throttleClub: 'Too many join attempts. Try again later.',
  /** 429 — views._throttled (per IP window). */
  throttleIp: 'Too many attempts. Try again later.',
} as const;

export type JoinVerdictMessage = (typeof JOIN_VERDICTS)[keyof typeof JOIN_VERDICTS];

/**
 * Verdict STATE the join UI may distinguish (the three verdict SCREENS of
 * BRIEF_M5 §3 D3 plus the inline failure families). Derived ONLY from the
 * server's exact bytes — the client invents no distinction of its own (P4).
 */
export type JoinFailureKind =
  | 'already'
  | 'ineligible'
  | 'credential'
  | 'code'
  | 'rate-limit'
  | 'network'
  | 'server';

/** F6 surface: classify a join failure by its exact `detail` bytes. */
export function classifyJoinFailure(detail: string | null): JoinFailureKind {
  switch (detail as JoinVerdictMessage | null) {
    case JOIN_VERDICTS.alreadyMember:
    case JOIN_VERDICTS.joinPendingExists:
      return 'already';
    case JOIN_VERDICTS.nonStudent:
      return 'ineligible';
    case JOIN_VERDICTS.credentialConflict:
    case JOIN_VERDICTS.credentialMissing:
    case JOIN_VERDICTS.passkeyMissing:
    case JOIN_VERDICTS.passkeyInvalid:
    case JOIN_VERDICTS.passkeyRevoked:
    case JOIN_VERDICTS.passkeyExpired:
    case JOIN_VERDICTS.tokenMissing:
    case JOIN_VERDICTS.tokenInvalid:
    case JOIN_VERDICTS.tokenExpired:
    case JOIN_VERDICTS.invalidEmail:
      return 'credential';
    default:
      return 'code';
  }
}

// --- Showcase client (idempotent GETs: bounded retry allowed, P5) ----------

/** Clubs API failure — `detail` carries the server verdict bytes when present. */
export class ClubsApiError extends ApiError {
  readonly detail: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number, detail: string | null = null) {
    super(kind, detail ?? message, status);
    this.name = 'ClubsApiError';
    this.detail = detail;
  }
}

function detailMessage(body: unknown): string | null {
  if (body !== null && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((item) => String(item)).join('\n');
  }
  return null;
}

/** Bounded backoff for the IDEMPOTENT GETs only (P5): 2 extra attempts. */
const GET_RETRY_ATTEMPTS = 2;
const GET_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getOnce<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ClubsApiError('network', 'network request failed', 0);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const detail = detailMessage(body);
  if (response.status === 429) {
    throw new ClubsApiError('rate-limit', 'rate limit exceeded, retry shortly', 429, detail);
  }
  if (!response.ok) {
    throw new ClubsApiError('server', `unexpected status ${response.status}`, response.status, detail);
  }
  return body as T;
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(CLUBS_API_BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  // Bounded self-healing (P5) for the idempotent GETs ONLY: transient
  // failures (network / 5xx) get a bounded backoff; every 4xx/429 verdict is
  // surfaced immediately and nothing re-fires without the user (mutations
  // NEVER retry — see authApi.join calls).
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= GET_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await getOnce<T>(url.toString());
    } catch (err) {
      lastError = err;
      const transient =
        err instanceof ClubsApiError &&
        (err.kind === 'network' || (err.kind === 'server' && err.status >= 500));
      if (!transient || attempt === GET_RETRY_ATTEMPTS) throw err;
      await delay(GET_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  // Unreachable (the loop always returns or throws), kept for strict TS.
  throw lastError;
}

/** GET /api/v1/clubs/showcase/?page= — the ONLY club index route. */
export function fetchShowcasePage(page = 1): Promise<ShowcasePage> {
  return getJson<ShowcasePage>('/showcase/', {
    page: page > 1 ? page : undefined,
  });
}

/** GET /api/v1/clubs/showcase/<slug>/ — one public showcase page. */
export function fetchShowcaseDetail(slug: string): Promise<ShowcaseDetail> {
  return getJson<ShowcaseDetail>(`/showcase/${encodeURIComponent(slug)}/`, {});
}

// --- Join-flow helpers (mutations live in authApi.ts) ----------------------

/**
 * The signed join token the club QR wraps (`/join#t=<token>` — the token is
 * in the URL FRAGMENT, never the query string). Returns '' when absent so
 * the caller falls back to the passkey/scan state.
 */
export function joinTokenFromHash(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('t');
  return token !== null ? token.trim() : '';
}

/**
 * Pull the join token out of a PASTED join link/URL (scanner-less desktop
 * path). Accepts a bare token, `/join#t=…`, or any URL whose fragment
 * carries `t=`. Returns '' when nothing usable is found.
 */
export function joinTokenFromPastedLink(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) return joinTokenFromHash(trimmed.slice(hashIndex));
  // No fragment: a bare token (nothing else to parse — never guessed).
  return /[/:?]/.test(trimmed) ? '' : trimmed;
}
