/**
 * Dashboards panel (M6 D5 slice 4) — the D4 read-only analytics endpoints:
 *   GET /admin/api/v1/dashboards/zone/     — derived metrics + audit tail
 *   GET /admin/api/v1/dashboards/officers/ — ranked officer evaluations
 *   GET /admin/api/v1/dashboards/audit/    — recent audit-trail activity
 *
 * Read-only over AuditLog + SLAEvent; counters are derived at query time (P4 —
 * no duplicated tallies). Metric blocks render defensively over their payload
 * shape; the audit rows are the tight AuditRow contract.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Users } from 'lucide-react';
import { ApiError } from '../lib/api';
import { t } from '../i18n';
import {
  AuditFeed,
  AuditRow,
  OfficerRatings,
  ZoneDashboard,
  fetchAuditFeed,
  fetchOfficerRatings,
  fetchZoneDashboard,
} from '../lib/adminApi';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 401
      ? t('Please sign in as an administrator to use this desk.')
      : err.message;
  }
  return t('Something went wrong.');
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/** Generic metric chip: scalar values render big, everything else in words. */
const MetricChip: React.FC<{ name: string; value: unknown }> = ({ name, value }) => (
  <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7] text-center">
    <div className="font-mono text-xl font-black text-[#103125]">
      {value === null || value === undefined ? '—'
        : typeof value === 'number' || typeof value === 'string' ? String(value)
        : Array.isArray(value) ? value.length
        : '…'}
    </div>
    <div className="text-[#5A7366] text-[11px] font-bold uppercase">{name.replace(/_/g, ' ')}</div>
  </div>
);

const AuditTable: React.FC<{ rows: AuditRow[] }> = ({ rows }) => (
  <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
    <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
      <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase text-[11px]">
        <tr>
          <th className="p-3">#</th>
          <th className="p-3">{t('When')}</th>
          <th className="p-3">{t('Actor')}</th>
          <th className="p-3">{t('Action')}</th>
          <th className="p-3">{t('Outcome')}</th>
          <th className="p-3">{t('Object')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
        {rows.map((row) => (
          <tr key={`${row.seq}-${row.timestamp}`} className="hover:bg-[#F4F8F6]/60">
            <td className="p-3 font-mono text-[#5A7366]">{row.seq}</td>
            <td className="p-3 font-mono">{formatStamp(row.timestamp)}</td>
            <td className="p-3 font-semibold">{row.actor_label}</td>
            <td className="p-3">{row.action}</td>
            <td className="p-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                String(row.outcome).toLowerCase().includes('fail') || String(row.outcome).toLowerCase().includes('denied')
                  ? 'bg-rose-100 text-rose-800' : 'bg-brand-100 text-brand-800'
              }`}>{row.outcome}</span>
            </td>
            <td className="p-3 font-mono text-[11px]">{row.object_type}:{row.object_id}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={6} className="p-6 text-center text-[#5A7366]">{t('No audit activity recorded.')}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

/** One officer evaluation card; rating-ish scalars get a star strip. */
const OfficerCard: React.FC<{ officer: Record<string, unknown> }> = ({ officer }) => {
  const ratingEntry = Object.entries(officer).find(
    ([k, v]) => typeof v === 'number' && /rat|score|star/i.test(k),
  );
  return (
    <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-xs space-y-1.5">
      <div className="font-bold text-[#103125]">
        {String(officer.name ?? officer.username ?? officer.officer ?? t('Officer'))}
      </div>
      {ratingEntry && (
        <div className="text-amber-500 font-bold">
          {'★'.repeat(Math.max(0, Math.min(5, Math.round(ratingEntry[1] as number))))}
          <span className="text-[#5A7366] ml-1.5">{ratingEntry[0]}: {String(ratingEntry[1])}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-[#5A7366]">
        {Object.entries(officer)
          .filter(([k]) => !/rat|score|star/i.test(k))
          .slice(0, 8)
          .map(([k, v]) => (
            <div key={k}>
              <span className="font-bold text-[#103125]">{k.replace(/_/g, ' ')}:</span>{' '}
              {v === null || v === undefined ? '—'
                : typeof v === 'object' ? (Array.isArray(v) ? `${v.length}` : '…')
                : String(v)}
            </div>
          ))}
      </div>
    </div>
  );
};

export const DashboardsPanel: React.FC<{ zoneCode: string }> = ({ zoneCode }) => {
  const zone = zoneCode === 'All' ? undefined : zoneCode;
  const [dashboard, setDashboard] = useState<ZoneDashboard | null>(null);
  const [ratings, setRatings] = useState<OfficerRatings | null>(null);
  const [audit, setAudit] = useState<AuditFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r, a] = await Promise.all([
        fetchZoneDashboard({ zone, limit: 15 }),
        fetchOfficerRatings({ zone }),
        fetchAuditFeed({ zone, limit: 30 }),
      ]);
      setDashboard(d);
      setRatings(r);
      setAudit(a);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [zone]);

  useEffect(() => {
    void load();
  }, [load]);

  const metricEntries = dashboard
    ? Object.entries(dashboard).filter(([key]) => key !== 'recent_audit' && key !== 'zone_code')
    : [];

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
      <div className="border-b border-[#E2ECE7] pb-4">
        <h3 className="text-lg font-bold text-[#103125]">{t('Zone Dashboards')}</h3>
        <p className="text-xs text-[#5A7366]">
          {t('Derived metrics, officer evaluations and the live audit tail — computed at query time, no stored counters.')}
          {dashboard ? ` — ${t('Zone:')} ${dashboard.zone_code}` : ''}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button onClick={() => void load()} className="underline font-bold">{t('Retry')}</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-[#5A7366]">{t('Loading dashboards…')}</div>
      ) : (
        <>
          {/* Derived metrics */}
          {metricEntries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metricEntries.map(([k, v]) => <MetricChip key={k} name={k} value={v} />)}
            </div>
          )}

          {/* Officer evaluations */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[#103125] flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {t('Officer Evaluations')} ({ratings?.officers.length ?? 0})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(ratings?.officers ?? []).map((officer, i) => (
                <OfficerCard key={i} officer={officer as Record<string, unknown>} />
              ))}
            </div>
            {(ratings?.officers.length ?? 0) === 0 && (
              <div className="p-6 text-center text-xs text-[#5A7366]">{t('No officer evaluations for this period.')}</div>
            )}
          </div>

          {/* Audit tail */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-[#103125] flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {t('Recent Audit Activity')}
            </h4>
            <AuditTable rows={audit?.results ?? []} />
          </div>

          {/* Zone dashboard audit tail (server-attached) */}
          {(dashboard?.recent_audit.length ?? 0) > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-[#103125]">{t('Zone Audit Tail')}</h4>
              <AuditTable rows={dashboard?.recent_audit ?? []} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
