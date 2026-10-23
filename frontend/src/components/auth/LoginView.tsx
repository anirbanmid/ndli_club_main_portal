import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  AuthApiError,
  classifyAuthVerdict,
  fetchSession,
  requestLoginOtp,
  SessionPayload,
  signOut,
  verifyLoginOtp,
} from '../../lib/authApi';
import {
  consumeInterruptedRoute,
  isSafeLocalPath,
  peekInterruptedRoute,
} from '../../lib/returnTo';
import type { AppRoute } from '../../lib/route';
import { PasskeyLoginEntry } from './PasskeyLoginEntry';

/**
 * M5-D1 login door (BRIEF_M5 §3 D1; gates F1 + F2).
 *
 * Email + OTP flow (the M4 accounts API is EMAIL+OTP and deliberately has no
 * SMS/phone delivery anywhere — apps/accounts/models.py): request code ->
 * enter code -> session established. The resend cooldown mirrors the server's
 * per-minute ceilings; the timer is presentation only and never grants access
 * (P4: the API is the single source of every verdict).
 *
 * Verdict rendering (F2): any `detail` the API sends is rendered VERBATIM as
 * data — never through the i18n pipeline and never paraphrased. All UI chrome
 * (labels, buttons, help text) goes through t(). Unknown/known addresses are
 * indistinguishable by design (anti-enumeration).
 *
 * Passkey campus-code entry lives in PasskeyLoginEntry. Re-login returns to
 * the interrupted route via lib/returnTo.ts.
 */

interface LoginViewProps {
  /** `?next=` — interrupted route (local paths only, validated). */
  initialNext?: string;
  /** Navigate to a resolved in-app route (App wires this to branch/tab state). */
  onNavigate?: (route: AppRoute) => void;
  /** Called when a session is established (payload straight from the API). */
  onSignedIn?: (session: SessionPayload) => void;
}

type Phase = 'request' | 'verify' | 'established';

type FlowError =
  | { kind: 'verdict' | 'rate-limit'; message: string }
  | { kind: 'network' | 'server' };

const RESEND_COOLDOWN_SECONDS = 60;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Map any thrown value onto the UI's honest error states. */
function flowErrorFrom(err: unknown): FlowError {
  if (err instanceof ApiError) {
    if (err.kind === 'network') return { kind: 'network' };
    const detail = err instanceof AuthApiError ? err.detail : null;
    if (err.kind === 'rate-limit') {
      return { kind: 'rate-limit', message: detail ?? err.message };
    }
    if (detail !== null) return { kind: 'verdict', message: detail };
    return { kind: 'server' };
  }
  return { kind: 'server' };
}

