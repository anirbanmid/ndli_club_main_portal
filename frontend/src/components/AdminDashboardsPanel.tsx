/**
 * Admin Performance Dashboard Panel — Central Administration Office (Tier 2).
 *
 * Strict parity with the previous project's `templates/admin.html`:
 * - Top 5 zero-jargon KPI cards (Total NDLI Clubs, Total Daily Support Logs,
 *   Active Nodal Officers, Renewal Attention Required, 30-Day Escalations).
 * - Action toolbar with "Download Master CSV" (streaming enriched club metadata,
 *   authorities contacts, member counts, and solo/joint Inter-Club Shield activities).
 * - 36-State & UT Geographical Breakdown table (real-time from telemetry).
 * - Nodal Employee Performance Matrix & Rating (EMP01–EMP07 evaluated on the
 *   official 50/30/20/10 weighted formula with star ratings).
 * - Recent Audit Activity Stream.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Layers,
  MapPin,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { ApiError, TelemetryPayload, fetchTelemetry } from '../lib/api';
import { t } from '../i18n';
import {
  AuditFeed,
  AuditRow,
  OfficerEvaluation,
  OfficerRatings,
  ZoneDashboard,
  fetchAuditFeed,
  fetchOfficerRatings,
  fetchZoneDashboard,
  getMasterClubsExportUrl,
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

interface StatCardProps {
  label: string;
  value: number | string;
  desc: string;
  badge?: string;
  icon: React.ReactNode;
  variant?: 'green' | 'amber' | 'blue' | 'purple' | 'rose';
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  desc,
  badge,
  icon,
  variant = 'green',
}) => {
  const colorStyles = {
    green: {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-800',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-900 border-amber-200',
      iconBg: 'bg-amber-100 text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-800',
    },
    blue: {
      bg: 'bg-sky-50 text-sky-900 border-sky-200',
      iconBg: 'bg-sky-100 text-sky-700',
      badgeBg: 'bg-sky-100 text-sky-800',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-900 border-purple-200',
      iconBg: 'bg-purple-100 text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-800',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-900 border-rose-200',
      iconBg: 'bg-rose-100 text-rose-700',
      badgeBg: 'bg-rose-100 text-rose-800',
    },
  }[variant];

  return (
    <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3 transition-all hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ${colorStyles.iconBg}`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colorStyles.badgeBg}`}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <div className="text-3xl font-extrabold text-[#103125] tracking-tight">
          {value}
        </div>
        <div className="text-xs font-bold text-[#2E4A3E] mt-0.5">
          {label}
        </div>
        <div className="text-[11px] text-[#5A7366] mt-1">
          {desc}
        </div>
      </div>
    </div>
  );
};

export const DashboardsPanel: React.FC<{ zoneCode: string }> = ({ zoneCode }) => {
  const zone = zoneCode === 'All' ? undefined : zoneCode;
  const [dashboard, setDashboard] = useState<ZoneDashboard | null>(null);
  const [ratings, setRatings] = useState<OfficerRatings | null>(null);
  const [audit, setAudit] = useState<AuditFeed | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r, a, tData] = await Promise.all([
        fetchZoneDashboard({ zone, limit: 15 }),
        fetchOfficerRatings({ zone }),
        fetchAuditFeed({ zone, limit: 20 }),
        fetchTelemetry().catch(() => null),
      ]);
      setDashboard(d);
      setRatings(r);
      setAudit(a);
      setTelemetry(tData);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [zone]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDownloadMasterCSV = () => {
    window.open(getMasterClubsExportUrl(), '_blank');
  };

  // Filter telemetry states by zone if needed
  const stateRows = (telemetry?.states ?? []).filter((s) => {
    if (!zone || zone === 'All') return true;
    return s.zone?.toUpperCase() === zone.toUpperCase();
  });

  const totals = {
    institutions: stateRows.reduce((acc, s) => acc + (s.institutions || 0), 0),
    clubs: stateRows.reduce((acc, s) => acc + (s.clubs || 0), 0),
    members: stateRows.reduce((acc, s) => acc + (s.members || 0), 0),
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#E2ECE7] shadow-xs">
        <div>
          <h3 className="text-base font-extrabold text-[#103125]">
            {t('Operational Overview & Analytical Matrix')}
          </h3>
          <p className="text-xs text-[#5A7366]">
            {zoneCode === 'All'
              ? t('National Overview across all 6 Regional Zones and 36 States/UTs')
              : `${t('Filtered Region:')} ${zoneCode} Zone`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadMasterCSV}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B45309] hover:bg-amber-700 text-white flex items-center gap-2 shadow-xs transition-colors"
            title={t('Download enriched master_clubs.csv with contacts, members, and Shield activities')}
          >
            <Download className="w-4 h-4" />
            <span>{t('Download Master CSV')}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('Refresh')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => void loadData()} className="underline font-bold">
            {t('Retry')}
          </button>
        </div>
      )}

      {/* Top 5 Zero-Jargon KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label={t('Total NDLI Clubs')}
          value={dashboard ? dashboard.total_clubs : '—'}
          desc={t('Across all 36 States & UTs')}
          badge={t('National Registry')}
          icon={<Building2 className="w-5 h-5" />}
          variant="green"
        />

        <StatCard
          label={t('Daily Support Logs')}
          value={dashboard ? dashboard.total_activities : '—'}
          desc={t('Real-time from daily employee support logs')}
          badge={t('Live Activity')}
          icon={<PhoneCall className="w-5 h-5" />}
          variant="purple"
        />

        <StatCard
          label={t('Active Nodal Officers')}
          value={dashboard ? dashboard.active_officers : '—'}
          desc={t('Assigned across 6 National Zones (EMP01–EMP07)')}
          badge={t('6 Zones Active')}
          icon={<Users className="w-5 h-5" />}
          variant="blue"
        />

        <StatCard
          label={t('Renewal Attention')}
          value={dashboard ? dashboard.renewal_attention : '—'}
          desc={t('Clubs in upcoming renewal window or expired')}
          badge={t('Renewal Protocol')}
          icon={<Calendar className="w-5 h-5" />}
          variant="amber"
        />

        <StatCard
          label={t('30-Day Escalations')}
          value={dashboard ? dashboard.escalations_30d : '—'}
          desc={t('Pending issue tickets past 30-day escalation SLA')}
          badge={t('SLA Monitor')}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="rose"
        />
      </div>

      {/* State-Wise Geographical Breakdown Table */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-700" />
              {t('National State-Wise Breakdown (36 States & Union Territories)')}
            </h4>
            <p className="text-xs text-[#5A7366]">
              {t('Comprehensive public telemetry across all administrative divisions')}
            </p>
          </div>
          <span className="text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] px-3 py-1 rounded-full border border-[#E2ECE7]">
            {stateRows.length} {t('Divisions Displayed')}
          </span>
        </div>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3 w-12">#</th>
                <th className="p-3">{t('State / Union Territory')}</th>
                <th className="p-3">{t('Zone')}</th>
                <th className="p-3 text-right">{t('Institutions')}</th>
                <th className="p-3 text-right">{t('Active Clubs')}</th>
                <th className="p-3 text-right">{t('Verified Members')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {stateRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#5A7366]">
                    {loading ? t('Loading telemetry data…') : t('No state telemetry available.')}
                  </td>
                </tr>
              ) : (
                stateRows.map((row, index) => (
                  <tr key={row.code} className="hover:bg-[#F4F8F6]/60 transition-colors">
                    <td className="p-3 font-mono text-[#5A7366]">{index + 1}</td>
                    <td className="p-3 font-bold text-[#103125]">{row.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-[#F4F8F6] text-[#2E4A3E] font-semibold text-[10px] border border-[#E2ECE7]">
                        {row.zone}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{row.institutions.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">{row.clubs.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-[#5A7366]">{row.members.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            {stateRows.length > 0 && (
              <tfoot className="bg-[#F4F8F6] font-bold text-[#103125] border-t-2 border-[#DCE7E1]">
                <tr>
                  <td className="p-3" colSpan={3}>{t('National Totals')}</td>
                  <td className="p-3 text-right font-mono">{totals.institutions.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-emerald-800">{totals.clubs.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{totals.members.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Nodal Employee Performance Matrix & Rating */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              {t('Nodal Employee Performance Matrix & Star Ratings')}
            </h4>
            <p className="text-xs text-[#5A7366]">
              {t('Official scoring formula: 50% Clubs Approved + 30% Other Supports + 20% Offline Training + 10% Online Training')}
            </p>
          </div>
          <span className="text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] px-3 py-1 rounded-full border border-[#E2ECE7]">
            {ratings?.officers.length ?? 0} {t('Officers Evaluated')}
          </span>
        </div>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">{t('Nodal Officer')}</th>
                <th className="p-3">{t('Assigned Zone')}</th>
                <th className="p-3 text-right">{t('Clubs Approved (50%)')}</th>
                <th className="p-3 text-right">{t('Other Supports (30%)')}</th>
                <th className="p-3 text-right">{t('Offline Training (20%)')}</th>
                <th className="p-3 text-right">{t('Online Training (10%)')}</th>
                <th className="p-3 text-right">{t('Composite Score')}</th>
                <th className="p-3 text-center">{t('Star Rating')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {(ratings?.officers.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#5A7366]">
                    {loading ? t('Evaluating regional officers…') : t('No officer evaluation records available for this cycle.')}
                  </td>
                </tr>
              ) : (
                (ratings?.officers ?? []).map((o: OfficerEvaluation, i: number) => {
                  const stars = Math.max(1, Math.min(5, Math.round(Number(o.stars || o.star_rating || 3))));
                  return (
                    <tr key={i} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3 font-bold text-[#103125]">
                        {String(o.officer ?? o.username ?? o.name ?? `EMP0${i + 1}`)}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold text-[10px] border border-emerald-200">
                          {String(o.zone_code ?? o.zone ?? '—')}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">{String(o.clubs_approved ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{String(o.other_supports ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{String(o.offline_training ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{String(o.online_training ?? 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-[#103125]">
                        {String(o.weighted_score ?? o.score ?? '—')}
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center text-amber-500">
                          {'★'.repeat(stars)}
                          <span className="text-[#5A7366] text-[10px] ml-1.5 font-bold">
                            ({stars}/5)
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live System Audit Feed */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-700" />
          {t('National Administrative Audit Stream')}
        </h4>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">{t('Timestamp')}</th>
                <th className="p-3">{t('Actor')}</th>
                <th className="p-3">{t('Action Performed')}</th>
                <th className="p-3">{t('Outcome')}</th>
                <th className="p-3">{t('Target Entity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {(audit?.results.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#5A7366]">
                    {loading ? t('Loading audit stream…') : t('No recent audit activity recorded.')}
                  </td>
                </tr>
              ) : (
                audit?.results.map((row: AuditRow) => (
                  <tr key={`${row.seq}-${row.timestamp}`} className="hover:bg-[#F4F8F6]/60 transition-colors">
                    <td className="p-3 font-mono text-[#5A7366]">{row.seq}</td>
                    <td className="p-3 font-mono">{formatStamp(row.timestamp)}</td>
                    <td className="p-3 font-semibold text-[#103125]">{row.actor_label}</td>
                    <td className="p-3">{row.action}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          String(row.outcome).toLowerCase().includes('fail') ||
                          String(row.outcome).toLowerCase().includes('denied')
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {row.outcome}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#5A7366]">
                      {row.object_type}:{row.object_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
