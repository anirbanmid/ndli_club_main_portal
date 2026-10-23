/**
 * NDLI Club Main Portal — typed client for the M4 onboarding wizard API
 * (M5-D2: the 4-authority resumable onboarding wizard UI).
 *
 * Contract notes (backend: apps/onboarding/views.py + apps/onboarding/services.py):
 * - Every route except create/resume is capability-gated by the resume token
 *   (X-Onboarding-Token header). Only the SHA-256 of the token is stored
 *   server-side (P0); the RAW token is handed to the caller exactly once and
 *   is the capability for every later step — treat it like a password.
 * - The wizard state lives in the SERVER draft (P4 single source). This
 *   client never recomputes completion, verdicts or rules — it renders the
 *   draft payload as returned. Client-side validation exists ONLY as a
 *   pre-flight mirror of the server's upload rules (same rules, same verdict
 *   bytes) so a bad file is rejected before it wastes a mutation.
 * - Error bodies are {"detail": <string>, "code": <string>}. `detail` is
 *   rendered VERBATIM as data (F4 byte-consistency: never through the i18n
 *   pipeline, never paraphrased). `code` is machine data used for per-field
 *   mapping only.
 * - Mutations are NEVER auto-retried (P5 failure honesty): a failed mutation
 *   surfaces with a user-triggered retry; nothing re-fires on its own.
 * - Upload (W3 hardening): ONE combined document per draft (M4 owner decision
 *   2026-10-21: "ONE combined document (jpeg/pdf)" — charter + authority
 *   consents combined). Extension + claimed MIME + magic bytes must AGREE;
 *   size 1–10 MB; stored name is the content SHA-256 (never the user
 *   filename); bytes are served as attachments only, never inline.
 * - OTP endpoints are enumeration-safe: the send verdict is identical for
 *   reachable and unreachable addresses, and every verify failure currently
 *   collapses to one verdict on the wire (the view's broad handler).
 */

import { ApiError, ApiErrorKind } from './api';
import { csrfHeader, detailMessage } from './authApi';

export const ONBOARDING_API_BASE = '/api/v1/onboarding';

/** The four authority slots, in wizard order (M4-D2 W1). */
export const AUTHORITY_ROLES = ['patron', 'president', 'secretary', 'executive'] as const;
export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];

/** Draft payload — the wizard state, exactly as the API returns it. */
export interface AuthorityDraft {
  full_name: string;
  email: string;
  phone: string;
  designation: string;
  otp_verified: boolean;
}

export type DraftStatus = 'draft' | 'submitted' | 'expired';

export interface DraftPayload {
  id: string;
  institution_name: string;
  aishe_code: string;
  club_name: string;
  zone_code: string;
  state_code: string;
  district_code: string;
  status: DraftStatus;
  authorities: Partial<Record<AuthorityRole, AuthorityDraft>>;
  document_uploaded: boolean;
}

/** 201 POST /onboarding/drafts/ — the payload plus the RAW resume token (once). */
export interface DraftCreated extends DraftPayload {
  resume_token: string;
}

export interface IdentityInput {
  institution_name: string;
  aishe_code: string;
  club_name: string;
  zone_code: string;
  state_code: string;
  district_code: string;
}

export interface AuthorityInput {
  full_name: string;
  email: string;
  phone: string;
  designation: string;
}

/** 201 POST .../submit/ — the charter-queue row (M4 stops at enqueue). */
export interface SubmitResult {
  application_id: string;
  status: string;
}

/**
 * Verdict strings exactly as emitted by the onboarding API. These are DATA,
 * not UI copy: rendered verbatim, never routed through the i18n pipeline.
 */
