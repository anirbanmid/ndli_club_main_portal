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
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Zap,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { t } from '../i18n';
import {
  HARD_RESET_CONFIRM_PHRASE,
  HardResetResult,
  InsightsReport,
  RenewalAttentionRow,
  RenewalRecordRow,
  fetchInsightsReport,
  fetchRenewalAttention,
  fetchRenewalHistory,
  hardReset,
  issueRenewal,
  issueRenewalDirect,
  rejectRenewal,
} from '../lib/adminApi';

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : t('Something went wrong.');
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

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
      <div className="border-b border-[#E2ECE7] pb-4">
        <h3 className="text-lg font-bold text-[#103125]">{t('MCC Strategic Insights')}</h3>
        <p className="text-xs text-[#5A7366]">
          {t('Derived at query time from the live data (penetration, renewal health, audit mix, recommendations, roadmap). Read-only.')}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button onClick={() => void load()} className="underline font-bold">{t('Retry')}</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-[#5A7366]">{t('Building report…')}</div>
      ) : report ? (
        <div className="space-y-6">
          {Object.entries(report).map(([key, value]) => (
            <ReportSection key={key} name={key} value={value} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// RED ZONE — guarded hard reset
// ---------------------------------------------------------------------------

export const RedZoneReset: React.FC = () => {
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HardResetResult | null>(null);

  const phraseOk = confirm.trim() === HARD_RESET_CONFIRM_PHRASE;
  const canSubmit = phraseOk && password.length > 0 && pin.length > 0 && !busy;

  const onSubmit = async () => {
    if (!phraseOk) return;
    const go = window.confirm(
      t('This WIPES all product data (accounts are kept) and writes a safety checkpoint. This is meant for ONE moment: handing the system over clean. Continue?'),
    );
    if (!go) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await hardReset({ confirm: confirm.trim(), password, pin }));
      setConfirm('');
      setPassword('');
      setPin('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-rose-300 shadow-xs space-y-6">
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
        {t('The server independently enforces the triple guard (confirm phrase → handover PIN → Master Admin re-auth) and aborts if the safety checkpoint cannot be written.')}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
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
          <span className="font-bold text-[#103125]">{t('Master Admin password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-[#E2ECE7] rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-rose-300"
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
