import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  QrCode,
  RefreshCw,
  ScanLine,
  X,
} from 'lucide-react';
import { t } from '../../i18n';
import {
  AuthApiError,
  completeJoin,
  JoinResult,
  requestJoinOtp,
} from '../../lib/authApi';
import {
  classifyJoinFailure,
  JOIN_VERDICTS,
  JoinFailureKind,
  joinTokenFromHash,
  joinTokenFromPastedLink,
} from '../../lib/clubsApi';

/**
 * M5-D3 passkey/QR self-join door (BRIEF_M5 §3 D3; gates F5 + F6).
 *
 * Two-phase join: (1) credential (passkey OR join link/QR token) + email ->
 * `POST /clubs/join/otp/request/` (202, fixed anti-enumeration verdict);
 * (2) the emailed code -> `POST /clubs/join/complete/` (201 JoinResult).
 *
 * Token delivery (M4 rule): the club QR wraps `/join#t=<token>` — the token
 * rides in the URL FRAGMENT, never the query string. On mount the client reads
 * it from `location.hash` (joinTokenFromHash); the scanner-less desktop path
 * accepts a pasted link (joinTokenFromPastedLink). When neither is present the
 * passkey field is the entry (scanner/QR-present states surface here).
 *
 * Verdict rendering (F6 / P4): every `detail` byte from the API is rendered
 * VERBATIM as data — routed through t() for translation (owner DEC2). classifyJoinFailure
 * maps the exact verdict bytes to the three BRIEF_D3 verdict screens (already a
 * member / ineligible / joined) plus inline families. The client invents no
 * distinction of its own; mutations never auto-retry (P5).
 */

interface JoinViewProps {
  /** Optional token pre-read from `/join#t=…` (App can pass it, else we read the hash). */
  initialToken?: string;
  /** Return to the previous screen (showcase index / club page). */
  onBack: () => void;
}

type Phase = 'credential' | 'code' | 'done';

const RESEND_COOLDOWN_SECONDS = 60;

const failureHeading = (kind: JoinFailureKind): string => {
  switch (kind) {
    case 'already':
      return t('Already connected to this club');
    case 'ineligible':
      return t('Not eligible to join');
    case 'credential':
      return t('Check your passkey or join link');
    case 'code':
      return t('That code did not work');
    case 'rate-limit':
      return t('Too many attempts');
    case 'network':
      return t('Connection problem');
    default:
      return t('Something went wrong');
  }
};

