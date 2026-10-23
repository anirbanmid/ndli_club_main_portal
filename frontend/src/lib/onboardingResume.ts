/**
 * Resume capability store for the onboarding wizard (M5-D2).
 *
 * The client persists exactly ONE thing across reloads: the resume capability
 * (raw token + draft id) the API handed out at draft creation. The wizard
 * STATE itself never lives on the client (P4: the server draft is the single
 * source; the client keeps only what the current step needs).
 *
 * localStorage (not sessionStorage) so a browser restart can still resume —
 * the server bounds the capability anyway: the draft's resume token expires
 * after 72 hours (services.RESUME_TOKEN_TTL_HOURS) and every later step
 * re-validates it. Cleared on submit, on a 404/410 verdict, and on explicit
 * "start a new wizard".
 */

export interface ResumeCapability {
  token: string;
  draftId: string;
}

const RESUME_KEY = 'ndli.onboarding.resume';

/** Remember the capability. Storage failure is non-fatal (see peek). */
export function saveResumeCapability(capability: ResumeCapability): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(capability));
  } catch {
    // Storage unavailable — resume then works only via a pasted token (the
    // server draft still survives; nothing is lost, P5).
  }
}

/** Read the stored capability, or null. Malformed entries are dropped. */
export function peekResumeCapability(): ResumeCapability | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { token?: unknown }).token === 'string' &&
      typeof (parsed as { draftId?: unknown }).draftId === 'string'
    ) {
      return parsed as ResumeCapability;
    }
    window.localStorage.removeItem(RESUME_KEY);
    return null;
  } catch {
    return null;
  }
}

/** Drop the capability (submitted, expired, or user restarts the wizard). */
export function clearResumeCapability(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RESUME_KEY);
  } catch {
    // Ignore: a stale capability is refused by the server anyway.
  }
}
