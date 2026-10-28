/**
 * Employee Module (M6 D8: employee-module parity, PLAN_0018 section 6).
 *
 * Three tabs, semantics exactly like the previous project's employee portal:
 * - Daily Activity: SEC A support log ONLY (owner rule: NO "SEC B: Priority
 *   Club Approval" and NO "SEC C: New Club Details Entry" in this portal);
 *   bulk count (1-100) only for "Phone call and remote assistance".
 * - Universal Search: clubs DB with client-side filtering (institution,
 *   club ID, state, zone, email) - parity with the legacy quick filter.
 * - Activity History: newest first; club-approval log rows are PERMANENT
 *   RECORD (server-enforced delete protection) - shown with a lock, never
 *   selectable. Deleting a bulk entry deletes its full group (server-side
 *   semantics, surfaced in the response message).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { t } from '../i18n';
import {
  ActivityRow,
  ClubSearchRow,
  deleteActivities,
  fetchActivities,
  fetchClubRows,
  logActivity,
} from '../lib/employeeApi';
import { ApiError } from '../lib/api';

const SEC_A_TYPES = [
  'Phone call and remote assistance',
  'Closing of OS Ticket',
  'Online training',
  'Offline training',
] as const;

const BULK_TYPE = 'Phone call and remote assistance';

type EmployeeTab = 'daily' | 'search' | 'history';

export interface EmployeeModuleProps {
  subRole?: string;
}

export const EmployeeModule: React.FC<EmployeeModuleProps> = () => {
  const [tab, setTab] = useState<EmployeeTab>('daily');

  // --- Daily Activity form state ------------------------------------
  const [supportType, setSupportType] = useState<string>('');
  const [count, setCount] = useState<number>(1);
  const [clubId, setClubId] = useState('');
  const [notes, setNotes] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  // --- shared notice ------------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);

  // --- history state ------------------------------------------------
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);

  // --- universal search state ---------------------------------------
  const [query, setQuery] = useState('');
  const [clubRows, setClubRows] = useState<ClubSearchRow[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState<string | null>(null);

  const showNotice = useCallback((message: string, isError = false) => {
    setNotice(message);
    setNoticeError(isError);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const list = await fetchActivities();
      setRows(list.activities);
    } catch (err) {
      setHistoryError(
        err instanceof ApiError && err.kind === 'rate-limit'
          ? t('Rate limited - the history will refresh when you retry.')
          : t('Could not load the activity history.'),
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadClubs = useCallback(async () => {
    setClubsLoading(true);
    setClubsError(null);
    try {
      setClubRows(await fetchClubRows());
    } catch (err) {
      setClubsError(
        err instanceof ApiError && err.kind === 'rate-limit'
          ? t('Rate limited - try again in a moment.')
          : t('Could not load the clubs database.'),
      );
    } finally {
      setClubsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void loadClubs();
  }, [loadHistory, loadClubs]);

  // Parity: the legacy universal search filtered entirely client-side.
  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubRows;
    return clubRows.filter((row) =>
      [row.club_id, row.institution_name, row.state, row.zone, row.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [clubRows, query]);

  const handleLogSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supportType || logBusy) return;
    setLogBusy(true);
    try {
      const result = await logActivity({
        support_type: supportType,
        notes,
        club_id: clubId,
        count: supportType === BULK_TYPE ? count : 1,
      });
      showNotice(result.message);
      setNotes('');
      setClubId('');
      setCount(1);
      await loadHistory();
    } catch (err) {
      showNotice(
        err instanceof ApiError && err.message
          ? err.message
          : t('Could not record the support activity.'),
        true,
      );
    } finally {
      setLogBusy(false);
    }
  };

  const toggleSelected = (activityId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const result = await deleteActivities({
        activity_ids: [...selected],
      });
      showNotice(result.message);
      setSelected(new Set());
      await loadHistory();
    } catch (err) {
      showNotice(
        err instanceof ApiError && err.message
          ? err.message
          : t('Could not delete the selected entries.'),
        true,
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const tabButton = (key: EmployeeTab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={
        'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap ' +
        (tab === key
          ? 'bg-[#1A503E] text-white shadow-xs'
          : 'text-[#2E4A3E] hover:bg-[#F4F8F6]')
      }
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="tab-scroll flex items-center space-x-1 overflow-x-auto">
        {tabButton('daily', t('Daily Activity (SEC A)'), <Activity className="w-4 h-4" />)}
        {tabButton('search', t('Universal Search'), <Search className="w-4 h-4" />)}
        {tabButton('history', t('Activity History'), <History className="w-4 h-4" />)}
      </div>

      {notice && (
        <div
          className={
            'p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ' +
            (noticeError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800')
          }
        >
          {noticeError ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          {notice}
        </div>
      )}

      {tab === 'daily' && (
        <form
          onSubmit={handleLogSubmit}
          className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-5 max-w-2xl"
        >
          <h3 className="text-lg font-extrabold text-[#103125]">
            {t('SEC A: Daily Support Log')}
          </h3>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-support-type">
              {t('Nature of Support Provided')}
            </label>
            <select
              id="emp-support-type"
              required
              value={supportType}
              onChange={(e) => setSupportType(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#DCE7E1] text-sm bg-white"
            >
              <option value="">{t('-- Select nature of support --')}</option>
              {SEC_A_TYPES.map((type, index) => (
                <option key={type} value={type}>
                  {index + 1}) {type}
                </option>
              ))}
            </select>
          </div>
          {supportType === BULK_TYPE && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <label className="text-xs font-bold text-emerald-800" htmlFor="emp-support-count">
                {t('Bulk entries (1-100): each counts as one phone-call entry')}
              </label>
              <input
                id="emp-support-count"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-28 p-2 rounded-xl border border-emerald-300 text-sm bg-white font-bold"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-club-id">
              {t('Related Club ID (Optional)')}
            </label>
            <input
              id="emp-club-id"
              type="text"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              placeholder="e.g., NDLI-DL-102"
              className="w-full p-2.5 rounded-xl border border-[#DCE7E1] text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-notes">
              {t('Support Notes / OS Ticket # / Remarks')}
            </label>
            <textarea
              id="emp-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('Enter institution name, ticket resolution summary, or participant count...')}
              className="w-full p-2.5 rounded-xl border border-[#DCE7E1] text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={logBusy || !supportType}
            className="w-full py-3 rounded-xl bg-[#1A503E] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {logBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {supportType === BULK_TYPE && count > 1
              ? t('Record bulk entries')
              : t('Record support activity')}
          </button>
        </form>
      )}

      {tab === 'search' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-4">
          <h3 className="text-lg font-extrabold text-[#103125]">
            {t('Universal Search')}
          </h3>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search by institution name, club ID, state, zone, or email...')}
            className="w-full p-2.5 rounded-xl border border-[#DCE7E1] text-sm"
          />
          {clubsError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {clubsError}
            </div>
          )}
          {clubsLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('Loading clubs database...')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#2E4A3E] border-b border-[#DCE7E1]">
                    <th className="py-2 pr-3">{t('Club ID')}</th>
                    <th className="py-2 pr-3">{t('Institution')}</th>
                    <th className="py-2 pr-3">{t('State')}</th>
                    <th className="py-2 pr-3">{t('Zone')}</th>
                    <th className="py-2 pr-3">{t('Email')}</th>
                    <th className="py-2">{t('Date of Approval')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClubs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#2E4A3E]">
                        {t('No clubs match your search.')}
                      </td>
                    </tr>
                  ) : (
                    filteredClubs.map((row, index) => (
                      <tr key={row.club_id ?? index} className="border-b border-[#F0F5F2]">
                        <td className="py-2 pr-3 font-bold">{row.club_id ?? '-'}</td>
                        <td className="py-2 pr-3">{row.institution_name ?? '-'}</td>
                        <td className="py-2 pr-3">{row.state ?? '-'}</td>
                        <td className="py-2 pr-3">{row.zone ?? '-'}</td>
                        <td className="py-2 pr-3">{row.email ?? '-'}</td>
                        <td className="py-2">{row.date_of_approval ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-lg font-extrabold text-[#103125]">
              {t('Activity History')}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('Refresh')}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSelected()}
                disabled={selected.size === 0 || deleteBusy}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {t('Delete selected')}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[#2E4A3E] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            {t('Club-approval log entries are permanent record and cannot be deleted. Deleting a bulk entry removes it in full.')}
          </p>
          {historyError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {historyError}
            </div>
          )}
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('Loading activity history...')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#2E4A3E] border-b border-[#DCE7E1]">
                    <th className="py-2 pr-3 w-8" />
                    <th className="py-2 pr-3">{t('Timestamp')}</th>
                    <th className="py-2 pr-3">{t('Type')}</th>
                    <th className="py-2 pr-3">{t('Club')}</th>
                    <th className="py-2">{t('Notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#2E4A3E]">
                        {t('No activity entries yet.')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const locked = row.is_approval_log;
                      return (
                        <tr key={row.activity_id} className="border-b border-[#F0F5F2]">
                          <td className="py-2 pr-3">
                            {locked ? (
                              <span title={t('Club-approval log entry - permanent record')}><Lock className="w-3.5 h-3.5 text-amber-600" /></span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={selected.has(row.activity_id)}
                                onChange={() => toggleSelected(row.activity_id)}
                                aria-label={t('Select entry')}
                              />
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {new Date(row.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={
                                'px-2 py-0.5 rounded-full font-bold ' +
                                (locked
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-[#F4F8F6] text-[#2E4A3E]')
                              }
                            >
                              {row.support_type}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{row.club_id || '-'}</td>
                          <td className="py-2">{row.notes || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
