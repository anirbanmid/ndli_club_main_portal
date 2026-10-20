import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  Award,
  User,
  Hash,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { t } from '../i18n';
import { ApiError, verifyCertificate, VerifyVerdict } from '../lib/api';

/**
 * M3 public certificate verifier (DESIGN_M3_VERIFIER §3).
 *
 * Three result states: valid / revoked / unverified. The unverified card is
 * ONE card for every failure mode (unknown id, bad signature, malformed id) —
 * the API returns byte-identical bodies and the UI must not invent a
 * distinction (§4, P0 anti-enumeration). Exactly six disclosure fields.
 */

interface VerifyCertificateViewProps {
  /** Deep-link id (`/verify/?id=…` or legacy `?tab=verify&certId=…`). */
  initialCertId?: string;
}

/** Demo ids from `data/samples/certificates.json` (non-revoked fixtures). */
const SAMPLE_CERTIFICATE_IDS = ['NDLI-DEAL-2345', 'NDLI-BGHJ-7K8M'];

type Phase = 'idle' | 'loading' | 'result';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const VerifyCertificateView: React.FC<VerifyCertificateViewProps> = ({
  initialCertId = '',
}) => {
  const [searchId, setSearchId] = useState(initialCertId);
  const [phase, setPhase] = useState<Phase>('idle');
  const [verdict, setVerdict] = useState<VerifyVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState('');
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const pendingRef = useRef(false);

  const runVerify = (rawId: string) => {
    const id = rawId.trim().toUpperCase();
    if (!id || pendingRef.current) return;
    pendingRef.current = true;
    setSubmittedId(id);
    setPhase('loading');
    setVerdict(null);
    setError(null);
    verifyCertificate(id)
      .then((result) => {
        setVerdict(result);
        setPhase('result');
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.kind === 'rate-limit'
            ? t('Too many verification requests — please wait a moment and try again.')
            : t('Could not reach the verification service. Please check your connection and try again.'),
        );
        setPhase('result');
      })
      .finally(() => {
        pendingRef.current = false;
      });
  };

  // Deep link: auto-verify on mount (QR target /verify/?id=…).
  useEffect(() => {
    if (initialCertId) runVerify(initialCertId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCertId]);

  // Move focus to the result heading after each verdict (WCAG).
  useEffect(() => {
    if (phase === 'result') headingRef.current?.focus();
  }, [phase, verdict, error]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = searchId.trim().toUpperCase();
    if (!id) return;
    // Canonical shareable URL (the QR payload shape).
    window.history.replaceState(null, '', `/verify/?id=${encodeURIComponent(id)}`);
    runVerify(id);
  };

  const handleQuickLookup = (id: string) => {
    setSearchId(id);
    window.history.replaceState(null, '', `/verify/?id=${encodeURIComponent(id)}`);
    runVerify(id);
  };

  const statusText = (status: VerifyVerdict['status']): string =>
    status === 'valid' ? t('Valid') : status === 'revoked' ? t('Revoked') : t('Unverified');

  const renderFields = (v: VerifyVerdict) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <User className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Recipient Name')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{v.name}</div>
      </div>

      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <Award className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Club')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{v.club}</div>
      </div>

      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <Building2 className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Institution')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{v.institution}</div>
      </div>

      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <Calendar className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Date')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{formatDate(v.date)}</div>
      </div>

      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <Award className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Event')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{v.event_title}</div>
      </div>

      <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-1">
        <div className="flex items-center space-x-1.5 text-ink-600 font-semibold uppercase">
          <Hash className="h-3.5 w-3.5 text-brand-600" />
          <span>{t('Status')}</span>
        </div>
        <div className="text-sm font-bold text-ink-900">{statusText(v.status)}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-3.5 py-1 rounded-full text-xs font-bold">
          <ShieldCheck className="h-4 w-4 text-brand-700" />
          <span>{t('Public Credential Verification Portal')}</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900 tracking-tight">
          {t('Verify Official NDLI Club Certificate')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-600 max-w-lg mx-auto">
          {t('Every certificate issued by NDLI Club contains an immutable cryptographic ID and digital signature verified against IIT Kharagpur records.')}
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="bg-white p-6 sm:p-8 rounded-2xl border border-ink-200 shadow-md space-y-4">
        <label className="text-xs font-bold text-ink-700 block" htmlFor="verify-cid-input">
          {t('Enter Certificate Identification Number (CID)')}
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative grow">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-600" />
            <input
              id="verify-cid-input"
              type="text"
              placeholder={t('e.g. NDLI-A7KQ-2M4X')}
              value={searchId}
              onChange={(e) => setSearchId(e.target.value.toUpperCase())}
              required
              className="w-full pl-11 pr-4 py-3 text-sm font-mono font-bold tracking-wider rounded-xl border border-ink-300 focus:ring-2 focus:ring-brand-500 uppercase bg-ink-50"
            />
          </div>

          <button
            type="submit"
            disabled={phase === 'loading'}
            className="px-7 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all shrink-0"
          >
            {phase === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>{t('Verify Authenticity')}</span>
          </button>
        </div>

        {/* Quick sample chips (public demo fixtures) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="text-ink-600 font-medium">{t('Try Sample Verified IDs:')}</span>
          {SAMPLE_CERTIFICATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleQuickLookup(id)}
              className="font-mono text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded border border-brand-200"
            >
              {id}
            </button>
          ))}
        </div>
      </form>

      {/* Result region — announced politely to screen readers */}
      <div aria-live="polite" className="animate-in fade-in">
        {phase === 'loading' && (
          <div className="bg-white rounded-2xl border border-ink-200 p-8 text-center space-y-3 shadow-md">
            <Loader2 className="h-8 w-8 text-brand-600 animate-spin mx-auto" />
            <p className="text-sm text-ink-600">{t('Verifying against IIT Kharagpur records…')}</p>
          </div>
        )}

        {phase === 'result' && error && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-8 text-center space-y-3 shadow-md">
            <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink-900 focus:outline-hidden">
              {t('Verification Service Unavailable')}
            </h3>
            <p className="text-xs text-ink-600 max-w-sm mx-auto">{error}</p>
          </div>
        )}

        {phase === 'result' && !error && verdict?.status === 'valid' && (
          <div className="bg-white rounded-2xl border-2 border-brand-400/80 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-100 pb-5">
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
                    {t('Official Record Confirmed')}
                  </span>
                  <h3 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold text-ink-900 focus:outline-hidden">
                    {t('Valid & Authentic Certificate')}
                  </h3>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono text-xs font-bold text-ink-600 bg-ink-100 px-3 py-1.5 rounded-lg border border-ink-200">
                  {t('CID:')} {submittedId}
                </span>
              </div>
            </div>

            {renderFields(verdict)}
          </div>
        )}

        {phase === 'result' && !error && verdict?.status === 'revoked' && (
          <div className="bg-white rounded-2xl border-2 border-rose-300 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-100 pb-5">
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <XCircle className="h-7 w-7" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    {t('Revocation On Record')}
                  </span>
                  <h3 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold text-ink-900 focus:outline-hidden">
                    {t('Certificate Revoked')}
                  </h3>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono text-xs font-bold text-ink-600 bg-ink-100 px-3 py-1.5 rounded-lg border border-ink-200">
                  {t('CID:')} {submittedId}
                </span>
              </div>
            </div>

            <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">
              {t('This certificate has been revoked by the issuing authority.')}
            </p>

            {renderFields(verdict)}
          </div>
        )}

        {phase === 'result' && !error && verdict?.status === 'invalid' && (
          <div className="bg-white rounded-2xl border-2 border-rose-200 p-8 text-center space-y-3 shadow-md">
            <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <XCircle className="h-7 w-7" />
            </div>
            <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink-900 focus:outline-hidden">
              {t('Certificate Could Not Be Verified')}
            </h3>
            <p className="text-xs text-ink-600 max-w-sm mx-auto">
              {t('The ID you entered')}{' '}
              <strong className="font-mono text-ink-800 font-bold">{submittedId}</strong>{' '}
              {t('could not be verified. Please check the certificate ID printed on the certificate and try again.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
