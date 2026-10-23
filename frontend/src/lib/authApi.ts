/**
 * NDLI Club Main Portal — typed client for the M4 auth surface (M5-D1 login UI).
 *
 * Contract notes (backend: apps/accounts/views.py + apps/accounts/services.py):
 * - OTP request is enumeration-safe: the SAME 202 body comes back for known
 *   and unknown addresses ("If that address has an account, a code is on its
 *   way."). The UI must never claim otherwise (P0 anti-enumeration).
 * - OTP verify verdicts are BYTE-PINNED (gate F2): this client forwards the
 *   server's `detail` verbatim and the UI renders it verbatim. The client
 *   never rewrites, recomputes or invents a verdict (P4 single source).
 * - Verdict body shapes differ by exception type and must be normalised
 *   without losing bytes: DRF ValidationError bodies carry `detail` as a
 *   one-element LIST ({"detail": ["That code is not valid."]}), while
 *   Throttled / hand-built dict verdicts carry a plain STRING
 *   ({"detail": "Too many attempts. Try again in a minute."}). The accounts
 *   service raises `rest_framework.exceptions.ValidationError` (the Django
 *   one is imported aliased and never reaches the wire).
 * - Sessions ride the Django session cookie (auth_login server-side);
 *   fetches send credentials and the CSRF header when the cookie exists.
 * - The M4 accounts API is EMAIL+OTP and deliberately has NO SMS/phone
 *   delivery anywhere (apps/accounts/models.py) — the login identifier is an
 *   email address.
 * - The passkey/QR door (campus passkey code, e.g. KGP-7F2Q) is the
 *   passwordless path: POST /api/v1/clubs/join/otp/request/ -> OTP ->
 *   POST /api/v1/clubs/join/complete/. Full join choreography is D3; D1 owns
 *   the entry point + OTP roundtrip.
 */

import { ApiError, ApiErrorKind } from './api';

export const ACCOUNTS_API_BASE = '/api/v1/accounts';
export const CLUBS_API_BASE = '/api/v1/clubs';

/** Session/user summary — the exact `_session_payload` field set (never recounted). */
export interface SessionPayload {
  username: string;
  email: string;
  category: string;
  sub_role: string;
  account_state: string;
  must_change_password: boolean;
  institution_code: string;
  club_code: string;
}

/**
 * Verdict strings exactly as emitted by the accounts API (gate F2 pins).
 * These are DATA, not UI copy: they are rendered verbatim and never routed
 * through the i18n pipeline.
 */
export const AUTH_VERDICTS = {
  /** 202 POST /accounts/otp/request/ — identical for known + unknown addresses. */
  otpAccepted: 'If that address has an account, a code is on its way.',
  /** 400 POST /accounts/otp/verify/ — missing fields. */
  codeRequired: 'An email address and code are required.',
  /** 400 POST /accounts/otp/verify/ — wrong code or unknown code row. */
  codeInvalid: 'That code is not valid.',
  /** 400 POST /accounts/otp/verify/ — code past its lifetime. */
  codeExpired: 'That code has expired.',
  /** 429 — per-IP sliding window (both otp/request and otp/verify). */
  throttlePerIp: 'Too many attempts. Try again in a minute.',
  /** 429 — per-code lockout after repeated wrong attempts. */
  codeLocked: 'Too many attempts on this code. Try again later.',
  /** 429 — OTP send quota raised inside send_email_otp. */
  otpQuota: 'Too many verification codes requested. Try again later.',
  /** 200 POST /accounts/logout/. */
  signedOut: 'Signed out.',
} as const;

export type AuthVerdictMessage = (typeof AUTH_VERDICTS)[keyof typeof AUTH_VERDICTS];

/** Verdict STATE the UI may distinguish — derived from the pinned strings only. */
export type AuthVerdictKind =
  | 'accepted'
  | 'code-required'
  | 'code-invalid'
  | 'code-expired'
  | 'code-locked'
  | 'rate-limit'
  | 'signed-out'
  | 'unknown';

