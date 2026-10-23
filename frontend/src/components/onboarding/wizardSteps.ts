/**
 * Onboarding wizard step model (M5-D2) — an explicit state machine VIEW of
 * the server draft (BRIEF_M5 §4a / P3: no god-store).
 *
 * Step completion is NEVER recomputed from client data: every `isStepComplete`
 * answer is derived from the draft payload the API just returned (P4 single
 * source). "Resume where you left off" = the first step the server draft
 * marks incomplete.
 */

import { AUTHORITY_ROLES, AuthorityRole, DraftPayload, OnboardingApiError } from '../../lib/onboardingApi';
import { t } from '../../i18n';

export type WizardStep =
  | { kind: 'identity' }
  | { kind: 'authority'; role: AuthorityRole }
  | { kind: 'document' }
  | { kind: 'review' };

export const WIZARD_STEPS: readonly WizardStep[] = [
  { kind: 'identity' },
  ...AUTHORITY_ROLES.map((role): WizardStep => ({ kind: 'authority', role })),
  { kind: 'document' },
  { kind: 'review' },
];

export function stepKey(step: WizardStep): string {
  return step.kind === 'authority' ? `authority:${step.role}` : step.kind;
}

const ROLE_LABEL_KEYS: Record<AuthorityRole, string> = {
  patron: 'Patron',
  president: 'President',
  secretary: 'Secretary',
  executive: 'Executive',
};

export function roleLabel(role: AuthorityRole): string {
  return t(ROLE_LABEL_KEYS[role]);
}

export function stepLabel(step: WizardStep): string {
  switch (step.kind) {
    case 'identity':
      return t('Institution & club identity');
    case 'authority':
      return t('Authority: {{role}}', { role: roleLabel(step.role) });
    case 'document':
      return t('Supporting documents');
    case 'review':
      return t('Review & submit');
    default:
      return '';
  }
}

/**
 * Server-flag rendering only: what the API's draft payload says about each
 * step. The submit gate itself is enforced server-side (draft_is_complete).
 */
export function isStepComplete(step: WizardStep, draft: DraftPayload): boolean {
  switch (step.kind) {
    case 'identity':
      // The draft exists, so identity is stored (create_draft requires it).
      return true;
    case 'authority':
      return draft.authorities[step.role]?.otp_verified === true;
    case 'document':
      return draft.document_uploaded;
    case 'review':
      return draft.status === 'submitted';
    default:
      return false;
  }
}

/** Where a resumed wizard lands: the first step the server draft marks open. */
export function firstIncompleteStep(draft: DraftPayload): WizardStep {
  for (const step of WIZARD_STEPS) {
    if (!isStepComplete(step, draft)) return step;
  }
  return { kind: 'review' };
}

/** Steps the server draft still marks open — the "partial" terminal listing. */
export function incompleteSteps(draft: DraftPayload): WizardStep[] {
  return WIZARD_STEPS.filter((step) => !isStepComplete(step, draft));
}

// --- Shared mutation failure states (P5: surfaced, never auto-retried) -------

export type WizardFlowError =
  | { kind: 'verdict' | 'rate-limit'; message: string }
  | { kind: 'network' | 'server' };

/** Map any thrown value onto the UI's honest error states. */
export function flowErrorFrom(err: unknown): WizardFlowError {
  if (err instanceof OnboardingApiError) {
    if (err.kind === 'network') return { kind: 'network' };
    if (err.kind === 'rate-limit') return { kind: 'rate-limit', message: err.detail ?? err.message };
    if (err.detail !== null) return { kind: 'verdict', message: err.detail };
    return { kind: 'server' };
  }
  return { kind: 'server' };
}

/**
 * Render a failure. Owner-locked 2026-10-23 (DEC2): API verdicts are routed
 * THROUGH the i18n dictionary via t() so they can translate (aligned with D1/D3).
 * i18next t() is a passthrough for untranslated keys, so in English the bytes
 * still match the API's; a loaded catalogue yields the translation. Chrome
 * failures use t() as before.
 */
export function flowErrorText(error: WizardFlowError): string {
  switch (error.kind) {
    case 'verdict':
    case 'rate-limit':
      return t(error.message);
    case 'network':
      return t('Network request failed. Check your connection and try again.');
    case 'server':
    default:
      return t('Server error. Try again later.');
  }
}
