/**
 * Regional Employee Operations Portal (Tier 3: Regional Nodal Officer Console).
 *
 * Parity with the previous project's `templates/employee.html`:
 * - Daily Activity Tracker (SEC A only; single-row bulk calling with consolidated count).
 * - Universal Club Search with client-side filtering and `clubs.csv` export.
 * - Activity History displaying `[Bulk Entry: N Calls]`, lock-protected permanent
 *   club approval logs, and `activity_log.csv` export.
 * - Full Zonal Grievance Redressal and Tracking desk.
 * - Zonal Club Approvals desk (auto-triggers registration certificate upon sanction).
 * - Tool Box with 12 regional utilities and PI Digital Signature & Affiliation settings.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  History,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  Mail,
  PenTool,
  PhoneCall,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { t } from '../i18n';
import { ApiError } from '../lib/api';
import {
  ActivityRow,
  ClubSearchRow,
  PISignatureSettings,
  deleteActivities,
  fetchActivities,
  fetchClubRows,
  fetchPISignatureSettings,
  getActivityExportUrl,
  getClubsExportUrl,
  logActivity,
  savePISignatureSettings,
} from '../lib/employeeApi';
import {
  CharterDecision,
  CharterDetail,
  CharterRow,
  GrievanceRow,
  decideCharter,
  fetchCharter,
  fetchCharterQueue,
  fetchGrievanceQueue,
  resolveGrievance,
} from '../lib/adminApi';

const SEC_A_TYPES = [
  'Phone call and remote assistance',
  'Closing of OS Ticket',
  'Online training',
  'Offline training',
] as const;

const BULK_TYPE = 'Phone call and remote assistance';

type EmployeeTab = 'daily' | 'search' | 'history' | 'grievances' | 'approvals' | 'toolbox';

export interface EmployeeModuleProps {
  onSignOut?: () => void;
  subRole?: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export const EmployeeModule: React.FC<EmployeeModuleProps> = ({
  onSignOut,
  subRole,
}) => {
  const [tab, setTab] = useState<EmployeeTab>('daily');

  // --- Daily Activity form state ------------------------------------
  const [supportType, setSupportType] = useState<string>('');
  const [count, setCount] = useState<number>(1);
  const [clubId, setClubId] = useState('');
  const [notes, setNotes] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  // --- Shared notice ------------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);

  // --- Activity history state ---------------------------------------
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);

  // --- Universal search state ---------------------------------------
  const [query, setQuery] = useState('');
  const [clubRows, setClubRows] = useState<ClubSearchRow[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState<string | null>(null);

  // --- Zonal Grievance desk state -----------------------------------
  const [grievances, setGrievances] = useState<GrievanceRow[]>([]);
  const [grievancesLoading, setGrievancesLoading] = useState(false);
  const [grievanceBusy, setGrievanceBusy] = useState<string | null>(null);
  const [grievanceFilter, setGrievanceFilter] = useState<'all' | 'open' | 'resolved'>('open');

  // --- Zonal Club Approvals desk state ------------------------------
  const [charters, setCharters] = useState<CharterRow[]>([]);
  const [chartersLoading, setChartersLoading] = useState(false);
  const [expandedCharter, setExpandedCharter] = useState<string | null>(null);
  const [charterDetails, setCharterDetails] = useState<Record<string, CharterDetail>>({});
  const [charterBusy, setCharterBusy] = useState<string | null>(null);

  // --- Tool Box / PI Signature state --------------------------------
  const [piSettings, setPiSettings] = useState<PISignatureSettings | null>(null);
  const [piAffiliation, setPiAffiliation] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [piBusy, setPiBusy] = useState(false);

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
          ? t('Rate limited - history will refresh when you retry.')
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

  const loadGrievances = useCallback(async () => {
    setGrievancesLoading(true);
    try {
      const res = await fetchGrievanceQueue();
      setGrievances(res.results || []);
    } catch {
      /* ignore */
    } finally {
      setGrievancesLoading(false);
    }
  }, []);

  const loadCharters = useCallback(async () => {
    setChartersLoading(true);
    try {
      const res = await fetchCharterQueue();
      setCharters(res.results || []);
    } catch {
      /* ignore */
    } finally {
      setChartersLoading(false);
    }
  }, []);

  const loadPiSettings = useCallback(async () => {
    try {
      const s = await fetchPISignatureSettings();
      setPiSettings(s);
      setPiAffiliation(s.pi_affiliation || '');
      if (s.signature_image_url) {
        setSignaturePreview(s.signature_image_url);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void loadClubs();
  }, [loadHistory, loadClubs]);

  useEffect(() => {
    if (tab === 'grievances') void loadGrievances();
    if (tab === 'approvals') void loadCharters();
    if (tab === 'toolbox') void loadPiSettings();
  }, [tab, loadGrievances, loadCharters, loadPiSettings]);

  // Client-side search for universal clubs
  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubRows;
    return clubRows.filter((row) =>
      [row.club_id, row.institution_name, row.state, row.zone, row.email]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q)),
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

  const onResolveTicket = async (id: string, decision: 'resolved' | 'not_resolved') => {
    const typed = window.prompt(
      decision === 'resolved'
        ? t('Resolution summary for the institution:')
        : t('Reason this is not resolved (advances 7-day reminder cycle):'),
      '',
    );
    if (typed === null) return;
    setGrievanceBusy(id);
    try {
      await resolveGrievance(id, {
        decision,
        ...(typed.trim() ? { reason: typed.trim() } : {}),
      });
      showNotice(decision === 'resolved' ? t('Ticket marked Resolved.') : t('Marked Not Resolved.'));
      await loadGrievances();
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message : t('Failed to update ticket.'), true);
    } finally {
      setGrievanceBusy(null);
    }
  };

  const toggleCharterDetails = async (id: string) => {
    if (expandedCharter === id) {
      setExpandedCharter(null);
      return;
    }
    setExpandedCharter(id);
    if (!charterDetails[id]) {
      try {
        const detail = await fetchCharter(id);
        setCharterDetails((prev) => ({ ...prev, [id]: detail }));
      } catch {
        setExpandedCharter(null);
      }
    }
  };

  const onCharterDecision = async (id: string, decision: CharterDecision) => {
    let reason: string | undefined;
    if (decision === 'reject') {
      const typed = window.prompt(t('Reason for rejecting this charter application:'), '') ?? '';
      if (!typed.trim()) return;
      reason = typed.trim();
    }
    setCharterBusy(id);
    try {
      await decideCharter(id, { decision, ...(reason ? { reason } : {}) });
      showNotice(
        decision === 'sanction'
          ? t('Charter approved & sanctioned! Registration certificate auto-issued for the club.')
          : t('Charter rejected and feedback dispatched to applicant.'),
      );
      setExpandedCharter(null);
      await loadCharters();
      await loadHistory(); // Approval entry is permanently logged into activity history!
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message : t('Decision failed.'), true);
    } finally {
      setCharterBusy(null);
    }
  };

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignatureFile(file);
      const reader = new FileReader();
      reader.onload = () => setSignaturePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSavePISettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPiBusy(true);
    try {
      const res = await savePISignatureSettings(piAffiliation, signatureFile || undefined);
      showNotice(res.message);
      setPiSettings(res);
      setSignatureFile(null);
    } catch (err) {
      showNotice(
        err instanceof ApiError ? err.message : t('Failed to save PI signature settings.'),
        true,
      );
    } finally {
      setPiBusy(false);
    }
  };

  const filteredGrievances = grievances.filter((g) => {
    if (grievanceFilter === 'open') return g.status !== 'resolved';
    if (grievanceFilter === 'resolved') return g.status === 'resolved';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Top Employee Header */}
      <div className="bg-[#103125] text-white p-6 sm:p-7 rounded-3xl border border-[#1A503E] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2.5">
            <span className="bg-[#0D7751] text-brand-100 text-[11px] font-black px-3 py-0.5 rounded-full border border-brand-400/30">
              {t('IIT KHARAGPUR REGIONAL OPERATIONS')}
            </span>
            <span className="text-xs text-amber-300 font-semibold font-mono">
              ROLE: {subRole || 'regional_officer'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t('Regional Employee Operations & Daily Support Desk')}
          </h1>

          <p className="text-xs text-brand-200/90 max-w-2xl">
            {t(
              'Real-time daily activity tracking, universal club directory inspection, zonal grievance redressal, and priority club onboarding verification.',
            )}
          </p>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="self-start md:self-center px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center space-x-2 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('Sign out')}</span>
          </button>
        )}
      </div>

      {/* Navigation Desks */}
      <div className="flex items-center space-x-2 bg-white p-2.5 rounded-2xl border border-[#E2ECE7] shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('daily')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'daily'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>{t('Daily Activity (SEC A)')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('search')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'search'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Search className="h-4 w-4" />
          <span>{t('Universal Search')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'history'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <History className="h-4 w-4" />
          <span>{t('Activity History')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('grievances')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'grievances'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <LifeBuoy className="h-4 w-4" />
          <span>{t('Zonal Grievances')}</span>
          {grievances.filter((g) => g.status !== 'resolved').length > 0 && (
            <span className="bg-amber-400 text-[#103125] font-black text-[10px] px-1.5 py-0.2 rounded-full">
              {grievances.filter((g) => g.status !== 'resolved').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('approvals')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'approvals'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>{t('Club Approvals')}</span>
          {charters.filter((c) => c.status !== 'sanctioned').length > 0 && (
            <span className="bg-emerald-400 text-[#103125] font-black text-[10px] px-1.5 py-0.2 rounded-full">
              {charters.filter((c) => c.status !== 'sanctioned').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('toolbox')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'toolbox'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Wrench className="h-4 w-4" />
          <span>{t('Tool Box & PI Signature')}</span>
        </button>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 shadow-xs ${
            noticeError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {noticeError ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: Daily Activity (SEC A) */}
      {tab === 'daily' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form
            onSubmit={handleLogSubmit}
            className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6"
          >
            <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#103125]">
                  {t('SEC A: Daily Support Log')}
                </h3>
                <p className="text-xs text-[#5A7366] mt-0.5">
                  {t(
                    'Real-time logging with automated date & timestamp capture. Attended support counts toward quota.',
                  )}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                SEC A
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-support-type">
                {t('Nature of Support Provided')} *
              </label>
              <select
                id="emp-support-type"
                required
                value={supportType}
                onChange={(e) => setSupportType(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#DCE7E1] text-sm bg-white font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 outline-none"
              >
                <option value="">{t('-- Select nature of support --')}</option>
                {SEC_A_TYPES.map((type, index) => (
                  <option key={type} value={type}>
                    {index + 1}) {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulk Entry Provision for Phone Call & Remote Assistance ONLY */}
            {supportType === BULK_TYPE && (
              <div className="p-5 rounded-2xl bg-[#F0F8F4] border border-[#D9EFE4] space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    className="text-xs font-bold text-[#0A5C3E] flex items-center gap-1.5"
                    htmlFor="emp-support-count"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    {t('Bulk Entry: Total Number of Calls / Remote Assistance')}
                  </label>
                  <span className="px-2 py-0.5 rounded-full bg-[#D9EFE4] text-[#0A5C3E] text-[10px] font-bold">
                    {t('Bulk Entry Facility')}
                  </span>
                </div>
                <p className="text-xs text-[#0A5C3E]/90 leading-relaxed">
                  {t(
                    'Attended multiple calls or remote sessions one after another? Enter the total number below to record them in batch as a consolidated single entry.',
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    id="emp-support-count"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                    className="w-24 p-2.5 rounded-xl border border-emerald-300 text-base font-extrabold text-[#103125] bg-white text-center outline-none"
                  />
                  <span className="text-xs font-bold text-[#0A5C3E]">
                    {t('Total calls attended in batch (1–100)')}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-club-id">
                {t('Related Club ID (Optional)')}
              </label>
              <input
                id="emp-club-id"
                type="text"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                placeholder="e.g., NDLI-DL-102 or 2051"
                className="w-full p-3 rounded-xl border border-[#DCE7E1] text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="emp-notes">
                {t('Support Notes / OS Ticket # / Remarks')}
              </label>
              <textarea
                id="emp-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t(
                  'Enter institution name, ticket resolution summary, or participant count...',
                )}
                className="w-full p-3 rounded-xl border border-[#DCE7E1] text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={logBusy || !supportType}
              className="w-full py-3.5 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {logBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {supportType === BULK_TYPE && count > 1
                  ? `${t('Record')} ${count} ${t('Support Calls in Bulk')}`
                  : t('Record Support Activity')}
              </span>
            </button>
          </form>

          {/* Quick Info & Direct Links Sidecard */}
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
              <h4 className="text-sm font-extrabold text-[#103125] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-700" />
                {t('Daily Quota & Performance Scope')}
              </h4>
              <p className="text-xs text-[#5A7366] leading-relaxed">
                {t(
                  'Your activity entries feed directly into the Central Administration Performance Matrix. All calls, ticket closures, and training sessions are derivation-scored without duplicated storage.',
                )}
              </p>
              <div className="p-3.5 rounded-xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1 text-xs text-[#2E4A3E]">
                <div className="font-bold">{t('Activity Weights in Composite Rating:')}</div>
                <div>• {t('50% — Priority Club Approvals')}</div>
                <div>• {t('30% — Tickets Closed & Remote Calls')}</div>
                <div>• {t('20% — Offline Workshops')}</div>
                <div>• {t('10% — Online Training Sessions')}</div>
              </div>
            </div>

            <div className="bg-[#103125] text-white p-6 rounded-3xl border border-[#1A503E] shadow-xs space-y-3">
              <h4 className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t('Fast CSV Exports')}
              </h4>
              <p className="text-xs text-brand-200 leading-relaxed">
                {t(
                  'Need an offline copy of your operational ledger or universal club register? Download your official CSV records directly.',
                )}
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => window.open(getActivityExportUrl(), '_blank')}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-between border border-white/20 transition-colors"
                >
                  <span>{t('My Activity Log (CSV)')}</span>
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => window.open(getClubsExportUrl(), '_blank')}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-between border border-white/20 transition-colors"
                >
                  <span>{t('Clubs Database (CSV)')}</span>
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Universal Search */}
      {tab === 'search' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125]">
                {t('Universal Club Search & Registry')}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t('Instant search across institution name, club ID, state, zone, and email.')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.open(getClubsExportUrl(), '_blank')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A503E] hover:bg-[#103125] text-white flex items-center gap-2 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{t('Download Clubs CSV')}</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-[#5A7366]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search by institution name, club ID, state, zone, or email...')}
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-[#DCE7E1] text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 outline-none"
            />
          </div>

          {clubsError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {clubsError}
            </div>
          )}

          {clubsLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              <span>{t('Loading clubs database…')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5">{t('Club ID')}</th>
                    <th className="p-3.5">{t('Institution Name')}</th>
                    <th className="p-3.5">{t('State')}</th>
                    <th className="p-3.5">{t('Zone')}</th>
                    <th className="p-3.5">{t('Official Email')}</th>
                    <th className="p-3.5">{t('Date of Approval')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {filteredClubs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#5A7366]">
                        {t('No clubs match your search query.')}
                      </td>
                    </tr>
                  ) : (
                    filteredClubs.map((row, index) => (
                      <tr key={row.club_id ?? index} className="hover:bg-[#F4F8F6]/60 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-emerald-800">
                          {row.club_id ?? '-'}
                        </td>
                        <td className="p-3.5 font-semibold text-[#103125]">
                          {row.institution_name ?? '-'}
                        </td>
                        <td className="p-3.5">{row.state ?? '-'}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#F4F8F6] text-[#2E4A3E] font-semibold text-[10px] border border-[#E2ECE7]">
                            {row.zone ?? '-'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[#5A7366]">{row.email ?? '-'}</td>
                        <td className="p-3.5">{row.date_of_approval ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Activity History */}
      {tab === 'history' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125]">
                {t('My Node Activity History')}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t(
                  'Permanent chronological ledger of support calls, workshops, ticket closures, and club approval logs.',
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => window.open(getActivityExportUrl(), '_blank')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1A503E] hover:bg-[#103125] text-white flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('Download Activity Log (CSV)')}</span>
              </button>

              <button
                type="button"
                onClick={() => void loadHistory()}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('Refresh')}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteSelected()}
                disabled={selected.size === 0 || deleteBusy}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-xs"
              >
                {deleteBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {t('Delete Selected')} ({selected.size})
                </span>
              </button>
            </div>
          </div>

          <p className="text-xs text-[#5A7366] flex items-center gap-2 bg-[#F4F8F6] p-3 rounded-xl border border-[#E2ECE7]">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {t(
                'Club approval logs are permanent compliance records and cannot be deleted. Deleting a bulk entry removes it in full.',
              )}
            </span>
          </p>

          {historyError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {historyError}
            </div>
          )}

          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              <span>{t('Loading activity history…')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5 w-10" />
                    <th className="p-3.5">{t('Timestamp')}</th>
                    <th className="p-3.5">{t('Support Type')}</th>
                    <th className="p-3.5">{t('Batch / Volume')}</th>
                    <th className="p-3.5">{t('Club ID')}</th>
                    <th className="p-3.5">{t('Notes & Remarks')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#5A7366]">
                        {t('No activity entries recorded yet.')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const locked = row.is_approval_log;
                      const callCount = row.call_count ?? 1;
                      return (
                        <tr key={row.activity_id} className="hover:bg-[#F4F8F6]/60 transition-colors">
                          <td className="p-3.5">
                            {locked ? (
                              <span title={t('Club-approval log entry - permanent record')}>
                                <Lock className="w-4 h-4 text-amber-600" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={selected.has(row.activity_id)}
                                onChange={() => toggleSelected(row.activity_id)}
                                aria-label={t('Select entry')}
                                className="w-4 h-4 rounded border-[#DCE7E1] text-emerald-700 focus:ring-emerald-500"
                              />
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-[#5A7366] whitespace-nowrap">
                            {formatStamp(row.timestamp)}
                          </td>
                          <td className="p-3.5 font-medium">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                                locked
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-[#F4F8F6] text-[#2E4A3E] border border-[#E2ECE7]'
                              }`}
                            >
                              {row.support_type}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {callCount > 1 ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-[11px]">
                                [Bulk Entry: {callCount} Calls]
                              </span>
                            ) : (
                              <span className="text-[#5A7366] text-xs font-semibold">
                                1 Session
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-emerald-800">
                            {row.club_id || '—'}
                          </td>
                          <td className="p-3.5 text-[#103125] max-w-md">
                            {row.notes || '—'}
                          </td>
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

      {/* TAB 4: Zonal Grievance Redressal & Tracking */}
      {tab === 'grievances' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-emerald-700" />
                {t('Zonal Grievance Redressal & Support Ticket Desk')}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t(
                  'Manage and resolve club queries with 72-hour fast-track and 30-day escalation SLA monitoring.',
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={grievanceFilter}
                onChange={(e) => setGrievanceFilter(e.target.value as any)}
                className="text-xs font-bold text-[#103125] bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl px-3 py-2 outline-none"
              >
                <option value="open">{t('Open & In Progress')}</option>
                <option value="resolved">{t('Resolved Tickets')}</option>
                <option value="all">{t('All Tickets')}</option>
              </select>

              <button
                type="button"
                onClick={() => void loadGrievances()}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('Refresh')}</span>
              </button>
            </div>
          </div>

          {grievancesLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              <span>{t('Loading grievance queue…')}</span>
            </div>
          ) : filteredGrievances.length === 0 ? (
            <div className="p-8 text-center text-[#5A7366] text-xs">
              {t('No support tickets currently found matching this filter.')}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGrievances.map((g) => {
                const busy = grievanceBusy === g.id;
                const isOverdue =
                  g.status !== 'resolved' &&
                  g.reminder_due_at &&
                  new Date(g.reminder_due_at).getTime() < Date.now();
                return (
                  <div
                    key={g.id}
                    className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              g.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : isOverdue
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {g.status === 'resolved' ? t('Resolved') : isOverdue ? t('Overdue Escalation') : t('Open')}
                          </span>
                          <span className="text-xs font-semibold text-[#5A7366]">
                            {t('Zone:')} <strong>{g.zone_code}</strong> • {g.state_code}
                          </span>
                          {g.reminder_due_at && g.status !== 'resolved' && (
                            <span className="text-[11px] text-[#5A7366] font-mono">
                              {t('Due:')} {formatStamp(g.reminder_due_at)}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-[#103125] mt-1">{g.subject}</h4>
                        <div className="text-xs text-[#5A7366] font-mono">{t("Club ID:")} {g.club_id}</div>
                      </div>

                      {g.status !== 'resolved' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onResolveTicket(g.id, 'resolved')}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('Resolve Ticket')}</span>
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onResolveTicket(g.id, 'not_resolved')}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <span>{t('Not Resolved')}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-[#2E4A3E] bg-white p-3.5 rounded-xl border border-[#E2ECE7] leading-relaxed">
                      {g.description || t('No detailed issue notes provided.')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Zonal Club Approvals */}
      {tab === 'approvals' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-700" />
                {t('Zonal Priority Club Approvals & Onboarding Queue')}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t(
                  'Verify quorum, institute registration documents, and approve club charters. Upon sanction, registration certificates are auto-generated.',
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadCharters()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('Refresh')}</span>
            </button>
          </div>

          {chartersLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#2E4A3E] py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              <span>{t('Loading charter applications…')}</span>
            </div>
          ) : charters.length === 0 ? (
            <div className="p-8 text-center text-[#5A7366] text-xs">
              {t('No pending charter applications in your regional queue.')}
            </div>
          ) : (
            <div className="space-y-4">
              {charters.map((c) => {
                const detail = charterDetails[c.id];
                const busy = charterBusy === c.id;
                const isExpanded = expandedCharter === c.id;
                return (
                  <div
                    key={c.id}
                    className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              c.status === 'sanctioned'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {c.status.toUpperCase()}
                          </span>
                          <span className="text-xs font-semibold text-[#5A7366]">
                            {t('Zone:')} <strong>{c.zone_code}</strong> • {c.state_code}
                          </span>
                          <span className="text-[11px] text-[#5A7366]">
                            {t('Submitted:')} {formatDate(c.submitted_at)}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-[#103125] mt-1">{c.club_name}</h4>
                        <div className="text-xs text-[#5A7366]">{c.institution_name}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCharterDetails(c.id)}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#E2ECE7] border border-[#DCE7E1] text-[#2E4A3E] text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isExpanded ? t('Hide Dossier') : t('Review Dossier')}</span>
                        </button>

                        {c.status !== 'sanctioned' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onCharterDecision(c.id, 'sanction')}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t('Approve & Sanction')}</span>
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onCharterDecision(c.id, 'reject')}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              <span>{t('Reject')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && detail && (
                      <div className="p-4 rounded-xl bg-white border border-[#E2ECE7] space-y-4 animate-in fade-in">
                        <h5 className="text-xs font-extrabold text-[#103125] uppercase tracking-wide">
                          {t('Institutional 4-Tier Authority Quorum:')}
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          {(detail.authorities || []).map((auth) => (
                            <div key={auth.role} className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7] space-y-1">
                              <span className="text-[10px] font-black uppercase text-emerald-800 block">
                                {auth.role}
                              </span>
                              <div className="font-bold text-[#103125]">{auth.full_name || '—'}</div>
                              <div className="text-[11px] text-[#5A7366]">{auth.email || '—'}</div>
                              <div className="text-[11px] text-[#5A7366] font-mono">{auth.phone || '—'}</div>
                            </div>
                          ))}
                        </div>

                        {(detail.uploads || []).length > 0 && (
                          <div className="pt-2 space-y-2 text-xs">
                            <span className="font-bold text-[#2E4A3E]">
                              {t('Uploaded Institutional Verification Proofs:')}
                            </span>
                            <div className="space-y-1.5">
                              {detail.uploads.map((u) => (
                                <div key={u.id} className="p-2.5 rounded-lg bg-white border border-[#E2ECE7] text-xs flex justify-between items-center">
                                  <span className="font-mono font-semibold text-[#103125]">{u.original_name}</span>
                                  <span className="text-[11px] text-[#5A7366]">
                                    {u.mime_type} • {Math.round(u.size_bytes / 1024)} KB • {formatDate(u.uploaded_at)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Tool Box & PI Signature Settings */}
      {tab === 'toolbox' && (
        <div className="space-y-8">
          {/* PI Digital Signature & Affiliation Settings */}
          <form
            onSubmit={handleSavePISettings}
            className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#DCE7E1] shadow-xs space-y-6"
          >
            <div className="border-b border-[#E2ECE7] pb-4">
              <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-700" />
                {t('Principal Investigator (PI) Digital Signature & Affiliation Settings')}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t(
                  'Upload your authorized PI digital signature image and designation affiliation for dynamic rendering on certificates and official credentials.',
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="pi-affiliation">
                    {t('Official Designation & Affiliation')} *
                  </label>
                  <input
                    id="pi-affiliation"
                    type="text"
                    required
                    value={piAffiliation}
                    onChange={(e) => setPiAffiliation(e.target.value)}
                    placeholder="e.g., Professor, Dept. of Computer Science & Engineering, IIT Kharagpur"
                    className="w-full p-3 rounded-xl border border-[#DCE7E1] text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 outline-none"
                  />
                  <small className="text-[11px] text-[#5A7366] block">
                    {t('This string appears directly below the PI signature on all certificates.')}
                  </small>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2E4A3E]" htmlFor="pi-signature-upload">
                    {t('Upload Signature Image (PNG, JPG, SVG)')}
                  </label>
                  <input
                    id="pi-signature-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleSignatureFileChange}
                    className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1A503E] file:text-white hover:file:bg-[#103125] cursor-pointer"
                  />
                </div>
              </div>

              {/* Preview Box */}
              <div className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] flex flex-col justify-center items-center text-center space-y-3">
                <span className="text-xs font-bold text-[#5A7366] uppercase tracking-wide">
                  {t('Signature Preview on Certificates')}
                </span>
                <div className="w-56 h-24 bg-white border border-dashed border-[#DCE7E1] rounded-xl flex items-center justify-center p-2 overflow-hidden shadow-inner">
                  {signaturePreview ? (
                    <img
                      src={signaturePreview}
                      alt="PI Signature Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[#5A7366] italic">
                      {t('No signature uploaded yet')}
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-[#103125]">
                  {piAffiliation || t('Principal Investigator, NDLI Project, IIT Kharagpur')}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={piBusy}
              className="px-6 py-3 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              {piBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{piBusy ? t('Saving Settings…') : t('Save Signature & Affiliation Settings')}</span>
            </button>
          </form>

          {/* 12 Regional Officer Utilities Grid */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
            <h3 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-700" />
              {t('Regional Officer Operational Tool Box (12 Utilities)')}
            </h3>
            <p className="text-xs text-[#5A7366]">
              {t('Official links and operational utilities for nodal officers.')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              <a
                href="https://ndl.iitkgp.ac.in"
                target="_blank"
                rel="noreferrer"
                className="p-4 rounded-2xl bg-[#F4F8F6] hover:bg-emerald-50 border border-[#E2ECE7] hover:border-emerald-200 transition-colors space-y-1 block"
              >
                <div className="font-bold text-xs text-[#103125] flex items-center justify-between">
                  <span>1. {t('NDLI Main Portal')}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#5A7366]" />
                </div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('National Digital Library of India home.')}
                </div>
              </a>

              <a
                href="/api/download/user-manual"
                target="_blank"
                rel="noreferrer"
                className="p-4 rounded-2xl bg-[#F4F8F6] hover:bg-emerald-50 border border-[#E2ECE7] hover:border-emerald-200 transition-colors space-y-1 block"
              >
                <div className="font-bold text-xs text-[#103125] flex items-center justify-between">
                  <span>2. {t('Official User Manual (PDF)')}</span>
                  <Download className="w-3.5 h-3.5 text-[#5A7366]" />
                </div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('Comprehensive operational guidebook.')}
                </div>
              </a>

              <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                <div className="font-bold text-xs text-[#103125]">3. {t('Zonal Call Register')}</div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('Integrated in Daily Activity SEC A.')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                <div className="font-bold text-xs text-[#103125]">4. {t('OS Support Ticketing')}</div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('Integrated in Zonal Grievance Desk.')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                <div className="font-bold text-xs text-[#103125]">5. {t('Clubs Universal Directory')}</div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('Instant search with CSV export.')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                <div className="font-bold text-xs text-[#103125]">6. {t('Activity Ledger Export')}</div>
                <div className="text-[11px] text-[#5A7366]">
                  {t('Download CSV from Activity History.')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
