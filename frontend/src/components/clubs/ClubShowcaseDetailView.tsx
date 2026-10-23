import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  GraduationCap,
  Loader2,
  MapPin,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { t } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  ClubsApiError,
  fetchShowcaseDetail,
  ShowcaseDetail,
} from '../../lib/clubsApi';

/**
 * M5-D3 club showcase detail page (BRIEF_M5 §3 D3).
 *
 * One public page per club (`/clubs/<slug>/`, SPA-only — never prerendered,
 * because a page per slug cannot be enumerated at build time, BRIEF_M5 §4c).
 * Body comes from `/api/v1/clubs/showcase/<slug>/`: tagline, about, narrative
 * sections, and the PUBLIC-SAFE roster aggregate counts (M4-A2 — counts only,
 * never member rows). Metadata (institution / zone / state / district / status)
 * is rendered as returned (P4).
 */

interface ClubShowcaseDetailViewProps {
  /** The showcase slug for `/clubs/<slug>/`. */
  slug: string;
  /** Return to the showcase index. */
  onBack: () => void;
  /** Jump to the self-join door for this club (`/join/`). */
  onJoin: () => void;
}

export const ClubShowcaseDetailView: React.FC<ClubShowcaseDetailViewProps> = ({
  slug,
  onBack,
  onJoin,
}) => {
  const [detail, setDetail] = useState<ShowcaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const runLoad = () => {
    setLoading(true);
    setFailed(null);
    fetchShowcaseDetail(slug)
      .then((payload) => setDetail(payload))
      .catch((err: unknown) => {
        setDetail(null);
        if (err instanceof ApiError && err.kind === 'rate-limit') {
          setFailed(t('Too many requests — please wait a moment and try again.'));
        } else if (err instanceof ApiError && err.kind === 'network') {
          setFailed(t('Could not reach the club service. Please check your connection and try again.'));
        } else {
          setFailed(
            err instanceof ClubsApiError && err.detail
              ? t(err.detail)
              : t('This club page is unavailable right now. Please try again.'),
          );
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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
            {detail ? detail.club.name : t('Club page')}
          </h1>
          {detail && <p className="text-xs sm:text-sm text-ink-600 max-w-xl">{detail.tagline}</p>}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onJoin}
            className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md"
          >
            <span>{t('Join this club')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl border border-ink-200 bg-white text-xs font-bold text-ink-700 hover:bg-ink-50 flex items-center space-x-1.5 shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('All clubs')}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite" className="space-y-4">
        {loading && (
          <p className="text-sm text-ink-600 text-center py-6" role="status">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-brand-600" />
            {t('Loading the club page…')}
          </p>
        )}

        {failed && !loading && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-6 text-center space-y-2">
            <AlertTriangle className="h-7 w-7 text-amber-700 mx-auto" />
            <p className="text-sm text-ink-700">{failed}</p>
            <button
              onClick={runLoad}
              className="px-4 py-2 rounded-xl border border-ink-200 bg-white text-ink-700 font-bold text-xs hover:bg-ink-50"
            >
              {t('Try again')}
            </button>
          </div>
        )}

        {!loading && !failed && detail && (
          <>
            {/* About */}
            <section className="bg-white rounded-2xl border border-ink-200 p-6 shadow-md space-y-2">
              <h2 className="text-lg font-bold text-ink-900">{t('About this club')}</h2>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{detail.about}</p>
            </section>

            {/* Narrative sections */}
            {detail.sections.length > 0 && (
              <section className="space-y-3">
                {detail.sections.map((section) => (
                  <div key={section.heading} className="bg-white rounded-2xl border border-ink-200 p-6 shadow-xs space-y-2">
                    <h2 className="text-lg font-bold text-ink-900">{section.heading}</h2>
                    <p className="text-sm text-ink-700 whitespace-pre-wrap">{section.body}</p>
                  </div>
                ))}
              </section>
            )}

            {/* Public-safe roster aggregates (counts only — M4-A2) */}
            <section className="bg-white rounded-2xl border border-ink-200 p-6 shadow-md space-y-4">
              <h2 className="text-lg font-bold text-ink-900">{t('Membership at a glance')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-ink-200 p-4 text-center">
                  <Users className="h-5 w-5 text-brand-700 mx-auto" />
                  <p className="text-2xl font-extrabold text-ink-900">{detail.roster.members_total}</p>
                  <p className="text-[11px] text-ink-600 font-semibold">{t('Total members')}</p>
                </div>
                <div className="rounded-xl border border-ink-200 p-4 text-center">
                  <ShieldCheck className="h-5 w-5 text-brand-700 mx-auto" />
                  <p className="text-2xl font-extrabold text-ink-900">{detail.roster.members_active}</p>
                  <p className="text-[11px] text-ink-600 font-semibold">{t('Active members')}</p>
                </div>
                <div className="rounded-xl border border-ink-200 p-4 text-center">
                  <GraduationCap className="h-5 w-5 text-brand-700 mx-auto" />
                  <p className="text-2xl font-extrabold text-ink-900">{detail.roster.alumni}</p>
                  <p className="text-[11px] text-ink-600 font-semibold">{t('Alumni')}</p>
                </div>
                <div className="rounded-xl border border-ink-200 p-4 text-center">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
                  <p className="text-2xl font-extrabold text-ink-900">{detail.roster.members_suspended}</p>
                  <p className="text-[11px] text-ink-600 font-semibold">{t('Suspended')}</p>
                </div>
              </div>
            </section>

            {/* Metadata */}
            <section className="bg-white rounded-2xl border border-ink-200 p-6 shadow-xs">
              <h2 className="text-lg font-bold text-ink-900 mb-3">{t('Club details')}</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('Status')}</dt>
                  <dd className="text-ink-900 font-bold">{detail.club.status}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('Club code')}</dt>
                  <dd className="font-mono text-ink-900 font-bold">{detail.club.code}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('Institution')}</dt>
                  <dd className="text-ink-900 font-bold text-right">{detail.institution.name}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('Zone')}</dt>
                  <dd className="text-ink-900 font-bold">{detail.zone.name}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('State / UT')}</dt>
                  <dd className="inline-flex items-center space-x-1 text-ink-900 font-bold">
                    <MapPin className="h-3.5 w-3.5 text-amber-500" />
                    <span>{detail.state.name}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600 font-semibold">{t('District')}</dt>
                  <dd className="text-ink-900 font-bold">{detail.district ? detail.district.name : t('—')}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
