import React from 'react';
import { BarChart3, Table2, Activity, Building2, Users, Award, Map } from 'lucide-react';
import { t } from '../i18n';
import { TelemetryPayload } from '../lib/api';

/**
 * Live national footprint (DESIGN_M3_VERIFIER / M3-1 telemetry).
 *
 * P4: the chart and the accessible table render from the SAME payload — one
 * computation on the server (domain.telemetry.state_breakdown), one response,
 * two views. Every state/UT appears in the table, zeros included.
 */

interface TelemetrySectionProps {
  data: TelemetryPayload | null;
  loading: boolean;
  failed: boolean;
}

export const TelemetrySection: React.FC<TelemetrySectionProps> = ({ data, loading, failed }) => {
  const rows = data?.states ?? [];
  const maxMembers = rows.reduce((max, row) => Math.max(max, row.members), 0);
  const ranked = [...rows].sort((a, b) => b.members - a.members || a.code.localeCompare(b.code));
  const ordered = [...rows].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6" aria-labelledby="telemetry-heading">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E2ECE7] pb-5">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full mb-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="inline-flex items-center gap-1">
              {t('Live Registry Telemetry')}
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            </span>
          </div>
          <h2 id="telemetry-heading" className="text-2xl font-extrabold text-[#103125] tracking-tight">
            {t('National Footprint Across States & UTs')}
          </h2>
          <p className="text-xs text-[#5A7366] mt-0.5">
            {t('Active institutions, chartered clubs and enrolled members per State / Union Territory — computed live from the central registry.')}
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-[#5A7366] py-6 text-center" role="status">
          {t('Loading registry data…')}
        </p>
      )}

      {failed && !loading && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center" role="status">
          {t('Live registry data is unavailable right now. Please try again shortly.')}
        </p>
      )}

      {data && !loading && (
        <>
          {/* Summary counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-[#E9F5EF] text-[#0D7751] flex items-center justify-center">
                <Map className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-[#103125]">{data.totals.states.toLocaleString()}</div>
                <div className="text-[11px] font-semibold text-[#5A7366] uppercase tracking-wide">{t('States / UTs Covered')}</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-[#E9F5EF] text-[#0D7751] flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-[#103125]">{data.totals.institutions.toLocaleString()}</div>
                <div className="text-[11px] font-semibold text-[#5A7366] uppercase tracking-wide">{t('Active Institutions')}</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-[#E9F5EF] text-[#0D7751] flex items-center justify-center">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-[#103125]">{data.totals.clubs.toLocaleString()}</div>
                <div className="text-[11px] font-semibold text-[#5A7366] uppercase tracking-wide">{t('Chartered Clubs')}</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-[#E9F5EF] text-[#0D7751] flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-[#103125]">{data.totals.members.toLocaleString()}</div>
                <div className="text-[11px] font-semibold text-[#5A7366] uppercase tracking-wide">{t('Enrolled Members')}</div>
              </div>
            </div>
          </div>

          {/* Chart (decorative duplicate of the table below — P4, one payload) */}
          <div className="bg-white rounded-2xl border border-[#E2ECE7] p-6 shadow-xs">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 className="h-4 w-4 text-[#0D7751]" />
              <h3 className="text-sm font-bold text-[#103125]">{t('Active Members by State / UT')}</h3>
            </div>
            <div className="max-h-96 overflow-y-auto pr-2 space-y-1.5" aria-hidden="true">
              {ranked.map((row) => (
                <div key={row.code} className="flex items-center space-x-2 text-[11px]">
                  <div className="w-36 shrink-0 truncate text-[#5A7366] font-medium">{row.name}</div>
                  <div className="grow bg-[#F4F8F6] rounded-full h-3.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1A503E] to-[#0D7751]"
                      style={{ width: `${maxMembers > 0 ? Math.max((row.members / maxMembers) * 100, row.members > 0 ? 2 : 0) : 0}%` }}
                    />
                  </div>
                  <div className="w-12 text-right font-bold text-[#103125]">{row.members.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Accessible table (the chart's equal twin) */}
          <details className="bg-white rounded-2xl border border-[#E2ECE7] p-6 shadow-xs">
            <summary className="flex items-center space-x-2 cursor-pointer text-sm font-bold text-[#103125]">
              <Table2 className="h-4 w-4 text-[#0D7751]" />
              <span>{t('View Full Data Table (All States / UTs)')}</span>
            </summary>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs">
                <caption className="text-left text-[11px] text-[#5A7366] pb-2">
                  {t('Active institutions, clubs and members per State / UT (zero rows included).')}
                </caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#5A7366] border-b border-[#E2ECE7]">
                    <th scope="col" className="py-2 pr-4 font-bold">{t('State / UT')}</th>
                    <th scope="col" className="py-2 pr-4 font-bold">{t('Zone')}</th>
                    <th scope="col" className="py-2 pr-4 font-bold text-right">{t('Institutions')}</th>
                    <th scope="col" className="py-2 pr-4 font-bold text-right">{t('Clubs')}</th>
                    <th scope="col" className="py-2 font-bold text-right">{t('Members')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((row) => (
                    <tr key={row.code} className="border-b border-[#F0F5F2]">
                      <th scope="row" className="py-2 pr-4 text-left font-semibold text-[#103125]">{row.name}</th>
                      <td className="py-2 pr-4 text-[#5A7366]">{t(row.zone)}</td>
                      <td className="py-2 pr-4 text-right text-[#103125]">{row.institutions.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right text-[#103125]">{row.clubs.toLocaleString()}</td>
                      <td className="py-2 text-right text-[#103125]">{row.members.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-[#103125] border-t-2 border-[#E2ECE7]">
                    <th scope="row" className="py-2 pr-4 text-left">{t('Total')}</th>
                    <td className="py-2 pr-4" />
                    <td className="py-2 pr-4 text-right">{data.totals.institutions.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{data.totals.clubs.toLocaleString()}</td>
                    <td className="py-2 text-right">{data.totals.members.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
};
