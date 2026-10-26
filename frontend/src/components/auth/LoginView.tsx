import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  AuthApiError,
  fetchSession,
  passwordLogin,
  SessionPayload,
  signOut,
} from '../../lib/authApi';
import {
  consumeInterruptedRoute,
  isSafeLocalPath,
  peekInterruptedRoute,
} from '../../lib/returnTo';
import type { AppRoute } from '../../lib/route';

/**
 * M5-D1 login door — OFFICE GATE (owner 2026-10-27, previous-project pattern).
 *
 * Employee code + password + captcha. The email-OTP door is GONE from here:
 * with no mail server at the backend it could never establish a session, and
 * email verification everywhere only burns mail quota and chokes the gate.
 * No new auth primitive (P0): `services.password_login` is the single gate and
 * the captcha is one-shot, server-held (apps/accounts/captcha.py).
 *
 * Verdict rendering (F2): any `detail` the API sends is rendered VERBATIM as
 * data — never through the i18n pipeline and never paraphrased. All UI chrome
 * (labels, buttons, help text) goes through t().
 *
 * Re-login returns to the interrupted route via lib/returnTo.ts.
 */

interface LoginViewProps {
  /** `?next=` — interrupted route (local paths only, validated). */
  initialNext?: string;
  /** Navigate to a resolved in-app route (App wires this to branch/tab state). */
  onNavigate?: (route: AppRoute) => void;
  /** Called when a session is established (payload straight from the API). */
  onSignedIn?: (session: SessionPayload) => void;
}

type FlowError =
  | { kind: 'verdict' | 'rate-limit'; message: string }
  | { kind: 'network' | 'server' };

const CAPTCHA_SRC = '/api/v1/accounts/captcha/';

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
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaSrc, setCaptchaSrc] = useState(() => `${CAPTCHA_SRC}?t=${Date.now()}`);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<FlowError | null>(null);
  const [busy, setBusy] = useState(false);

  // Interrupted-route target: the explicit ?next= wins; otherwise whatever a
  // mid-flow guard stored (peeked here, consumed at return time).
  const [returnTo] = useState<string | null>(() => {
    const next = initialNext.trim();
    return isSafeLocalPath(next) ? next : peekInterruptedRoute();
  });

  /** One-shot captcha: the server burns it on every attempt — always refresh. */
  const refreshCaptcha = (): void => {
    setCaptcha('');
    setCaptchaSrc(`${CAPTCHA_SRC}?t=${Date.now()}`);
  };

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

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const established = await passwordLogin(
        employeeCode.trim(),
        password,
        captcha.trim(),
      );
      setSession(established);
      onSignedIn?.(established);
    } catch (err) {
      setError(flowErrorFrom(err));
      // The captcha is one-shot — every attempt burns it (fresh image next try).
      refreshCaptcha();
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
      setPassword('');
      refreshCaptcha();
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
              {t("Office sign-in: employee code, password and captcha.")}
            </p>
          </div>
        </div>

        {session === null && (
          <form onSubmit={handleSignIn} noValidate>
            <label htmlFor="login-employee-code" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
              {t("Employee code or username")}
            </label>
            <input
              id="login-employee-code"
              type="text"
              autoComplete="username"
              required
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
            />

            <label htmlFor="login-password" className="block text-xs font-bold text-[#2E4A3E] mb-1.5 mt-4">
              {t("Password")}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
            />

            <label htmlFor="login-captcha" className="block text-xs font-bold text-[#2E4A3E] mb-1.5 mt-4">
              {t("Captcha")}
            </label>
            <div className="flex items-center space-x-2.5 mb-2">
              <img
                src={captchaSrc}
                alt={t("Captcha image")}
                className="h-12 rounded-lg border border-[#E2ECE7] bg-white"
              />
              <button
                type="button"
                onClick={refreshCaptcha}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("Refresh captcha")}</span>
              </button>
            </div>
            <input
              id="login-captcha"
              type="text"
              autoComplete="off"
              maxLength={8}
              required
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              placeholder={t("Enter the characters shown in the image.")}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
            />

            <button
              type="submit"
              disabled={busy || employeeCode.trim() === '' || password === '' || captcha.trim() === ''}
              className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
            >
              {busy ? busyIcon : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              <span>{busy ? t("Signing in…") : t("Sign in")}</span>
            </button>
          </form>
        )}

        {session !== null && (
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
