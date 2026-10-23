import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { t } from '../../i18n';
import {
  AuthorityInput,
  AuthorityRole,
  DraftPayload,
  onboardingFieldErrors,
  sendAuthorityOtp,
  upsertAuthority,
  verifyAuthorityOtp,
} from '../../lib/onboardingApi';
import { flowErrorFrom, flowErrorText, roleLabel, WizardFlowError } from './wizardSteps';

/**
 * One authority slot of the onboarding wizard (M5-D2, maps to M4-D2 W1/W2).
 *
 * The step completes ONLY when the server says so (`otp_verified` in the
 * draft payload — P4: rendered, never recomputed). Server rejections render
 * their verdict bytes verbatim per field (F4). Mutations never auto-retry
 * (P5): every failure surfaces with an explicit user-triggered retry.
 * The OTP send is enumeration-safe; its verdict is rendered verbatim.
 */

interface AuthorityStepFormProps {
  role: AuthorityRole;
  draft: DraftPayload;
  token: string;
  onDraft: (draft: DraftPayload) => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const AuthorityStepForm: React.FC<AuthorityStepFormProps> = ({ role, draft, token, onDraft }) => {
  // Current-step state only (P4): the parent re-mounts this per step via `key`.
  const existing = draft.authorities[role];
  const initial: AuthorityInput = {
    full_name: existing?.full_name ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    designation: existing?.designation ?? '',
  };
  const [values, setValues] = useState<AuthorityInput>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial));
  const [code, setCode] = useState('');
  const [codeStage, setCodeStage] = useState(false);
  const [busy, setBusy] = useState<'save' | 'send' | 'verify' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<WizardFlowError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const verified = existing?.otp_verified === true;
  const dirty = JSON.stringify(values) !== savedSnapshot;

  // Resend cooldown ticker — presentation only (the API's per-minute ceilings
  // stay the single source of the actual limit).
  useEffect(() => {
    if (cooldownEndsAt === 0) return undefined;
    const tick = (): void => {
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [cooldownEndsAt]);

  const failWith = (err: unknown): void => {
    setFieldErrors(onboardingFieldErrors(err));
    setError(flowErrorFrom(err));
  };

  const handleSave = async (): Promise<void> => {
    if (busy !== null) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const updated = await upsertAuthority(draft.id, token, role, values);
      onDraft(updated);
      setSavedSnapshot(JSON.stringify(values));
      setNotice(t('Authority saved on the server.'));
    } catch (err) {
      failWith(err);
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async (): Promise<void> => {
    if (busy !== null || dirty) return;
    setBusy('send');
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const accepted = await sendAuthorityOtp(draft.id, token, role);
      // Enumeration-safe verdict, rendered VERBATIM.
      setNotice(accepted.detail);
      setCodeStage(true);
      setCode('');
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      failWith(err);
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy !== null) return;
    setBusy('verify');
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const updated = await verifyAuthorityOtp(draft.id, token, role, code.trim());
      onDraft(updated);
      setCode('');
      setCodeStage(false);
      setNotice(t('Step passed — OTP verified.'));
    } catch (err) {
      failWith(err);
    } finally {
      setBusy(null);
    }
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <div>
      <div className="flex items-center space-x-2.5 mb-4">
        <ShieldCheck className="h-5 w-5 text-[#0D7751]" aria-hidden="true" />
        <h3 className="text-sm font-extrabold text-[#103125]">
          {t('Authority: {{role}}', { role: roleLabel(role) })}
        </h3>
        {/* Server truth: otp_verified straight from the draft payload (P4). */}
        {verified ? (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#0D7751]/10 text-[#0D7751] text-xs font-bold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('OTP verified')}</span>
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-[#B45309]/10 text-[#B45309] text-xs font-bold">
            {t('OTP pending')}
          </span>
        )}
      </div>

      <fieldset disabled={busy !== null} className="space-y-4">
        <legend className="sr-only">{t('Authority: {{role}}', { role: roleLabel(role) })}</legend>
        <div>
          <label htmlFor={`authority-${role}-name`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Full name')}
          </label>
          <input
            id={`authority-${role}-name`}
            type="text"
            value={values.full_name}
            onChange={(e) => setValues((prev) => ({ ...prev, full_name: e.target.value }))}
            aria-invalid={fieldErrors.full_name !== undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.full_name !== undefined && (
            <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{t(fieldErrors.full_name)}</p>
          )}
        </div>
        <div>
          <label htmlFor={`authority-${role}-email`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Email address')}
          </label>
          <input
            id={`authority-${role}-email`}
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={(e) => setValues((prev) => ({ ...prev, email: e.target.value }))}
            aria-invalid={fieldErrors.email !== undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <p className="mt-1 text-xs text-[#5A7366]">{t('The server requires an email for every authority.')}</p>
          {fieldErrors.email !== undefined && (
            <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{t(fieldErrors.email)}</p>
          )}
        </div>
        <div>
          <label htmlFor={`authority-${role}-phone`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Phone')}
          </label>
          <input
            id={`authority-${role}-phone`}
            type="tel"
            autoComplete="tel"
            required
            value={values.phone}
            onChange={(e) => setValues((prev) => ({ ...prev, phone: e.target.value }))}
            aria-invalid={fieldErrors.phone !== undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <p className="mt-1 text-xs text-[#5A7366]">{t('The server requires a 10-digit Indian mobile for every authority.')}</p>
          {fieldErrors.phone !== undefined && (
            <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{t(fieldErrors.phone)}</p>
          )}
        </div>
        <div>
          <label htmlFor={`authority-${role}-designation`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Designation')}
          </label>
          <input
            id={`authority-${role}-designation`}
            type="text"
            required
            value={values.designation}
            onChange={(e) => setValues((prev) => ({ ...prev, designation: e.target.value }))}
            aria-invalid={fieldErrors.designation !== undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.designation !== undefined && (
            <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{t(fieldErrors.designation)}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy !== null}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
          >
            {busy === 'save' ? busyIcon : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            <span>{busy === 'save' ? t('Saving…') : t('Save this authority')}</span>
          </button>
          {!verified && (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={busy !== null || dirty || secondsLeft > 0}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg border border-[#E2ECE7] text-sm font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors disabled:opacity-60"
            >
              {busy === 'send' ? busyIcon : <Mail className="h-4 w-4" aria-hidden="true" />}
              <span>{busy === 'send' ? t('Sending…') : t('Send code')}</span>
            </button>
          )}
          {!verified && dirty && (
            <p className="text-xs text-[#5A7366]">{t('Save your changes before sending the code.')}</p>
          )}
        </div>
      </fieldset>

      {/* OTP roundtrip (W2): send -> verify; the step passes only on the200. */}
      {!verified && codeStage && (
        <form onSubmit={handleVerify} noValidate className="mt-5 pt-5 border-t border-[#E2ECE7]">
          <p className="text-sm text-[#2E4A3E] mb-3">
            {t('Enter the code sent to this authority’s email.')}
          </p>
          <label htmlFor={`authority-${role}-code`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Verification code')}
          </label>
          <input
            id={`authority-${role}-code`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={fieldErrors.code !== undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.code !== undefined && (
            <p role="alert" className="mt-1 text-xs font-bold text-[#B45309]">{t(fieldErrors.code)}</p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="submit"
              disabled={busy !== null || code.trim() === ''}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
            >
              {busy === 'verify' ? busyIcon : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              <span>{busy === 'verify' ? t('Verifying…') : t('Verify code')}</span>
            </button>
            {secondsLeft > 0 ? (
              <p className="text-xs text-[#5A7366]" role="status">
                {t('Resend code in {{time}}', { time: formatClock(secondsLeft) })}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy !== null}
                className="flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] hover:text-[#103125] transition-colors disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('Resend code')}</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Verdicts render VERBATIM (F4 byte-consistency): API data, not copy. */}
      {notice !== null && (
        <p role="status" className="mt-4 flex items-start space-x-1.5 text-xs text-[#0D7751]">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-4 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{flowErrorText(error)}</span>
        </p>
      )}
    </div>
  );
};
