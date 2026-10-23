import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  MapPin,
} from 'lucide-react';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  ClubsApiError,
  fetchShowcasePage,
  ShowcasePage,
} from '../../lib/clubsApi';

/**
 * M5-D3 club showcase index (BRIEF_M5 §3 D3; gate F5).
 *
 * Public card grid sourced from the CORRECTED route `/api/v1/clubs/showcase/`
 * (paginated DRF page — `/api/v1/clubs/` does not exist). Each card opens the
 * club's public showcase page (`/clubs/<slug>/`, SPA-only). Cards are a
 * name + tagline + institution/state summary; the aggregate roster counts live
 * on the detail page (never member rows — M4-A2 public-safe rule).
 *
 * Failure honesty (P5): the index is an idempotent GET with bounded retry in
 * clubsApi; any surfaced error renders the server `detail` verbatim when
 * present, otherwise a plain-language hint. No invented distinctions (P4).
 */

interface ShowcaseIndexViewProps {
  /** Return to the portal landing. */
  onBack: () => void;
  /** Open one club's showcase page (`/clubs/<slug>/`). */
  onOpenClub: (slug: string) => void;
  /** Jump to the passkey/QR self-join door (`/join/`). */
  onJoin: () => void;
}

export const ShowcaseIndexView: React.FC<ShowcaseIndexViewProps> = ({
  onBack,
  onOpenClub,
  onJoin,
}) => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ShowcasePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const runLoad = (nextPage: number) => {
    setLoading(true);
    setFailed(null);
    fetchShowcasePage(nextPage)
      .then((pageResult) => setResult(pageResult))
      .catch((err: unknown) => {
        setResult(null);
        if (err instanceof ApiError && err.kind === 'rate-limit') {
          setFailed(t('Too many requests — please wait a moment and try again.'));
        } else if (err instanceof ApiError && err.kind === 'network') {
          setFailed(t('Could not reach the club service. Please check your connection and try again.'));
        } else {
          setFailed(
            err instanceof ClubsApiError && err.detail
              ? t(err.detail)
              : t('The club showcase is unavailable right now. Please try again.'),
          );
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runLoad(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gotoPage = (nextPage: number) => {
    setPage(nextPage);
    runLoad(nextPage);
    headingRef.current?.focus();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="text-center sm:text-left grow space-y-2">
          <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-3.5 py-1 rounded-full text-xs font-bold">
            <Building2 className="h-4 w-4 text-brand-700" />
            <span>{t('Club Showcase')}</span>
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-extrabold text-ink-900 tracking-tight focus:outline-hidden"
          >
            {t('Discover NDLI Clubs')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-600 max-w-xl">
            {t('Browse public club pages from institutions across the registry, then open a club to see its story and join.')}
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onJoin}
            className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md"
          >
            <span>{t('Join a Club')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl border border-ink-200 bg-white text-xs font-bold text-ink-700 hover:bg-ink-50 flex items-center space-x-1.5 shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('Back to Portal')}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite" className="space-y-4">
        {loading && (
          <p className="text-sm text-ink-600 text-center py-6" role="status">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-brand-600" />
            {t('Loading the club showcase…')}
          </p>
        )}

        {failed && !loading && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-6 text-center space-y-2">
            <AlertTriangle className="h-7 w-7 text-amber-700 mx-auto" />
            <p className="text-sm text-ink-700">{failed}</p>
            <button
              onClick={() => runLoad(page)}
              className="px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50"
            >
              {t('Try again')}
            </button>
          </div>
        )}

        {!loading && !failed && result && result.results.length === 0 && (
          <div className="bg-white rounded-2xl border border-ink-200 p-8 text-center space-y-2">
            <Landmark className="h-7 w-7 text-brand-700 mx-auto" />
            <p className="text-sm text-ink-700">{t('No club showcases are published yet. Please check back soon.')}</p>
          </div>
        )}

        {!loading && !failed && result && result.results.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.results.map((card) => (
                <button
                  key={card.slug}
                  onClick={() => onOpenClub(card.slug)}
                  className="text-left bg-white rounded-2xl border border-ink-200 p-5 shadow-xs hover:shadow-md hover:border-brand-500/60 transition-all flex flex-col gap-3 focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Landmark className="h-4 w-4 text-brand-700 shrink-0" />
                      <h3 className="font-bold text-sm text-ink-900">{card.club.name}</h3>
                    </div>
                    <p className="text-xs text-ink-600">{card.tagline}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-600">
                    <span className="font-mono font-bold bg-ink-100 border border-ink-200 px-2 py-0.5 rounded">
                      {t('Code:')} {card.club.code}
                    </span>
                    <span className="inline-flex items-center space-x-1">
                      <Building2 className="h-3 w-3 text-brand-700" />
                      <span>{card.institution.name}</span>
                    </span>
                    <span className="inline-flex items-center space-x-1">
                      <MapPin className="h-3 w-3 text-amber-500" />
                      <span>{card.state.name}</span>
                    </span>
                  </div>
                  <span className="inline-flex items-center space-x-1 text-brand-700 font-bold text-xs">
                    <span>{t('View club page')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>

            {(result.previous !== null || result.next !== null) && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => gotoPage(page - 1)}
                  disabled={result.previous === null}
                  className="px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50 disabled:opacity-40 flex items-center space-x-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t('Previous')}</span>
                </button>
                <span className="text-xs font-semibold text-ink-600">
                  {t('Page')} {page}
                </span>
                <button
                  onClick={() => gotoPage(page + 1)}
                  disabled={result.next === null}
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
