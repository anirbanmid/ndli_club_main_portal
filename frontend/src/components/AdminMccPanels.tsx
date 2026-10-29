/**
 * MCC panels for the Admin Module (M6 D5 slice 3) — the D5 backend trio UI:
 *
 *   RenewalDesk   — the EMP zone desk + MCC attention queue. BOTH Q1 paths:
 *                   Path A: a club's open request (status=requested) -> issue /
 *                   reject; Path B: issue directly from the attention queue
 *                   (overdue OR due <=30d, per C3; anchor = formation or last
 *                   renewal + 1y). Server-scoped: zone officers see their duty
 *                   set only (P0 — out-of-zone rows are indistinguishable).
 *   InsightsPanel — the read-only MCC strategic report (apps.governance
 *                   insights). Rendered defensively over the report shape.
 *   RedZoneReset  — the guarded hard reset (apps.data_admin). RED ZONE: the UI
 *                   will not call until the operator types the exact confirm
 *                   phrase; the server independently enforces its own triple
 *                   guard and aborts if the safety checkpoint cannot be written.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Lock, RefreshCw, ShieldCheck, X, Zap } from 'lucide-react';
import { ApiError } from '../lib/api';
import { t } from '../i18n';
import { fetchInsightsReport, fetchRenewalAttention, fetchRenewalHistory, fetchSecurityChallenge, HARD_RESET_CONFIRM_PHRASE, hardReset, HardResetResult, InsightsReport, issueRenewal, issueRenewalDirect, rejectRenewal, RenewalAttentionRow, RenewalRecordRow } from '../lib/adminApi';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 401
      ? t('Please sign in as an administrator to use this desk.')
      : err.message;
  }
  return t('Something went wrong.');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Renewal desk — attention queue (Path B) + open requests (Path A) + history
// ---------------------------------------------------------------------------

const RECORD_STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  issued: 'Issued',
  rejected: 'Rejected',
};

export const RenewalDesk: React.FC = () => {
  const [attention, setAttention] = useState<RenewalAttentionRow[]>([]);
  const [history, setHistory] = useState<RenewalRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [att, hist] = await Promise.all([
        fetchRenewalAttention(),
        fetchRenewalHistory(),
      ]);
      setAttention(att.results);
      setHistory(hist.results);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onIssueDirect = async (clubCode: string) => {
    setBusy(`direct:${clubCode}`);
    setNotice(null);
    try {
      const row = await issueRenewalDirect({ club_code: clubCode });
      setNotice(
        `${t('Certificate issued for')} ${clubCode}${row.certificate_id ? ` (${row.certificate_id})` : ''}`,
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onIssueRequest = async (id: number, clubCode: string) => {
    setBusy(`req:${id}`);
    setNotice(null);
    try {
      const row = await issueRenewal(id);
      setNotice(
        `${t('Renewal request issued for')} ${clubCode}${row.certificate_id ? ` (${row.certificate_id})` : ''}`,
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onRejectRequest = async (id: number) => {
    const reason = window.prompt(t('Reason for rejecting this renewal request:'), '');
    if (reason === null || !reason.trim()) return;
    setBusy(`rej:${id}`);
    setNotice(null);
    try {
      await rejectRenewal(id, { reason: reason.trim() });
      setNotice(t('Renewal request rejected.'));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const openRequests = history.filter((r) => r.status === 'requested');

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
      <div className="border-b border-[#E2ECE7] pb-4">
        <h3 className="text-lg font-bold text-[#103125]">{t('Renewal Desk')}</h3>
        <p className="text-xs text-[#5A7366]">
          {t('Issue renewal certificates both ways: straight from the attention queue (due or overdue), or from a club’s open request. Anchor = formation / last renewal + 1 year; attention window = 30 days.')}
        </p>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-semibold">{notice}</div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button onClick={() => void load()} className="underline font-bold">{t('Retry')}</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-[#5A7366]">{t('Loading renewal desk…')}</div>
      ) : (
        <>
          {/* Attention queue — Path B: issue directly */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[#103125] flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {t('Attention Queue (due or overdue ≤ 30 days)')} ({attention.length})
            </h4>
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">{t('Club')}</th>
                    <th className="p-3">{t('Zone')}</th>
                    <th className="p-3">{t('Due Date')}</th>
                    <th className="p-3">{t('Days Left')}</th>
                    <th className="p-3">{t('Last Renewal')}</th>
                    <th className="p-3 text-right">{t('Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {attention.map((row) => (
                    <tr key={row.club_code} className="hover:bg-[#F4F8F6]/60">
                      <td className="p-3">
                        <div className="font-bold text-[#103125]">{row.club_name}</div>
                        <div className="font-mono text-[11px] text-[#5A7366]">{row.club_code}</div>
                      </td>
                      <td className="p-3">{row.zone_code}</td>
                      <td className="p-3 font-mono">{formatDate(row.due_date)}</td>
                      <td className="p-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          row.days_left < 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {row.days_left < 0 ? `${-row.days_left}d ${t('overdue')}` : `${row.days_left}d`}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{formatDate(row.last_renewal_date)}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => void onIssueDirect(row.club_code)}
                          disabled={busy === `direct:${row.club_code}`}
                          className="px-3 py-1 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs disabled:opacity-50"
                        >
                          {t('Issue Certificate')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {attention.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-[#5A7366]">{t('Nothing due in the next 30 days.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open requests — Path A: club asked, EMP decides */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[#103125] flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> {t('Open Club Requests')} ({openRequests.length})
            </h4>
            <div className="space-y-2">
              {openRequests.map((row) => (
                <div key={row.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-xs flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <div className="font-bold text-[#103125] font-mono">{row.club_code}</div>
                    <div className="text-[#5A7366]">
                      {t('Requested:')} {formatDate(row.requested_at)}
                      {row.request_note ? ` • ${row.request_note}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void onIssueRequest(row.id, row.club_code)}
                      disabled={busy === `req:${row.id}`}
                      className="px-3 py-1 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs disabled:opacity-50"
                    >
                      {t('Issue Certificate')}
                    </button>
                    <button
                      onClick={() => void onRejectRequest(row.id)}
                      disabled={busy === `rej:${row.id}`}
                      className="px-3 py-1 rounded-lg border border-rose-300 bg-white text-rose-700 font-bold hover:bg-rose-50 shadow-2xs disabled:opacity-50"
                    >
                      {t('Reject')}
                    </button>
                  </div>
                </div>
              ))}
              {openRequests.length === 0 && (
                <div className="p-6 text-center text-xs text-[#5A7366]">{t('No open renewal requests.')}</div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[#103125]">{t('Renewal History')}</h4>
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">{t('Club')}</th>
                    <th className="p-3">{t('Status')}</th>
                    <th className="p-3">{t('Requested')}</th>
                    <th className="p-3">{t('Decided')}</th>
                    <th className="p-3">{t('Certificate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {history.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F4F8F6]/60">
                      <td className="p-3 font-mono font-bold text-[#103125]">{row.club_code}</td>
                      <td className="p-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          row.status === 'issued' ? 'bg-brand-100 text-brand-800'
                            : row.status === 'rejected' ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {t(RECORD_STATUS_LABEL[row.status] ?? row.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{formatDate(row.requested_at)}</td>
                      <td className="p-3 font-mono">{formatDate(row.decided_at)}</td>
                      <td className="p-3 font-mono">{row.certificate_id ?? '—'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-[#5A7366]">{t('No renewal records yet.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// MCC insights — read-only strategic report, rendered defensively
// ---------------------------------------------------------------------------

const ReportValue: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null || value === undefined) return <span className="text-[#5A7366]">—</span>;
  if (typeof value === 'boolean') return <span>{value ? t('yes') : t('no')}</span>;
  if (typeof value === 'number' || typeof value === 'string') return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[#5A7366]">—</span>;
    if (value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
      const keys = Array.from(
        value.reduce<Set<string>>((acc, v) => {
          Object.keys(v as Record<string, unknown>).forEach((k) => acc.add(k));
          return acc;
        }, new Set<string>()),
      );
      return (
        <div className="overflow-x-auto border border-[#E2ECE7] rounded-xl">
          <table className="w-full text-left text-[11px] divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase">
              <tr>{keys.map((k) => <th key={k} className="p-2">{k.replace(/_/g, ' ')}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7]">
              {value.map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k} className="p-2 align-top"><ReportValue value={(row as Record<string, unknown>)[k]} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <span>{value.map((v) => String(v)).join(', ')}</span>;
  }
  return <ReportValue value={Object.entries(value as Record<string, unknown>)} />;
};

const ReportSection: React.FC<{ name: string; value: unknown }> = ({ name, value }) => {
  const isRecList = Array.isArray(value) && value.some(
    (v) => v !== null && typeof v === 'object' && 'title' in (v as Record<string, unknown>),
  );
  if (isRecList) {
    return (
      <div className="space-y-2">
        <h4 className="font-bold text-sm text-[#103125]">{name.replace(/_/g, ' ')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(value as Array<Record<string, unknown>>).map((rec, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                {typeof rec.priority === 'string' && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    rec.priority === 'High' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>{rec.priority}</span>
                )}
                {typeof rec.category === 'string' && (
                  <span className="text-[11px] font-bold text-[#0D7751] bg-brand-100 px-2 py-0.5 rounded">{rec.category}</span>
                )}
              </div>
              <div className="font-bold text-[#103125]">{String(rec.title ?? '')}</div>
              {rec.insight !== undefined && <p className="text-[#5A7366]">{String(rec.insight)}</p>}
              {rec.action !== undefined && <p className="text-brand-800 font-semibold">{String(rec.action)}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <h4 className="font-bold text-sm text-[#103125]">{name.replace(/_/g, ' ')}</h4>
      <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-xs">
        <ReportValue value={value} />
      </div>
    </div>
  );
};

export const InsightsPanel: React.FC = () => {
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchInsightsReport());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const penetration = report?.penetration;
  const renewalHealth = report?.renewal_health;
  const recommendations = report?.strategic_recommendations ?? [];
  const roadmap = report?.roadmap ?? [];
  const unrepresented = penetration?.unrepresented_states ?? [];

  return (
    <div className="space-y-6">
      {/* AI Decision Engine Header & Recommendations Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-[#5B45A8] text-white">
                AI Decision Engine
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                Active Strategic Horizon
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-[#103125]">
              {t('AI Strategic Roadmap & Policy Insights')}
            </h3>
            <p className="text-xs text-[#5A7366] max-w-3xl mt-1">
              {t('Automated analytical pipelines processing master records to formulate data-backed recommendations for IIT Kharagpur administration.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#5B45A8] hover:bg-[#4a378a] text-white flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('Re-Analyze Data ↻')}</span>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</span>
            <button onClick={() => void load()} className="underline font-bold">{t('Retry')}</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-xs text-[#5A7366] flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#5B45A8]" />
            <span>Running neural decision heuristics across master records...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations.map((rec, i) => {
                const isHigh = rec.priority === 'High';
                return (
                  <div
                    key={i}
                    className="p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-xs transition-shadow"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            isHigh
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {rec.priority} Priority
                        </span>
                        <span className="text-[10px] font-bold text-[#0D7751] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {rec.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-[#103125]">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-[#5A7366] leading-relaxed">
                        {rec.insight}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-[11px] text-[#0A5C3E] leading-relaxed">
                      <strong className="block text-[10px] uppercase font-black tracking-wider text-emerald-900 mb-0.5">
                        Recommended Policy Action:
                      </strong>
                      {rec.action}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* State Penetration Deficit Table */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="border-b border-[#E2ECE7] pb-3">
          <h4 className="text-base font-extrabold text-[#103125]">
            {t('State Penetration Deficit Analysis')}
          </h4>
          <p className="text-xs text-[#5A7366]">
            {t('Identifies States and Union Territories needing immediate outreach campaigns.')}
          </p>
        </div>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">{t('Deficit Category')}</th>
                <th className="p-3 text-center">{t('Count')}</th>
                <th className="p-3">{t('Target States / UTs')}</th>
                <th className="p-3">{t('Recommended Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              <tr>
                <td className="p-3 font-semibold text-rose-700">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-black uppercase mr-1.5">
                    Zero-Club Deficit
                  </span>
                  Unrepresented States
                </td>
                <td className="p-3 text-center font-mono font-bold text-[#103125]">
                  {unrepresented.length} / {penetration?.total_states ?? 36}
                </td>
                <td className="p-3 font-mono text-[11px] text-slate-600 max-w-md">
                  {unrepresented.length > 0
                    ? unrepresented.join(', ')
                    : t('All states and union territories have active club presence.')}
                </td>
                <td className="p-3 text-[11px] text-[#2E4A3E]">
                  Task corresponding regional nodal officers to initiate outreach with State Directorate of Higher Education.
                </td>
              </tr>
              {renewalHealth && (renewalHealth.overdue ?? 0) > 0 && (
                <tr>
                  <td className="p-3 font-semibold text-amber-700">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-black uppercase mr-1.5">
                      Retention Deficit
                    </span>
                    Overdue Renewal Clubs
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-amber-900">
                    {renewalHealth.overdue}
                  </td>
                  <td className="p-3 text-[11px] text-slate-600">
                    Clubs with lapsed 1-year registration validity
                  </td>
                  <td className="p-3 text-[11px] text-[#2E4A3E]">
                    Dispatch automatic reminders and phone support to complete renewal documentation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Growth Horizons (30/90/365-Day Roadmap) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="border-b border-[#E2ECE7] pb-3">
          <h4 className="text-base font-extrabold text-[#103125]">
            {t('Strategic Growth Horizons (30 / 90 / 365-Day Roadmap)')}
          </h4>
          <p className="text-xs text-[#5A7366]">
            {t('Multi-horizon milestones formulated by the administrative guidance heuristics.')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {roadmap.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] space-y-2 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-brand-900 bg-brand-100 px-2.5 py-0.5 rounded-full">
                  {item.horizon_days} Days
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  Horizon {idx + 1}
                </span>
              </div>
              <h5 className="text-sm font-extrabold text-[#103125] pt-1">
                {item.focus}
              </h5>
              <p className="text-xs text-[#5A7366] leading-relaxed">
                {item.goal}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// RED ZONE — guarded hard reset
// ---------------------------------------------------------------------------

export const RedZoneReset: React.FC = () => {
  const [confirm, setConfirm] = useState('');
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HardResetResult | null>(null);

  const phraseOk = confirm.trim() === HARD_RESET_CONFIRM_PHRASE;
  const canSubmit = phraseOk && pin.length > 0 && !busy;

  const onSubmit = () => {
    if (!phraseOk) return;
    const go = window.confirm(
      t('This WIPES all product data (accounts are kept) and writes a safety checkpoint. This is meant for ONE moment: handing the system over clean. Continue?'),
    );
    if (!go) return;
    setError(null);
    setChallengeOpen(true);
  };

  // Dual-Layer Layer 1+2 happen in the modal; this runs only when BOTH pass.
  const onAuthorized = async (challenge: string, captcha: string, secret: string) => {
    setChallengeOpen(false);
    setBusy(true);
    setError(null);
    try {
      setResult(
        await hardReset({
          confirm: confirm.trim(),
          challenge,
          captcha,
          password: secret,
          pin,
        }),
      );
      setConfirm('');
      setPin('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-rose-300 shadow-xs space-y-6">
      <SecurityChallengeModal
        open={challengeOpen}
        domain="server"
        onCancel={() => setChallengeOpen(false)}
        onAuthorize={onAuthorized}
      />
      <div className="border-b border-rose-200 pb-4">
        <h3 className="text-lg font-bold text-rose-800 flex items-center gap-2">
          <Lock className="h-5 w-5" /> {t('Red Zone — Guarded Hard Reset')}
        </h3>
        <p className="text-xs text-rose-700 mt-1">
          {t('Wipes all product data (accounts are kept) and writes a safety checkpoint first. For one moment only: handing the system to the client as a clean, fresh product.')}
        </p>
      </div>

      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('The server independently enforces the triple guard (confirm phrase → handover PIN → Dual-Layer challenge (canvas CAPTCHA + Master Admin password)) and aborts if the safety checkpoint cannot be written.')}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <label className="space-y-1">
          <span className="font-bold text-[#103125]">
            {t('Type the confirm phrase:')} <code className="font-mono bg-[#F4F8F6] px-1 rounded">{HARD_RESET_CONFIRM_PHRASE}</code>
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-[#E2ECE7] rounded-lg px-3 py-2 font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-300"
            placeholder={HARD_RESET_CONFIRM_PHRASE}
          />
        </label>
        <label className="space-y-1">
          <span className="font-bold text-[#103125]">{t('Handover PIN')}</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full border border-[#E2ECE7] rounded-lg px-3 py-2 font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-300"
          />
        </label>
      </div>

      <button
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold transition-all shadow-xs disabled:opacity-40 flex items-center gap-2"
      >
        <Zap className="h-4 w-4" />
        {busy ? t('Resetting…') : t('Execute Hard Reset')}
      </button>

      {result && (
        <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-xs space-y-2">
          <div className="font-bold text-[#103125] flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-700" />
            {result.success ? t('Reset complete — checkpoint written.') : t('Reset did not complete.')}
          </div>
          <div className="text-[#5A7366]">{result.message}</div>
          <div className="grid grid-cols-3 gap-2">
            <div><span className="font-bold text-[#103125]">{t('Accounts kept:')}</span> {result.accounts_kept}</div>
            <div><span className="font-bold text-[#103125]">{t('Rows wiped:')}</span> {result.rows_wiped}</div>
            <div><span className="font-bold text-[#103125]">{t('Checkpoint:')}</span> <span className="font-mono">{result.checkpoint_backup_id}</span></div>
          </div>
          {result.wipe_manifest.length > 0 && (
            <div className="pt-2 border-t border-[#E2ECE7]">
              <span className="font-bold text-[#103125]">{t('Wipe manifest:')}</span>
              <div className="mt-1 space-y-0.5">
                {result.wipe_manifest.map((m) => (
                  <div key={m.model} className="font-mono text-[11px] text-[#5A7366]">{m.model}: {m.objects}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// SECURITY CHALLENGE — Dual-Layer modal (PATCH 0018, PLAN_0018_DUAL_LAYER.md)
// Layer 1: dynamic Canvas CAPTCHA (server-issued, one-shot — every attempt
// burns it). Layer 2: the password of the DOMAIN the action belongs to
// (business -> Central Admin, server -> Master Admin; NEVER MIX — the two
// turfs are enforced server-side; owner rule 2026-10-27).
// ---------------------------------------------------------------------------

export interface SecurityChallengeModalProps {
  open: boolean;
  domain: 'business' | 'server';
  onCancel: () => void;
  onAuthorize: (challenge: string, captcha: string, password: string) => void;
}

export const SecurityChallengeModal: React.FC<SecurityChallengeModalProps> = ({
  open,
  domain,
  onCancel,
  onAuthorize,
}) => {
  type Challenge = Awaited<ReturnType<typeof fetchSecurityChallenge>>;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setAnswer('');
    setSecret('');
    try {
      setChallenge(await fetchSecurityChallenge(domain));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [domain]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !challenge) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, glyphs, noise } = challenge.draw;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#F4F8F6';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1.2;
    for (const line of noise) {
      ctx.strokeStyle = line.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const glyph of glyphs) {
      ctx.save();
      ctx.translate(glyph.x, glyph.y);
      ctx.rotate((glyph.rotate * Math.PI) / 180);
      ctx.fillStyle = glyph.color;
      ctx.fillText(glyph.char, 0, 0);
      ctx.restore();
    }
  }, [challenge]);

  const submit = () => {
    if (!challenge || !answer.trim() || !secret) return;
    onAuthorize(challenge.token, answer.trim(), secret);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border-2 border-[#E2ECE7] shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#103125] flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t('Security Challenge')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('Cancel')}
            className="text-[#5A7366] hover:text-[#103125]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-[#5A7366]">
          {t('Layer 1: type the characters drawn on the canvas (refresh if unreadable). Layer 2: the password of the domain this action belongs to. Every attempt burns the challenge.')}
        </p>
        <div className="flex items-center gap-3">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('security captcha')}
            className="border border-[#E2ECE7] rounded-lg"
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-2 rounded-lg border border-[#E2ECE7] text-[#5A7366] hover:text-[#103125] flex items-center gap-2 text-xs font-semibold"
          >
            <RefreshCw className="h-4 w-4" /> {t('Refresh')}
          </button>
        </div>
        <label className="space-y-1 block">
          <span className="font-bold text-[#103125] text-xs">{t('Captcha answer')}</span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="w-full border border-[#E2ECE7] rounded-lg px-3 py-2 font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-300"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-bold text-[#103125] text-xs">{domain === 'server' ? t('Master Admin password') : t('Central Admin password')}</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full border border-[#E2ECE7] rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-rose-300"
          />
        </label>
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!challenge || !answer.trim() || !secret}
          className="px-5 py-2.5 rounded-xl bg-[#103125] hover:bg-[#1A503E] text-white text-sm font-bold transition-all shadow-xs disabled:opacity-40 flex items-center gap-2"
        >
          <ShieldCheck className="h-4 w-4" />
          {t('Authorize')}
        </button>
      </div>
    </div>
  );
};
