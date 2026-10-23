import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  FileWarning,
  Loader2,
  Send,
  WifiOff,
} from 'lucide-react';
import { t } from '../../i18n';
import {
  AUTHORITY_ROLES,
  AuthorityRole,
  createDraft,
  DraftPayload,
  IdentityInput,
  onboardingFieldErrors,
  ONBOARDING_VERDICTS,
  OnboardingApiError,
  resumeDraft,
  SubmitResult,
  submitDraft,
  updateIdentity,
} from '../../lib/onboardingApi';
import {
  clearResumeCapability,
  peekResumeCapability,
  saveResumeCapability,
} from '../../lib/onboardingResume';
import type { AppRoute } from '../../lib/route';
import { AuthorityStepForm } from './AuthorityStepForm';
import { DocumentStep } from './DocumentStep';
import { IdentityForm } from './IdentityForm';
import {
  firstIncompleteStep,
  flowErrorFrom,
  flowErrorText,
  incompleteSteps,
  isStepComplete,
  roleLabel,
  stepKey,
  stepLabel,
  WizardFlowError,
  WIZARD_STEPS,
  WizardStep,
} from './wizardSteps';

/**
 * M5-D2: the 4-authority resumable onboarding wizard (maps to M4-D2 W1–W3;
 * resume gate F3, per-field verdict gate F4).
 *
 * The wizard is an explicit state-machine VIEW of the SERVER draft (P3/P4):
 * - The server draft is the single source. The client persists only the
 *   resume capability (token + draft id); every step's completion, verdict
 *   and rule is rendered from the draft payload the API just returned.
 * - "Resume where you left off" = the first step the server draft marks
 *   incomplete — re-derived on every re-entry (F3).
 * - Terminal states: success (charter application queued) · partial (server-
 *   rejected fields rendered per-field with the API's verdict bytes, F4) ·
 *   recoverable errors (surfaced with a MANUAL retry; mutations never
 *   auto-fire, P5) · expired/not-found drafts (server 404/410 verdicts).
 * - All UI chrome goes through t(); server verdicts render VERBATIM as data.
 */

interface OnboardingWizardViewProps {
  /** Navigate to a resolved in-app route (App wires this to branch/tab state). */
  onNavigate?: (route: AppRoute) => void;
}

type Phase = 'boot' | 'start' | 'wizard' | 'closed';

interface ClosedState {
  kind: 'submitted' | 'expired' | 'not-found';
  result: SubmitResult | null;
  /** Server verdict bytes when a verdict closed the draft (rendered verbatim). */
  detail: string | null;
}

interface SubmitState {
  status: 'idle' | 'busy' | 'partial' | 'error';
  error: WizardFlowError | null;
  fieldErrors: Record<string, string>;
}

const IDENTITY_STEP: WizardStep = { kind: 'identity' };