export const ONBOARDING_VERDICTS = {
  /** 202/200 otp/send — identical for reachable + unreachable addresses. */
  otpSent: 'If that address is reachable, a code is on its way.',
  /** 429 — every per-IP sliding window (create/resume/otp/upload/submit). */
  throttled: 'Too many attempts. Try again in a minute.',
  /** 400 — resume without a token. */
  missingToken: 'A resume token is required.',
  /** 404 — unknown capability, or a draft id that does not match the token. */
  draftNotFound: 'Draft not found.',
  /** 410 — draft already submitted. */
  draftClosed: 'This draft is no longer editable.',
  /** 410 — resume-token TTL (72 h) passed; the server marks the draft expired. */
  draftExpired: 'This draft has expired. Start a new one.',
  /** 409 — one active draft per club. */
  draftExists: 'A draft already exists for this club.',
  /** 404 — unknown authority role, or a role slot that was never saved. */
  unknownRole: 'Unknown authority role.',
  /** 404 — the role slot has no row yet (otp/send + otp/verify). */
  authorityStepNotFound: 'Authority step not found.',
  /** 400 — upsert without an email. */
  emailRequired: 'An email is required.',
  /** 400 — upsert email present but not a deliverable address (DEC4). */
  emailInvalid: 'A valid email address is required.',
  /** 400 — upsert without a phone (DEC4: every authority is contactable). */
  phoneRequired: 'An Indian mobile number is required.',
  /** 400 — phone present but not a 10-digit Indian mobile (DEC4). */
  phoneInvalid: 'The mobile number must be a 10-digit Indian number.',
  /** 400 — upsert without a designation (DEC4: mandatory, not optional). */
  designationRequired: 'A designation is required.',
  /** 400 — upload without a file part. */
  missingFile: 'No document supplied.',
  /** 400 — extension outside {.pdf, .jpg, .jpeg}. */
  badExtension: 'Only .pdf/.jpg/.jpeg documents are accepted.',
  /** 400 — claimed MIME outside {application/pdf, image/jpeg}. */
  badMimeType: 'Only PDF or JPEG documents are accepted.',
  /** 400 — size outside 1–10 MB. */
  badSize: 'The document must be 1-10 MB.',
  /** 400 — magic bytes disagree with the claimed MIME (W3). */
  mimeMismatch: 'The document content does not match its declared type.',
  /** 400 — submit while an authority slot or the document is missing. */
  draftIncomplete:
    'Every authority step must be OTP-verified and the document uploaded before submitting.',
  /** 409 — one charter application per club. */
  applicationExists: 'An application for this club is already queued.',
  /** 400 — every otp/verify failure currently collapses to this wire verdict. */
  badCode: 'That code is not valid.',
} as const;

/** Machine codes the API emits (drives per-field mapping; unknown codes pass through). */
export type OnboardingErrorCode =
  | 'throttled'
  | 'missing_field'
  | 'invalid_field'
  | 'draft_exists'
  | 'missing_token'
  | 'draft_not_found'
  | 'draft_closed'
  | 'draft_expired'
  | 'unknown_role'
  | 'missing_file'
  | 'bad_extension'
  | 'bad_mime'
  | 'bad_size'
  | 'mime_mismatch'
  | 'bad_code'
  | 'draft_incomplete'
  | 'application_exists';

/**
 * Onboarding API failure. `detail` carries the server's verdict bytes (or
 * null when the body had none — e.g. a bare 500); `code` is the machine
 * code. The UI renders `detail` verbatim when present.
 */
export class OnboardingApiError extends ApiError {
  readonly detail: string | null;
  readonly code: OnboardingErrorCode | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number,
    detail: string | null = null,
    code: OnboardingErrorCode | null = null,
  ) {
    super(kind, detail ?? message, status);
    this.name = 'OnboardingApiError';
    this.detail = detail;
    this.code = code;
  }
}

function errorCodeOf(body: unknown): OnboardingErrorCode | null {
  if (body !== null && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === 'string') return code as OnboardingErrorCode;
  }
  return null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const detail = detailMessage(body);
  const code = errorCodeOf(body);
  if (response.status === 429) {
    throw new OnboardingApiError('rate-limit', 'rate limit exceeded, retry shortly', 429, detail, code);
  }
  if (!response.ok) {
    throw new OnboardingApiError('server', `unexpected status ${response.status}`, response.status, detail, code);
  }
  return body as T;
}

function tokenHeaders(token: string): Record<string, string> {
  return { 'X-Onboarding-Token': token, ...csrfHeader() };
}

async function postJson<T>(path: string, payload: Record<string, unknown>, token: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token !== null ? tokenHeaders(token) : csrfHeader()),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new OnboardingApiError('network', 'network request failed', 0);
  }
  return parseResponse<T>(response);
}

// --- Wizard lifecycle -------------------------------------------------------

