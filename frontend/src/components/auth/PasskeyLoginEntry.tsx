import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  AuthApiError,
  completeJoin,
  detailMessage,
  JoinResult,
  requestJoinOtp,
} from '../../lib/authApi';

/**
 * M5-D1 passkey login entry point (BRIEF_M5 §3 D1: "passkey login entry …
 * alongside passwordless QR path").
 *
 * The campus passkey (human-typable code like KGP-7F2Q) + registered email
 * opens the passwordless door: OTP request -> OTP -> completion. When the
 * visitor arrived by scanning a club QR, the join token rides along (the
 * "passwordless QR path", W5). There is no WebAuthn surface server-side and
 * M5 adds no endpoints (M5-A2) — this entry uses the shipped passkey door.
 *
 * Verdict discipline (F2, P4): every API `detail` is rendered VERBATIM; the
 * full join choreography (scanner states, ineligible verdict screens) is D3
 * and will wrap this entry.
 */

interface PasskeyLoginEntryProps {
  /** Join token carried by the scanned QR (passwordless QR path, W5). */
  token?: string;
}

type Phase = 'form' | 'code' | 'done';

type FlowError =
  | { kind: 'verdict' | 'rate-limit'; message: string }
  | { kind: 'network' | 'server' };

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

export const PasskeyLoginEntry: React.FC<PasskeyLoginEntryProps> = ({ token = '' }) => {
  const [phase, setPhase] = useState<Phase>('form');
  const [passkey, setPasskey] = useState('');
  const [email, setEmail] = useState('');
  const [joinToken, setJoinToken] = useState(token);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<FlowError | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRequestOtp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const accepted = await requestJoinOtp({
        passkey: passkey.trim(),
        token: joinToken.trim(),
        email: email.trim(),
      });
      setNotice(accepted.detail);
      setPhase('code');
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const completed = await completeJoin({
        passkey: passkey.trim(),
        token: joinToken.trim(),
        email: email.trim(),
        code: code.trim(),
      });
      setResult(completed);
      setPhase('done');
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  const resultDetail = result !== null ? detailMessage(result) : null;
  const resultStatus =
    result !== null && typeof result.status === 'string' ? result.status : null;

  return (
    <div className="rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] p-4 sm:p-5">
      <div className="flex items-center space-x-2 mb-3">
        <KeyRound className="h-4 w-4 text-[#B45309]" aria-hidden="true" />
        <p className="text-sm font-bold text-[#103125]">{t("Campus passkey sign-in")}</p>
      </div>

      {phase === 'form' && (
        <form onSubmit={handleRequestOtp} noValidate>
          <label htmlFor="passkey-code" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t("Passkey code")}
          </label>
          <input
            id="passkey-code"
            type="text"
            autoComplete="off"
            required
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-white text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <label htmlFor="passkey-email" className="block text-xs font-bold text-[#2E4A3E] mb-1.5 mt-3">
            {t("Registered email")}
          </label>
          <input
            id="passkey-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-white text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <label htmlFor="passkey-token" className="block text-xs font-bold text-[#2E4A3E] mb-1.5 mt-3">
            {t("QR join token (optional)")}
          </label>
          <input
            id="passkey-token"
            type="text"
            autoComplete="off"
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-white text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <button
            type="submit"
            disabled={busy || passkey.trim() === '' || email.trim() === ''}
            className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
          >
            {busy ? busyIcon : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            <span>{busy ? t("Sending…") : t("Send code")}</span>
          </button>
        </form>
      )}

      {phase === 'code' && (
        <form onSubmit={handleComplete} noValidate>
          <p className="text-sm text-[#2E4A3E] mb-3">
            {t("Enter the code sent to your registered email.")}
          </p>
          <label htmlFor="passkey-otp" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t("Verification code")}
          </label>
          <input
            id="passkey-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-white text-sm text-[#103125] tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <button
            type="submit"
            disabled={busy || code.trim() === ''}
            className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
          >
            {busy ? busyIcon : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            <span>{busy ? t("Verifying…") : t("Verify code")}</span>
          </button>
        </form>
      )}

      {phase === 'done' && (
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-[#0D7751]" aria-hidden="true" />
            <p className="text-sm font-bold text-[#103125]">{t("Your request has been received.")}</p>
          </div>
          {/* API fields rendered as returned (P4) — D3 owns the full join UI. */}
          {resultStatus !== null && (
            <p className="text-xs text-[#2E4A3E]">
              <span className="font-bold">{t("Account state")}: </span>
              {resultStatus}
            </p>
          )}
          {resultDetail !== null && (
            <p className="text-xs text-[#2E4A3E] mt-1">{resultDetail}</p>
          )}
        </div>
      )}

      {notice !== null && (
        <p role="status" className="mt-3 flex items-start space-x-1.5 text-xs text-[#0D7751]">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-3 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {flowErrorText(error, t)}
          </span>
        </p>
      )}
    </div>
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