/** F2 unit surface: classify a server verdict by its exact bytes. */
export function classifyAuthVerdict(message: string): AuthVerdictKind {
  switch (message as AuthVerdictMessage) {
    case AUTH_VERDICTS.otpAccepted:
      return 'accepted';
    case AUTH_VERDICTS.codeRequired:
      return 'code-required';
    case AUTH_VERDICTS.codeInvalid:
      return 'code-invalid';
    case AUTH_VERDICTS.codeExpired:
      return 'code-expired';
    case AUTH_VERDICTS.codeLocked:
      return 'code-locked';
    case AUTH_VERDICTS.throttlePerIp:
    case AUTH_VERDICTS.otpQuota:
      return 'rate-limit';
    case AUTH_VERDICTS.signedOut:
      return 'signed-out';
    default:
      return 'unknown';
  }
}

/**
 * Normalise the `detail` field of an error/success body without losing bytes:
 * plain strings pass through; DRF ValidationError lists are joined with '\n'
 * (single-element lists are byte-identical to the message).
 */
export function detailMessage(body: unknown): string | null {
  if (body !== null && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((item) => String(item)).join('\n');
  }
  return null;
}

/**
 * Auth API failure. `detail` carries the server's verdict bytes (or null when
 * the body had none — e.g. a bare 500); `message` mirrors it for Error
 * compatibility. The UI renders `detail` verbatim when present.
 */
export class AuthApiError extends ApiError {
  readonly detail: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number, detail: string | null = null) {
    super(kind, detail ?? message, status);
    this.name = 'AuthApiError';
    this.detail = detail;
  }
}

/** CSRF header for session-authenticated mutations (cookie set by Django). */
export function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = /(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie);
  const token = match?.[1];
  return token ? { 'X-CSRFToken': decodeURIComponent(token) } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const detail = detailMessage(body);
  if (response.status === 429) {
    throw new AuthApiError('rate-limit', 'rate limit exceeded, retry shortly', 429, detail);
  }
  if (!response.ok) {
    throw new AuthApiError('server', `unexpected status ${response.status}`, response.status, detail);
  }
  return body as T;
}

async function postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...csrfHeader(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthApiError('network', 'network request failed', 0);
  }
  return parseResponse<T>(response);
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AuthApiError('network', 'network request failed', 0);
  }
  return parseResponse<T>(response);
}

/** POST /api/v1/accounts/otp/request/ — always the accepted verdict body (202). */
export function requestLoginOtp(email: string): Promise<{ detail: string }> {
  return postJson<{ detail: string }>(`${ACCOUNTS_API_BASE}/otp/request/`, { email });
}

/** POST /api/v1/accounts/otp/verify/ — consumes a code and opens the session. */
export function verifyLoginOtp(email: string, code: string): Promise<SessionPayload> {
  return postJson<SessionPayload>(`${ACCOUNTS_API_BASE}/otp/verify/`, { email, code });
}

/**
 * GET /api/v1/accounts/me/ — current session, or null when there is none
 * (401/403 = anonymous; anything else is a real failure and throws).
 */
export async function fetchSession(): Promise<SessionPayload | null> {
  try {
    return await getJson<SessionPayload>(`${ACCOUNTS_API_BASE}/me/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}

/** POST /api/v1/accounts/logout/ — ends the session ({"detail": "Signed out."}). */
export function signOut(): Promise<{ detail: string }> {
  return postJson<{ detail: string }>(`${ACCOUNTS_API_BASE}/logout/`, {});
}

/** Passkey/QR door input (campus passkey code + email, QR token when scanned). */
export interface JoinOtpInput {
  passkey: string;
  token: string;
  email: string;
}

export interface JoinCompleteInput extends JoinOtpInput {
  code: string;
}

/**
 * Join completion payload — the exact JoinCompleteView body (M5-D3).
 * Fields are rendered as returned (P4): the client never recomputes a
 * verdict from them; `detail` is the verdict sentence, byte-for-byte.
 */
export interface JoinResult {
  id: number;
  status: string;
  club: { code: string; name: string };
  detail: string;
}

/** POST /api/v1/clubs/join/otp/request/ — passkey/QR + email -> OTP (202 verdict). */
export function requestJoinOtp(input: JoinOtpInput): Promise<{ detail: string }> {
  return postJson<{ detail: string }>(`${CLUBS_API_BASE}/join/otp/request/`, {
    passkey: input.passkey,
    token: input.token,
    email: input.email,
  });
}

/** POST /api/v1/clubs/join/complete/ — OTP -> join request record. */
export function completeJoin(input: JoinCompleteInput): Promise<JoinResult> {
  return postJson<JoinResult>(`${CLUBS_API_BASE}/join/complete/`, {
    passkey: input.passkey,
    token: input.token,
    email: input.email,
    code: input.code,
  });
}