/** POST /api/v1/onboarding/drafts/ — start the wizard (returns the raw token ONCE). */
export function createDraft(input: IdentityInput): Promise<DraftCreated> {
  return postJson<DraftCreated>(`${ONBOARDING_API_BASE}/drafts/`, { ...input }, null);
}

/** POST /api/v1/onboarding/drafts/resume/ — resolve the capability back to the draft. */
export function resumeDraft(token: string): Promise<DraftPayload> {
  return postJson<DraftPayload>(`${ONBOARDING_API_BASE}/drafts/resume/`, { token }, null);
}

/** POST /api/v1/onboarding/drafts/<id>/identity/ — identity step (partial updates safe). */
export function updateIdentity(draftId: string, token: string, input: IdentityInput): Promise<DraftPayload> {
  return postJson<DraftPayload>(`${ONBOARDING_API_BASE}/drafts/${draftId}/identity/`, { ...input }, token);
}

// --- Authority slots --------------------------------------------------------

/** POST .../authorities/<role>/ — save one authority slot. */
export function upsertAuthority(
  draftId: string,
  token: string,
  role: AuthorityRole,
  input: AuthorityInput,
): Promise<DraftPayload> {
  return postJson<DraftPayload>(
    `${ONBOARDING_API_BASE}/drafts/${draftId}/authorities/${role}/`,
    { ...input },
    token,
  );
}

/** POST .../authorities/<role>/otp/send/ — enumeration-safe send verdict. */
export function sendAuthorityOtp(
  draftId: string,
  token: string,
  role: AuthorityRole,
): Promise<{ detail: string }> {
  return postJson<{ detail: string }>(
    `${ONBOARDING_API_BASE}/drafts/${draftId}/authorities/${role}/otp/send/`,
    {},
    token,
  );
}

/** POST .../authorities/<role>/otp/verify/ — pass the step (marks otp_verified). */
export function verifyAuthorityOtp(
  draftId: string,
  token: string,
  role: AuthorityRole,
  code: string,
): Promise<DraftPayload> {
  return postJson<DraftPayload>(
    `${ONBOARDING_API_BASE}/drafts/${draftId}/authorities/${role}/otp/verify/`,
    { code },
    token,
  );
}

// --- Upload (W3) ------------------------------------------------------------

/** Server upload rules (services.py tunables) — the client mirrors these EXACTLY. */
export const UPLOAD_RULES: {
  minBytes: number;
  maxBytes: number;
  extensions: readonly string[];
  mimeMagic: Record<string, readonly number[]>;
} = {
  minBytes: 1,
  maxBytes: 10 * 1024 * 1024,
  extensions: ['.pdf', '.jpg', '.jpeg'],
  /** Claimed MIME -> magic-byte prefixes that must match the content (W3). */
  mimeMagic: {
    'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
    'image/jpeg': [0xff, 0xd8, 0xff],
  },
};

/**
 * A pre-flight rejection. `server-rule` rejections carry the byte-identical
 * verdict the server would emit (rendered verbatim); `ui-rule` rejections are
 * client-only constraints (rendered through the i18n pipeline).
 */
export type UploadRejection =
  | { source: 'server-rule'; code: OnboardingErrorCode; detail: string }
  | { source: 'ui-rule'; key: string };

export type UploadCheck = { ok: true } | ({ ok: false } & UploadRejection);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function magicAgrees(head: Uint8Array, magic: readonly number[]): boolean {
  if (head.length < magic.length) return false;
  return magic.every((byte, index) => head[index] === byte);
}

/**
 * Mirror of services.store_combined_document: same rule ORDER, same verdict
 * bytes — extension, claimed MIME, size, then magic-byte agreement.
 */
export function checkCombinedDocument(file: { name: string; type: string; size: number }, head: Uint8Array): UploadCheck {
  const claimed = file.type.split(';')[0].trim().toLowerCase();
  if (!UPLOAD_RULES.extensions.includes(extensionOf(file.name))) {
    return { ok: false, source: 'server-rule', code: 'bad_extension', detail: ONBOARDING_VERDICTS.badExtension };
  }
  const magic = UPLOAD_RULES.mimeMagic[claimed];
  if (magic === undefined) {
    return { ok: false, source: 'server-rule', code: 'bad_mime', detail: ONBOARDING_VERDICTS.badMimeType };
  }
  if (file.size <= 0 || file.size > UPLOAD_RULES.maxBytes) {
    return { ok: false, source: 'server-rule', code: 'bad_size', detail: ONBOARDING_VERDICTS.badSize };
  }
  if (!magicAgrees(head, magic)) {
    return { ok: false, source: 'server-rule', code: 'mime_mismatch', detail: ONBOARDING_VERDICTS.mimeMismatch };
  }
  return { ok: true };
}