export const JoinView: React.FC<JoinViewProps> = ({ initialToken = '', onBack }) => {
  const [phase, setPhase] = useState<Phase>('credential');
  const [token, setToken] = useState(initialToken);
  const [passkey, setPasskey] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [failure, setFailure] = useState<{ kind: JoinFailureKind; detail: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Read the join token from the URL fragment on mount (`/join#t=<token>`),
  // unless the caller already supplied it. Client-only (never during SSR).
  useEffect(() => {
    if (!initialToken && typeof window !== 'undefined') {
      const fromHash = joinTokenFromHash(window.location.hash);
      if (fromHash) setToken(fromHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown timer (presentation only — the server enforces the real
  // ceilings; this never grants or withholds access, P4).
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const classifyError = (err: unknown) => {
    if (err instanceof AuthApiError) {
      if (err.kind === 'network') {
        setFailure({
          kind: 'network',
          detail: t('Could not reach the join service. Please check your connection and try again.'),
        });
      } else if (err.kind === 'rate-limit') {
        setFailure({
          kind: 'rate-limit',
          detail: err.detail ?? JOIN_VERDICTS.throttleIp,
        });
      } else {
        const detail = err.detail ?? t('The join request could not be completed. Please try again.');
        setFailure({
          kind: err.detail ? classifyJoinFailure(err.detail) : 'server',
          detail,
        });
      }
    } else {
      setFailure({ kind: 'server', detail: t('The join request could not be completed. Please try again.') });
    }
  };

  const applyPastedLink = () => {
    const resolved = joinTokenFromPastedLink(linkInput);
    if (resolved) {
      setToken(resolved);
      setPasskey(''); // avoid the credential_conflict verdict (passkey XOR token)
    }
  };

  const clearToken = () => {
    setToken('');
    setLinkInput('');
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    setAccepted(null);
    requestJoinOtp({ passkey: passkey.trim(), token, email: email.trim() })
      .then((res) => {
        setAccepted(res.detail);
        setPhase('code');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        headingRef.current?.focus();
      })
      .catch(classifyError)
      .finally(() => setBusy(false));
  };

  const confirmJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    completeJoin({
      passkey: passkey.trim(),
      token,
      email: email.trim(),
      code: code.trim(),
    })
      .then((result) => {
        setJoined(result);
        setPhase('done');
        headingRef.current?.focus();
      })
      .catch(classifyError)
      .finally(() => setBusy(false));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="text-center sm:text-left grow space-y-2">
          <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-3.5 py-1 rounded-full text-xs font-bold">
            <QrCode className="h-4 w-4 text-brand-700" />
            <span>{t('Join a Club')}</span>
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-extrabold text-ink-900 tracking-tight focus:outline-hidden"
          >
            {phase === 'done' ? t('Join requested') : t('Join with a passkey or QR link')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-600 max-w-xl">
            {t('Use the passkey or the QR link your club shared, then confirm the code we email you.')}
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl border border-ink-200 bg-white text-xs font-bold text-ink-700 hover:bg-ink-50 flex items-center space-x-1.5 shadow-2xs shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('Back')}</span>
        </button>
      </div>

      {/* QR / scanner-present hint */}
      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex items-start space-x-3">
        <ScanLine className="h-5 w-5 text-brand-700 shrink-0 mt-0.5" />
        <p className="text-xs text-brand-800">
          {t('Scanning the club QR code brings you here automatically with the join link filled in. On a computer without a scanner, paste the link below instead.')}
        </p>
      </div>

      <div aria-live="polite" className="space-y-4">
        {/* Verdict / failure banner (server bytes rendered verbatim) */}
        {failure && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-5 space-y-2">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-6 w-6 text-amber-700 shrink-0" />
              <div className="grow space-y-1">
                <p className="text-sm font-bold text-ink-900">{failureHeading(failure.kind)}</p>
                <p className="text-sm text-ink-700">{t(failure.detail)}</p>
              </div>
              <button
                onClick={() => setFailure(null)}
                aria-label={t('Dismiss')}
                className="text-ink-400 hover:text-ink-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Success: joined verdict */}
        {phase === 'done' && joined && (
          <div className="bg-white rounded-2xl border-2 border-brand-300 p-6 space-y-3">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="h-7 w-7 text-brand-700" />
              <p className="text-sm font-bold text-ink-900">{t('Your join request is in')}</p>
            </div>
            <p className="text-sm text-ink-700">{t(joined.detail)}</p>
            <div className="text-xs text-ink-600 flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold bg-ink-100 border border-ink-200 px-2 py-0.5 rounded">
                {t('Club:')} {joined.club.name}
              </span>
              <span className="font-mono font-bold bg-brand-50 border border-brand-200 text-brand-800 px-2 py-0.5 rounded">
                {t('Status:')} {joined.status}
              </span>
            </div>
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md"
            >
              {t('Back to clubs')}
            </button>
          </div>
        )}

        {/* Phase 1: credential + email */}
        {phase === 'credential' && (
          <form onSubmit={sendCode} className="bg-white p-6 rounded-2xl border border-ink-200 shadow-md space-y-4">
            {/* Join-link / token state */}
            {token ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <div className="flex items-center space-x-2 text-brand-800">
                  <QrCode className="h-4 w-4" />
                  <span className="text-xs font-bold">{t('Join link ready')}</span>
                  <span className="font-mono text-[11px] bg-white border border-brand-200 px-2 py-0.5 rounded">
                    {token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearToken}
                  aria-label={t('Remove join link')}
                  className="text-brand-700 hover:text-brand-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-700 block" htmlFor="join-link">
                  {t('Paste a join link (optional if you have a passkey)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="join-link"
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder={t('…/#t=… or a bare code')}
                    className="grow px-3 py-2 rounded-xl border border-ink-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={applyPastedLink}
                    className="px-3 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50"
                  >
                    {t('Use link')}
                  </button>
                </div>
              </div>
            )}

            {/* Passkey */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink-700 block" htmlFor="join-passkey">
                {t('Passkey')}
              </label>
              <div className="relative">
                <KeyRound className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="join-passkey"
                  type="text"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder={t('Club passkey')}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-ink-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink-700 block" htmlFor="join-email">
                {t('Email address')}
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="join-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('you@example.com')}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-ink-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              <span>{t('Email me a join code')}</span>
            </button>
          </form>
        )}

        {/* Phase 2: enter the emailed code */}
        {phase === 'code' && (
          <form onSubmit={confirmJoin} className="bg-white p-6 rounded-2xl border border-ink-200 shadow-md space-y-4">
            {accepted && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <p className="text-sm text-brand-800">{accepted}</p>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink-700 block" htmlFor="join-code">
                {t('Enter the 6-digit code')}
              </label>
              <input
                id="join-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('123456')}
                className="w-full px-3 py-2 rounded-xl border border-ink-200 text-sm tracking-widest focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>{t('Confirm and join')}</span>
            </button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setPhase('credential');
                  setCode('');
                  setFailure(null);
                }}
                className="text-xs font-bold text-ink-600 hover:text-ink-900 flex items-center space-x-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{t('Change details')}</span>
              </button>
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => {
                  setBusy(true);
                  setFailure(null);
                  requestJoinOtp({ passkey: passkey.trim(), token, email: email.trim() })
                    .then((res) => {
                      setAccepted(res.detail);
                      setCooldown(RESEND_COOLDOWN_SECONDS);
                    })
                    .catch(classifyError)
                    .finally(() => setBusy(false));
                }}
                className="text-xs font-bold text-brand-700 hover:text-brand-900 disabled:opacity-50 flex items-center space-x-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{cooldown > 0 ? `${t('Resend in')} ${cooldown}s` : t('Resend code')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
