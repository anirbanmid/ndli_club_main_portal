import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Search,
  MapPin,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Landmark,
  X,
} from 'lucide-react';
import { t } from '../i18n';
import {
  ApiError,
  DirectoryPage,
  DirectoryQuery,
  fetchTelemetry,
  searchDirectory,
  TelemetryStateRow,
} from '../lib/api';

/**
 * M3-2 public institution directory (q + state/district/AISHE filters,
 * paginated). Rows come from /api/v1/public/directory/; the state filter
 * options come from the telemetry payload (single source, P4).
 */

interface DirectoryViewProps {
  onBack: () => void;
}

/** Mirrors backend DIRECTORY_PAGE_SIZE (apps/public_api/views.py). */
const PAGE_SIZE = 20;

export const DirectoryView: React.FC<DirectoryViewProps> = ({ onBack }) => {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [aishe, setAishe] = useState('');
  const [applied, setApplied] = useState<DirectoryQuery>({});
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DirectoryPage | null>(null);
  const [states, setStates] = useState<TelemetryStateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const runSearch = (query: DirectoryQuery) => {
    setLoading(true);
    setFailed(null);
    searchDirectory(query)
      .then((pageResult) => {
        setResult(pageResult);
      })
      .catch((err: unknown) => {
        setResult(null);
        setFailed(
          err instanceof ApiError && err.kind === 'rate-limit'
            ? t('Too many requests — please wait a moment and try again.')
            : t('Could not reach the directory service. Please check your connection and try again.'),
        );
      })
      .finally(() => setLoading(false));
  };

  // Initial load: full directory (stable code order) + state filter options.
  useEffect(() => {
    runSearch({});
    fetchTelemetry()
      .then((payload) => setStates(payload.states))
      .catch(() => setStates([])); // filter is optional; directory still works
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query: DirectoryQuery = { q: q.trim(), state, district: district.trim(), aishe: aishe.trim() };
    setApplied(query);
    setPage(1);
    runSearch({ ...query, page: 1 });
  };

  const handleClear = () => {
    setQ('');
    setState('');
    setDistrict('');
    setAishe('');
    setApplied({});
    setPage(1);
    runSearch({});
  };

  const gotoPage = (nextPage: number) => {
    setPage(nextPage);
    runSearch({ ...applied, page: nextPage });
    headingRef.current?.focus();
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.count / PAGE_SIZE)) : 1;
  const firstRow = result && result.count > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = result ? Math.min(page * PAGE_SIZE, result.count) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="text-center sm:text-left grow space-y-2">
          <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-3.5 py-1 rounded-full text-xs font-bold">
            <Building2 className="h-4 w-4 text-brand-700" />
            <span>{t('National Institution Directory')}</span>
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-extrabold text-ink-900 tracking-tight focus:outline-hidden"
          >
            {t('Search the Public Institution Directory')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-600 max-w-xl">
            {t('Find active institutions in the NDLI Club registry by name, AISHE code, State / UT or district code.')}
          </p>
        </div>

        <button
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl border border-ink-200 bg-white text-xs font-bold text-ink-700 hover:bg-ink-50 flex items-center space-x-1.5 shadow-2xs shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('Back to Portal')}</span>
        </button>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-2xl border border-ink-200 shadow-md space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 relative">
            <label className="text-xs font-bold text-ink-700 block mb-1" htmlFor="dir-q">
              {t('Institution name or keyword')}
            </label>
            <Search className="absolute left-3.5 bottom-3 h-4 w-4 text-ink-600" />
            <input
              id="dir-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('e.g. Indian Institute, Sample Engineering College…')}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-ink-300 bg-ink-50 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink-700 block mb-1" htmlFor="dir-state">
              {t('State / UT')}
            </label>
            <select
              id="dir-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full py-2.5 px-3 text-sm rounded-xl border border-ink-300 bg-white text-ink-900 font-semibold focus:ring-2 focus:ring-brand-500"
            >
              <option value="">{t('All States / UTs')}</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-ink-700 block mb-1" htmlFor="dir-district">
              {t('District code')}
            </label>
            <input
              id="dir-district"
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder={t('e.g. IN-MH-PU')}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-ink-300 bg-ink-50 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink-700 block mb-1" htmlFor="dir-aishe">
              {t('AISHE code')}
            </label>
            <input
              id="dir-aishe"
              type="text"
              value={aishe}
              onChange={(e) => setAishe(e.target.value)}
              placeholder={t('e.g. U-0570')}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-ink-300 bg-ink-50 focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-md flex items-center space-x-2 transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>{t('Search Directory')}</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2.5 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-sm hover:bg-ink-50 flex items-center space-x-1.5"
          >
            <X className="h-3.5 w-3.5" />
            <span>{t('Clear Filters')}</span>
          </button>
        </div>
      </form>

      {/* Results */}
      <div aria-live="polite" className="space-y-4">
        {loading && (
          <p className="text-sm text-ink-600 text-center py-6" role="status">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-brand-600" />
            {t('Searching the directory…')}
          </p>
        )}

        {failed && !loading && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-6 text-center space-y-2">
            <AlertTriangle className="h-7 w-7 text-amber-700 mx-auto" />
            <p className="text-sm text-ink-700">{failed}</p>
          </div>
        )}

        {!loading && !failed && result && (
          <>
            <p className="text-xs text-ink-600 font-semibold">
              {result.count === 0
                ? t('No institutions match your filters.')
                : `${t('Showing')} ${firstRow}–${lastRow} ${t('of')} ${result.count.toLocaleString()} ${t('institutions')}`}
            </p>

            <div className="space-y-3">
              {result.results.map((inst) => (
                <div
                  key={inst.code}
                  className="bg-white rounded-2xl border border-ink-200 p-5 shadow-xs hover:shadow-md hover:border-brand-500/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Landmark className="h-4 w-4 text-brand-700 shrink-0" />
                      <h3 className="font-bold text-sm text-ink-900">{inst.name}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-600">
                      <span className="font-mono font-bold bg-ink-100 border border-ink-200 px-2 py-0.5 rounded">
                        {t('Code:')} {inst.code}
                      </span>
                      {inst.aishe_code && (
                        <span className="font-mono font-bold bg-brand-50 border border-brand-200 text-brand-800 px-2 py-0.5 rounded">
                          {t('AISHE:')} {inst.aishe_code}
                        </span>
                      )}
                      <span className="inline-flex items-center space-x-1">
                        <MapPin className="h-3 w-3 text-amber-500" />
                        <span>
                          {inst.district ? `${inst.district.name}, ` : ''}
                          {inst.state.name}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => gotoPage(page - 1)}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50 disabled:opacity-40 flex items-center space-x-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t('Previous')}</span>
                </button>
                <span className="text-xs font-semibold text-ink-600">
                  {t('Page')} {page} {t('of')} {totalPages}
                </span>
                <button
                  onClick={() => gotoPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50 disabled:opacity-40 flex items-center space-x-1"
                >
                  <span>{t('Next')}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