export const LoginView: React.FC<LoginViewProps> = ({
  initialNext = '',
  onNavigate,
  onSignedIn,
}) => {
  const [phase, setPhase] = useState<Phase>('request');
  const [method, setMethod] = useState<'otp' | 'passkey'>('otp');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<FlowError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Interrupted-route target: the explicit ?next= wins; otherwise whatever a
  // mid-flow guard stored (peeked here, consumed at return time).
  const [returnTo] = useState<string | null>(() => {
    const next = initialNext.trim();
    return isSafeLocalPath(next) ? next : peekInterruptedRoute();
  });

  // Resend cooldown ticker (F1: resend cooldown timer).
  useEffect(() => {
    if (cooldownEndsAt === 0) return undefined;
    const tick = (): void => {
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [cooldownEndsAt]);

  const returnToInterruptedRoute = (): void => {
    const stored = consumeInterruptedRoute();
    const target = returnTo !== null && isSafeLocalPath(returnTo) ? returnTo : stored;
    if (target !== null && isSafeLocalPath(target)) {
      // Full entry: lib/route.ts re-resolves the route (single source).
      window.location.assign(target);
      return;
    }
    onNavigate?.({ tab: 'home', certId: '', next: '', slug: '' });
  };

  // Session restore + clean re-login return (BRIEF_M5 D1).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await fetchSession();
        if (cancelled || existing === null) return;
        setSession(existing);
        setPhase('established');
        onSignedIn?.(existing);
        returnToInterruptedRoute();
      } catch (err) {
        if (!cancelled) setError(flowErrorFrom(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: session probe runs once (the route target never changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = (): void => {
    const endsAt = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setCooldownEndsAt(endsAt);
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  };

  const handleRequestOtp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const accepted = await requestLoginOtp(email.trim());
      // Enumeration-safe accepted verdict, rendered VERBATIM (F2).
      setNotice(accepted.detail);
      setPhase('verify');
      setCode('');
      startCooldown();
      window.setTimeout(() => codeInputRef.current?.focus(), 0);
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const established = await verifyLoginOtp(email.trim(), code.trim());
      setSession(established);
      setPhase('established');
      onSignedIn?.(established);
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async (): Promise<void> => {
    if (busy || secondsLeft > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const accepted = await requestLoginOtp(email.trim());
      setNotice(accepted.detail);
      startCooldown();
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOut();
      setSession(null);
      setCode('');
      setNotice(null);
      setPhase('request');
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-10" aria-labelledby="login-heading">
      <div className="bg-white rounded-2xl border border-[#E2ECE7] shadow-sm p-6 sm:p-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-[#103125] via-[#1A503E] to-[#0D7751] flex items-center justify-center text-white shadow-md">
            <CheckCircle2 className="h-6 w-6 text-amber-300" aria-hidden="true" />
          </div>
          <div>
            <h1 id="login-heading" className="text-xl font-extrabold tracking-tight text-[#103125]">
              {t("Sign in to NDLI Club")}
            </h1>
            <p className="text-xs text-[#5A7366] font-medium">
              {t("Passwordless sign-in with the code sent to your email.")}
            </p>
          </div>
        </div>

        {/* Method switch: email code (default) vs campus passkey entry. */}
        <div
          className="flex items-center p-1 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7] mb-6"
          role="tablist"
          aria-label={t("Sign-in method")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={method === 'otp'}
            onClick={() => setMethod('otp')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              method === 'otp'
                ? 'bg-[#1A503E] text-white shadow-sm'
                : 'text-[#2E4A3E] hover:text-[#103125] hover:bg-white/60'
            }`}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("Email code")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === 'passkey'}
            onClick={() => setMethod('passkey')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              method === 'passkey'
                ? 'bg-[#1A503E] text-white shadow-sm'
                : 'text-[#2E4A3E] hover:text-[#103125] hover:bg-white/60'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("Sign in with passkey")}</span>
          </button>
        </div>

        {method === 'passkey' && <PasskeyLoginEntry />}

        {method === 'otp' && phase === 'request' && (
          <form onSubmit={handleRequestOtp} noValidate>
            <label htmlFor="login-email" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
              {t("Email address")}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
            />
            <button
              type="submit"
              disabled={busy || email.trim() === ''}
              className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
            >
              {busy ? busyIcon : <Mail className="h-4 w-4" aria-hidden="true" />}
              <span>{busy ? t("Sending…") : t("Send code")}</span>
            </button>
          </form>
        )}

        {method === 'otp' && phase === 'verify' && (
          <form onSubmit={handleVerifyOtp} noValidate>
            <p className="text-sm text-[#2E4A3E] mb-3">
              {t("Enter the verification code sent to your email.")}
            </p>
            <label htmlFor="login-code" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
              {t("Verification code")}
            </label>
            <input
              id="login-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
            />
            <button
              type="submit"
              disabled={busy || code.trim() === ''}
              className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
            >
              {busy ? busyIcon : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              <span>{busy ? t("Verifying…") : t("Verify code")}</span>
            </button>

            <div className="mt-4 flex items-center justify-between">
              {secondsLeft > 0 ? (
                <p className="text-xs text-[#5A7366]" role="status">
                  {t("Resend code in {{time}}", { time: formatClock(secondsLeft) })}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={busy}
                  className="flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] hover:text-[#103125] transition-colors disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Resend code")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPhase('request');
                  setCode('');
                  setError(null);
                  setNotice(null);
                }}
                className="text-xs font-bold text-[#2E4A3E] hover:text-[#103125] transition-colors"
              >
                {t("Use a different email")}
              </button>
            </div>
          </form>
        )}

        {method === 'otp' && phase === 'established' && session !== null && (
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-[#0D7751]" aria-hidden="true" />
              <p className="text-sm font-bold text-[#103125]">{t("Session established")}</p>
            </div>
            <dl className="grid grid-cols-1 gap-2 text-xs mb-4">
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Username")}</dt>
                <dd className="text-[#103125]">{session.username}</dd>
              </div>
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Email")}</dt>
                <dd className="text-[#103125]">{session.email}</dd>
              </div>
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Category")}</dt>
                <dd className="text-[#103125]">{session.category}</dd>
              </div>
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Sub-role")}</dt>
                <dd className="text-[#103125]">{session.sub_role}</dd>
              </div>
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Account state")}</dt>
                <dd className="text-[#103125]">{session.account_state}</dd>
              </div>
              <div className="flex justify-between border-b border-[#E2ECE7] pb-1.5">
                <dt className="font-bold text-[#5A7366]">{t("Institution code")}</dt>
                <dd className="text-[#103125]">{session.institution_code}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-bold text-[#5A7366]">{t("Club code")}</dt>
                <dd className="text-[#103125]">{session.club_code}</dd>
              </div>
            </dl>
            {session.must_change_password && (
              <p className="flex items-center space-x-1.5 text-xs font-bold text-[#B45309] mb-4">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("Password change required")}</span>
              </p>
            )}
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={returnToInterruptedRoute}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors"
              >
                <span>{t("Continue to where you left off")}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={busy}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-lg border border-[#E2ECE7] text-sm font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>{t("Sign out")}</span>
              </button>
            </div>
          </div>
        )}

        {/* Verdicts render VERBATIM (F2 byte-consistency): API data, not copy. */}
        {notice !== null && (
          <p role="status" className="mt-4 flex items-start space-x-1.5 text-xs text-[#0D7751]">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{notice}</span>
          </p>
        )}
        {error !== null && (
          <p role="alert" className="mt-4 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {flowErrorText(error, t)}
            </span>
          </p>
        )}
      </div>
    </section>
  );
};


function flowErrorText(error: FlowError, t: (key: string) => string): string {
  switch (error.kind) {
    case 'verdict':
    case 'rate-limit':
      return t(error.message);
    case 'network':
      return t("Network request failed. Check your connection and try again.");
    case 'server':
    default:
      return t("Server error. Try again later.");
  }
}