/** First 8 bytes of a file — enough for the magic-byte agreement (W3). */
export async function readFileHead(file: File): Promise<Uint8Array> {
  const buffer = await file.slice(0, 8).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * POST /api/v1/onboarding/drafts/<id>/upload/ — the ONE combined document.
 * Re-uploading replaces the stored file (the server keeps one per draft).
 */
export async function uploadDocument(draftId: string, token: string, file: File): Promise<DraftPayload> {
  const form = new FormData();
  form.append('document', file);
  let response: Response;
  try {
    response = await fetch(`${ONBOARDING_API_BASE}/drafts/${draftId}/upload/`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', ...tokenHeaders(token) },
      body: form,
    });
  } catch {
    throw new OnboardingApiError('network', 'network request failed', 0);
  }
  return parseResponse<DraftPayload>(response);
}

/**
 * GET .../upload/document/ — W3: the stored bytes come back as an attachment
 * (never inline). Triggered as a user download; the server's filename is the
 * content SHA-256.
 */
export async function downloadStoredDocument(draftId: string, token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${ONBOARDING_API_BASE}/drafts/${draftId}/upload/document/`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/octet-stream', ...tokenHeaders(token) },
    });
  } catch {
    throw new OnboardingApiError('network', 'network request failed', 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new OnboardingApiError(
      'server',
      `unexpected status ${response.status}`,
      response.status,
      detailMessage(body),
      errorCodeOf(body),
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match?.[1] ?? 'onboarding-document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// --- Submission -------------------------------------------------------------

/** POST /api/v1/onboarding/drafts/<id>/submit/ — charter queue (M4 stops at enqueue). */
export function submitDraft(draftId: string, token: string): Promise<SubmitResult> {
  return postJson<SubmitResult>(`${ONBOARDING_API_BASE}/drafts/${draftId}/submit/`, {}, token);
}

// --- Per-field verdict mapping (F4 surface) ---------------------------------

/**
 * Map a server verdict onto the field it rejects. The verdict BYTES pass
 * through untouched (F4 renders server verdicts verbatim per field); a
 * verdict that maps to no field returns {} and is rendered as a banner.
 */
export function onboardingFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof OnboardingApiError) || err.detail === null) return {};
  const detail = err.detail;
  if (detail === ONBOARDING_VERDICTS.emailRequired) return { email: detail };
  if (detail === ONBOARDING_VERDICTS.phoneRequired) return { phone: detail };
  if (detail === ONBOARDING_VERDICTS.phoneInvalid) return { phone: detail };
  if (detail === ONBOARDING_VERDICTS.badCode) return { code: detail };
  if (detail === ONBOARDING_VERDICTS.missingToken) return { token: detail };
  // update_identity verdicts embed the field key: "<field> cannot be empty."
  const identity = /^([a-z_]+) cannot be empty\.$/.exec(detail);
  if (identity !== null) return { [identity[1]]: detail };
  // create_draft verdicts embed the label: "A <label> is required."
  const create = /^A (.+) is required\.$/.exec(detail);
  if (create !== null) {
    const labelToField: Record<string, string> = {
      'institution name': 'institution_name',
      'club name': 'club_name',
      'zone code': 'zone_code',
      'state code': 'state_code',
      'district code': 'district_code',
      // DEC4 verdicts that keep the "A <label> is required." shape and so
      // resolve onto the field they reject.
      'valid email address': 'email',
      designation: 'designation',
    };
    const field = labelToField[create[1]];
    if (field !== undefined) return { [field]: detail };
  }
  if (
    err.code === 'missing_file' ||
    err.code === 'bad_extension' ||
    err.code === 'bad_mime' ||
    err.code === 'bad_size' ||
    err.code === 'mime_mismatch'
  ) {
    return { document: detail };
  }
  return {};
}