export const OnboardingWizardView: React.FC<OnboardingWizardViewProps> = ({ onNavigate }) => {
  const [phase, setPhase] = useState<Phase>('boot');
  const [closed, setClosed] = useState<ClosedState | null>(null);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [token, setToken] = useState('');
  const [step, setStep] = useState<WizardStep>(IDENTITY_STEP);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [stepNotice, setStepNotice] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<WizardFlowError | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
    error: null,
    fieldErrors: {},
  });
  const [startBusy, setStartBusy] = useState<'create' | 'resume' | null>(null);
  const [startFieldErrors, setStartFieldErrors] = useState<Record<string, string>>({});
  const [resumeTokenInput, setResumeTokenInput] = useState('');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(false);

  // --- Draft application (the one place phase/step are derived) --------------
  const applyDraft = (payload: DraftPayload, rawToken: string, resumed: boolean): void => {
    saveResumeCapability({ token: rawToken, draftId: payload.id });
    const landed = firstIncompleteStep(payload);
    setDraft(payload);
    setToken(rawToken);
    setStep(landed);
    setPhase('wizard');
    setBannerError(null);
    setStartFieldErrors({});
    setSubmitState({ status: 'idle', error: null, fieldErrors: {} });
    setResumeNotice(
      resumed
        ? t('Resumed where you left off — {{step}}.', { step: stepLabel(landed) })
        : t('Draft created. Your progress is stored on the server.'),
    );
  };

  const closeFromError = (err: unknown): boolean => {
    if (err instanceof OnboardingApiError && (err.status === 404 || err.status === 410)) {
      clearResumeCapability();
      setClosed({
        kind: err.status === 410 ? 'expired' : 'not-found',
        result: null,
        detail: err.detail,
      });
      setPhase('closed');
      return true;
    }
    return false;
  };

  // --- Boot: auto-resume a stored capability (F3) ----------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const capability = peekResumeCapability();
      if (capability === null) {
        if (!cancelled) setPhase('start');
        return;
      }
      try {
        const payload = await resumeDraft(capability.token);
        if (cancelled) return;
        applyDraft(payload, capability.token, true);
      } catch (err) {
        if (cancelled) return;
        if (closeFromError(err)) return;
        // Recoverable: the capability is kept so the next reload retries.
        setBannerError(flowErrorFrom(err));
        setPhase('start');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the capability probe runs once (resume is re-derived per entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Network-loss banner (P5: user-visible, nothing auto-repairs) ----------
  useEffect(() => {
    const update = (): void => setOffline(navigator.onLine === false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // --- Start phase ----------------------------------------------------------
  const handleCreate = (input: IdentityInput): void => {
    if (startBusy !== null) return;
    setStartBusy('create');
    setBannerError(null);
    setStartFieldErrors({});
    void (async () => {
      try {
        const created = await createDraft(input);
        applyDraft(created, created.resume_token, false);
      } catch (err) {
        setStartFieldErrors(onboardingFieldErrors(err));
        if (!closeFromError(err)) setBannerError(flowErrorFrom(err));
      } finally {
        setStartBusy(null);
      }
    })();
  };

  const handleResumeToken = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (startBusy !== null) return;
    const raw = resumeTokenInput.trim();
    if (raw === '') return;
    setStartBusy('resume');
    setBannerError(null);
    setStartFieldErrors({});
    void (async () => {
      try {
        const payload = await resumeDraft(raw);
        applyDraft(payload, raw, true);
      } catch (err) {
        const fields = onboardingFieldErrors(err);
        if (err instanceof OnboardingApiError && err.detail === ONBOARDING_VERDICTS.missingToken) {
          fields.token = err.detail;
        }
        setStartFieldErrors(fields);
        if (!closeFromError(err)) setBannerError(flowErrorFrom(err));
      } finally {
        setStartBusy(null);
      }
    })();
  };

  // --- Wizard phase ---------------------------------------------------------
  const handleIdentitySave = (input: IdentityInput): void => {
    if (draft === null || identityBusy) return;
    setIdentityBusy(true);
    setStepNotice(null);
    setBannerError(null);
    void (async () => {
      try {
        const updated = await updateIdentity(draft.id, token, input);
        setDraft(updated);
        setStepNotice(t('Saved on the server.'));
      } catch (err) {
        if (!closeFromError(err)) setBannerError(flowErrorFrom(err));
      } finally {
        setIdentityBusy(false);
      }
    })();
  };

  const handleSubmit = (): void => {
    if (draft === null || submitState.status === 'busy') return;
    setSubmitState({ status: 'busy', error: null, fieldErrors: {} });
    setStepNotice(null);
    void (async () => {
      try {
        const result = await submitDraft(draft.id, token);
        clearResumeCapability();
        setClosed({ kind: 'submitted', result, detail: null });
        setPhase('closed');
      } catch (err) {
        if (closeFromError(err)) return;
        const fieldErrors = onboardingFieldErrors(err);
        const partial =
          (err instanceof OnboardingApiError && err.code === 'draft_incomplete') ||
          Object.keys(fieldErrors).length > 0;
        setSubmitState({
          status: partial ? 'partial' : 'error',
          error: flowErrorFrom(err),
          fieldErrors,
        });
      }
    })();
  };

  const handleCopyToken = (): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(token);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    })();
  };

  const restartWizard = (): void => {
    clearResumeCapability();
    setClosed(null);
    setDraft(null);
    setToken('');
    setStep(IDENTITY_STEP);
    setResumeNotice(null);
    setStepNotice(null);
    setBannerError(null);
    setResumeTokenInput('');
    setSubmitState({ status: 'idle', error: null, fieldErrors: {} });
    setPhase('start');
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  const stepIndex = WIZARD_STEPS.findIndex((candidate) => stepKey(candidate) === stepKey(step));

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10" aria-labelledby="onboarding-heading">
      <div className="mb-6">
        <h1 id="onboarding-heading" className="text-2xl font-extrabold tracking-tight text-[#103125]">
          {t('Register an institutional club')}
        </h1>
        <p className="text-sm text-[#5A7366] mt-1">
          {t('Every step is saved on the server — you can leave and resume where you left off.')}
        </p>
      </div>

      {/* P5: network loss is announced; the server draft keeps the progress. */}
      {offline && (
        <p role="status" className="mb-4 flex items-start space-x-1.5 rounded-lg border border-[#B45309]/40 bg-[#B45309]/5 p-3 text-xs font-bold text-[#B45309]">
          <WifiOff className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t('You are offline. Your draft is stored on the server — reconnect to continue.')}</span>
        </p>
      )}

      {phase === 'boot' && (
        <p role="status" className="flex items-center space-x-2 text-sm text-[#5A7366]">
          {busyIcon}
          <span>{t('Loading your draft…')}</span>
        </p>
      )}

      {/* --- Terminal state: success | expired/not-found (verdict verbatim) --- */}
      {phase === 'closed' && closed !== null && (
        <div className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-6 sm:p-8 max-w-xl">
          {closed.kind === 'submitted' ? (
            <>
              <div className="flex items-center space-x-2 mb-4">
                <CheckCircle2 className="h-6 w-6 text-[#0D7751]" aria-hidden="true" />
                <h2 className="text-lg font-extrabold text-[#103125]">
                  {t('Your application has been queued for review.')}
                </h2>
              </div>
              {closed.result !== null && (
                <dl className="grid grid-cols-1 gap-2 text-xs mb-4">
                  <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                    <dt className="font-bold text-[#5A7366]">{t('Application id')}</dt>
                    <dd className="text-[#103125] font-mono">{closed.result.application_id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-bold text-[#5A7366]">{t('Application status')}</dt>
                    {/* Status is API data — rendered verbatim (P4). */}
                    <dd className="text-[#103125] font-bold">{closed.result.status}</dd>
                  </div>
                </dl>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center space-x-2 mb-4">
                <FileWarning className="h-6 w-6 text-[#B45309]" aria-hidden="true" />
                <h2 className="text-lg font-extrabold text-[#103125]">
                  {closed.kind === 'expired'
                    ? t('This draft has expired or was closed.')
                    : t('We could not find that draft.')}
                </h2>
              </div>
              {/* Server verdict bytes, rendered verbatim (F4). */}
              {closed.detail !== null && (
                <p role="alert" className="text-sm font-bold text-[#B45309] mb-4">{t(closed.detail)}</p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={restartWizard}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors"
            >
              <span>{t('Start a new wizard')}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.({ tab: 'home', certId: '', next: '', slug: '' })}
              className="px-4 py-2.5 rounded-lg border border-[#E2ECE7] text-sm font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors"
            >
              {t('Back to the home page')}
            </button>
          </div>
        </div>
      )}

      {/* --- Start phase: create OR resume with the capability token ---------- */}
      {phase === 'start' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-6 sm:p-8">
            <h2 className="text-sm font-extrabold text-[#103125] mb-4">{t('Start a new wizard')}</h2>
            <IdentityForm
              initial={{}}
              fieldErrors={startFieldErrors}
              busy={startBusy === 'create'}
              submitLabelKey="Start the wizard"
              onSubmit={handleCreate}
            />
          </div>
          <div className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-6 sm:p-8">
            <h2 className="text-sm font-extrabold text-[#103125] mb-1">{t('Resume a draft')}</h2>
            <p className="text-xs text-[#5A7366] mb-4">
              {t('Paste the resume token from your draft-creation receipt or email.')}
            </p>
            <form onSubmit={handleResumeToken} noValidate>
              <label htmlFor="resume-token" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
                {t('Resume token')}
              </label>
              <input
                id="resume-token"
                type="text"
                value={resumeTokenInput}
                onChange={(e) => setResumeTokenInput(e.target.value)}
                aria-invalid={startFieldErrors.token !== undefined}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] font-mono focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
              />
              {startFieldErrors.token !== undefined && (
                <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{startFieldErrors.token}</p>
              )}
              <button
                type="submit"
                disabled={startBusy !== null || resumeTokenInput.trim() === ''}
                className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg border border-[#1A503E] text-[#1A503E] text-sm font-bold hover:bg-[#F4F8F6] transition-colors disabled:opacity-60"
              >
                {startBusy === 'resume' ? busyIcon : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                <span>{startBusy === 'resume' ? t('Resuming…') : t('Resume')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Recoverable start-phase failures: surfaced, user retries explicitly. */}
      {phase === 'start' && bannerError !== null && (
        <p role="alert" className="mt-4 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{flowErrorText(bannerError)}</span>
        </p>
      )}

      {/* --- Wizard phase: step renderer + visible draft state ---------------- */}
      {phase === 'wizard' && draft !== null && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px] gap-6">
          {/* Step navigation (keyboard-operable buttons; state = server flags). */}
          <nav aria-label={t('Wizard steps')}>
            <ol className="space-y-1.5">
              {WIZARD_STEPS.map((candidate) => {
                const complete = isStepComplete(candidate, draft);
                const current = stepKey(candidate) === stepKey(step);
                return (
                  <li key={stepKey(candidate)}>
                    <button
                      type="button"
                      aria-current={current ? 'step' : undefined}
                      onClick={() => {
                        setStep(candidate);
                        setStepNotice(null);
                        setBannerError(null);
                      }}
                      className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                        current
                          ? 'bg-[#1A503E] text-white shadow-sm'
                          : 'text-[#2E4A3E] hover:bg-white/70'
                      }`}
                    >
                      {complete ? (
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${current ? 'text-amber-300' : 'text-[#0D7751]'}`} aria-hidden="true" />
                      ) : (
                        <span
                          className={`h-3.5 w-3.5 shrink-0 rounded-full border ${current ? 'border-white' : 'border-[#5A7366]'}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>{stepLabel(candidate)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Current step content (re-mounted per step: current-step state only). */}
          <div className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-6 sm:p-8">
            {resumeNotice !== null && (
              <p role="status" className="mb-4 flex items-start space-x-1.5 text-xs text-[#0D7751]">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{resumeNotice}</span>
              </p>
            )}

            {step.kind === 'identity' && (
              <div>
                <h2 className="text-sm font-extrabold text-[#103125] mb-4">{stepLabel(IDENTITY_STEP)}</h2>
                <IdentityForm
                  key="identity-step"
                  initial={draft}
                  fieldErrors={{}}
                  busy={identityBusy}
                  submitLabelKey="Save identity"
                  onSubmit={handleIdentitySave}
                />
              </div>
            )}

            {step.kind === 'authority' && (
              <AuthorityStepForm
                key={stepKey(step)}
                role={step.role}
                draft={draft}
                token={token}
                onDraft={setDraft}
              />
            )}

            {step.kind === 'document' && (
              <DocumentStep draft={draft} token={token} onDraft={setDraft} />
            )}

            {step.kind === 'review' && (
              <div>
                <h2 className="text-sm font-extrabold text-[#103125] mb-1">{stepLabel({ kind: 'review' })}</h2>
                <p className="text-xs text-[#5A7366] mb-4">
                  {t('Review each step, then submit your charter application.')}
                </p>

                {/* Summary = the server draft payload, rendered as returned (P4). */}
                <dl className="grid grid-cols-1 gap-2 text-xs mb-4">
                  <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                    <dt className="font-bold text-[#5A7366]">{t('Institution name')}</dt>
                    <dd className="text-[#103125]">{draft.institution_name}</dd>
                  </div>
                  <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                    <dt className="font-bold text-[#5A7366]">{t('Club name')}</dt>
                    <dd className="text-[#103125]">{draft.club_name}</dd>
                  </div>
                  <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                    <dt className="font-bold text-[#5A7366]">{t('AISHE code (optional)')}</dt>
                    <dd className="text-[#103125]">{draft.aishe_code}</dd>
                  </div>
                  <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                    <dt className="font-bold text-[#5A7366]">{t('Zone / State / District')}</dt>
                    <dd className="text-[#103125]">
                      {draft.zone_code} / {draft.state_code} / {draft.district_code}
                    </dd>
                  </div>
                  {AUTHORITY_ROLES.map((role) => {
                    const authority = draft.authorities[role];
                    return (
                      <div key={role} className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                        <dt className="font-bold text-[#5A7366]">{roleLabel(role)}</dt>
                        <dd className="text-[#103125]">
                          {authority?.full_name || authority?.email || t('Not started')}{' '}
                          <span className={authority?.otp_verified ? 'text-[#0D7751] font-bold' : 'text-[#B45309] font-bold'}>
                            {authority?.otp_verified ? t('OTP verified') : t('OTP pending')}
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                  <div className="flex justify-between">
                    <dt className="font-bold text-[#5A7366]">{t('Stored document')}</dt>
                    <dd className={draft.document_uploaded ? 'text-[#0D7751] font-bold' : 'text-[#B45309] font-bold'}>
                      {draft.document_uploaded ? t('On file') : t('Not yet')}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitState.status === 'busy'}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
                >
                  {submitState.status === 'busy' ? busyIcon : <Send className="h-4 w-4" aria-hidden="true" />}
                  <span>{submitState.status === 'busy' ? t('Submitting…') : t('Submit to the charter queue')}</span>
                </button>

                {/* Partial terminal: server-rejected fields, per field (F4). */}
                {submitState.status === 'partial' && submitState.error !== null && (
                  <div role="alert" className="mt-4 rounded-lg border border-[#B45309]/40 bg-[#B45309]/5 p-4">
                    <p className="flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{flowErrorText(submitState.error)}</span>
                    </p>
                    {Object.keys(submitState.fieldErrors).length > 0 && (
                      <div className="mt-3">
                        <h3 className="text-xs font-extrabold text-[#103125] mb-1">{t('Rejected fields')}</h3>
                        <ul className="space-y-1">
                          {Object.entries(submitState.fieldErrors).map(([field, verdict]) => (
                            <li key={field} className="text-xs text-[#B45309]">
                              <span className="font-bold">{field}:</span> {verdict}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-3">
                      <h3 className="text-xs font-extrabold text-[#103125] mb-1">{t('Some steps are still open:')}</h3>
                      <ul className="space-y-1.5">
                        {incompleteSteps(draft).map((open) => (
                          <li key={stepKey(open)} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-[#2E4A3E]">{stepLabel(open)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setStep(open);
                                setStepNotice(null);
                              }}
                              className="text-xs font-bold text-[#0D7751] hover:text-[#103125] transition-colors"
                            >
                              {t('Go to this step')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Recoverable error: manual retry only (P5, no auto-retry). */}
                {submitState.status === 'error' && submitState.error !== null && (
                  <div className="mt-4">
                    <p role="alert" className="flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{flowErrorText(submitState.error)}</span>
                    </p>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="mt-2 px-4 py-2 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors"
                    >
                      {t('Try again')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {stepNotice !== null && (
              <p role="status" className="mt-4 flex items-start space-x-1.5 text-xs text-[#0D7751]">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{stepNotice}</span>
              </p>
            )}
            {bannerError !== null && (
              <p role="alert" className="mt-4 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{flowErrorText(bannerError)}</span>
              </p>
            )}

            {/* Step traversal for keyboard flow. */}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                disabled={stepIndex <= 0}
                onClick={() => {
                  const previous = WIZARD_STEPS[stepIndex - 1];
                  if (previous !== undefined) {
                    setStep(previous);
                    setStepNotice(null);
                    setBannerError(null);
                  }
                }}
                className="px-4 py-2 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors disabled:opacity-40"
              >
                {t('Previous step')}
              </button>
              <button
                type="button"
                disabled={stepIndex >= WIZARD_STEPS.length - 1}
                onClick={() => {
                  const next = WIZARD_STEPS[stepIndex + 1];
                  if (next !== undefined) {
                    setStep(next);
                    setStepNotice(null);
                    setBannerError(null);
                  }
                }}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors disabled:opacity-40"
              >
                <span>{t('Next step')}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Visible draft state — the API's draft payload, nothing else (P4). */}
          <aside aria-label={t('Draft state (from the server)')} className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-5 h-fit">
            <h2 className="text-xs font-extrabold text-[#103125] mb-3">{t('Draft state (from the server)')}</h2>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Status')}</dt>
                {/* Status is API data — rendered verbatim (P4). */}
                <dd className="text-[#103125] font-mono">{draft.status}</dd>
              </div>
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Draft id')}</dt>
                <dd className="text-[#103125] font-mono break-all">{draft.id}</dd>
              </div>
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Club')}</dt>
                <dd className="text-[#103125]">{draft.club_name}</dd>
              </div>
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Authorities')}</dt>
                <dd className="text-[#103125]">
                  {AUTHORITY_ROLES.map((role: AuthorityRole) => (
                    <div key={role} className="flex items-center justify-between gap-2 py-0.5">
                      <span>{roleLabel(role)}</span>
                      {draft.authorities[role]?.otp_verified ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#0D7751]" aria-label={t('OTP verified')} />
                      ) : (
                        <span className="text-[#B45309] font-bold">{t('OTP pending')}</span>
                      )}
                    </div>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Stored document')}</dt>
                <dd className={draft.document_uploaded ? 'text-[#0D7751] font-bold' : 'text-[#B45309] font-bold'}>
                  {draft.document_uploaded ? t('On file') : t('Not yet')}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-[#5A7366]">{t('Resume token (capability — keep it secret)')}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-[#103125]">{`${token.slice(0, 4)}…${token.slice(-4)}`}</span>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="flex items-center space-x-1 px-2 py-1 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors"
                  >
                    <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                    <span>{copied ? t('Copied') : t('Copy')}</span>
                  </button>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[#5A7366]">
              {t('This panel renders the API’s draft payload; the client keeps no wizard state.')}
            </p>
          </aside>
        </div>
      )}
    </section>
  );
};
