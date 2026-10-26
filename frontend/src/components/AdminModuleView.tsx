/**
 * Admin Module — Branch 3 "IIT Kharagpur Nodal Command" (M6 D5).
 *
 * D5 slice 2 (2026-10-26): desks 1-2 moved from mock props to REAL APIs.
 *   Desk 1 Club Approvals  -> /admin/api/v1/governance/charter/ (queue +
 *     detail with authorities + upload metadata, decision state machine
 *     queued -> under_review -> sanctioned | rejected). The SERVER owns the
 *     transition table; the UI offers the next legal moves and surfaces
 *     errors verbatim (an illegal move is an ApiError, never a silent no-op).
 *   Desk 2 Grievance Desk  -> /admin/api/v1/grievances/ (queue + resolve
 *     [resolved | not_resolved] + the bounded SLA sweep), with the C3 ladder
 *     visible as timers (72h stream -> 7d cycles -> 30d central escalation).
 *
 * Desks 3-4 remain DEMO SHOWCASES, explicitly marked [REVIEW ONLY]:
 *   Authority Succession has no backend yet (M2-A3 milestone); the Forensic
 *   Migration desk is out of M6 scope per owner decision C7 (M6.1 candidate).
 * Desk 5 (Employee Management) is real since slice 1.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  LifeBuoy,
  Lock,
  Database,
  Landmark,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Users,
  Zap,
  BarChart3,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { AuthorityChangeRequest, ForensicQuarantineRecord } from '../types';
import { t } from '../i18n';
import { EmployeeDutyPanel } from './EmployeeDutyPanel';
import { InsightsPanel, RedZoneReset, RenewalDesk } from './AdminMccPanels';
import { DashboardsPanel } from './AdminDashboardsPanel';
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
  sweepGrievances,
} from '../lib/adminApi';

interface AdminModuleViewProps {
  authorityRequests: AuthorityChangeRequest[];
  forensicRecords: ForensicQuarantineRecord[];
  onApproveAuthorityChange: (reqId: string) => void;
  onHealForensicRecord: (recordId: string) => void;
  /** Patch 0016: sign-out control (the admin module had no logout). */
  onSignOut?: () => void;
}

/** Display zones -> API zone codes (domain.Zone.code, C2 canonical mapping). */
const ZONE_OPTIONS: Array<{ value: string; code: string; label: string }> = [
  { value: 'All', code: 'All', label: 'All 6 Zones' },
  { value: 'North', code: 'NORTH', label: 'North Zone (EMP01)' },
  { value: 'Central', code: 'CENTRAL', label: 'Central Zone (EMP02)' },
  { value: 'West', code: 'WEST', label: 'West Zone (EMP03)' },
  { value: 'East', code: 'EAST', label: 'East Zone (EMP04)' },
  { value: 'North East', code: 'NORTH_EAST', label: 'North East Zone (EMP05)' },
  { value: 'South', code: 'SOUTH', label: 'South Zone (EMP06 • EMP07)' },
];

const CHARTER_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  under_review: 'Under Review',
  sanctioned: 'Sanctioned',
  rejected: 'Rejected',
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  not_resolved: 'Not Resolved',
  resolved: 'Resolved',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 401
      ? t('Please sign in as an administrator to use this desk.')
      : err.message;
  }
  return t('Something went wrong.');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Signed hours until a due time — "5h" or "3h overdue" (SLA timers). */
function hoursUntil(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  const h = Math.round(ms / 36e5);
  return h >= 0 ? `${h}h` : `${-h}h overdue`;
}

function daysSince(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  return `${Math.floor(ms / 864e5)}d`;
}

export const AdminModuleView: React.FC<AdminModuleViewProps> = ({
  authorityRequests,
  forensicRecords,
  onApproveAuthorityChange,
  onHealForensicRecord,
  onSignOut,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [adminTab, setAdminTab] = useState<'approvals' | 'tickets' | 'renewals' | 'succession' | 'migration' | 'insights' | 'dashboards' | 'zones' | 'system'>('approvals');

  // Desk 1 — charter queue (real API)
  const [charters, setCharters] = useState<CharterRow[]>([]);
  const [chartersLoading, setChartersLoading] = useState(true);
  const [charterError, setCharterError] = useState<string | null>(null);
  const [charterNotice, setCharterNotice] = useState<string | null>(null);
  const [expandedCharter, setExpandedCharter] = useState<string | null>(null);
  const [charterDetails, setCharterDetails] = useState<Record<string, CharterDetail>>({});
  const [charterBusy, setCharterBusy] = useState<string | null>(null);

  // Desk 2 — grievance queue (real API)
  const [grievances, setGrievances] = useState<GrievanceRow[]>([]);
  const [grievancesLoading, setGrievancesLoading] = useState(true);
  const [grievanceError, setGrievanceError] = useState<string | null>(null);
  const [grievanceNotice, setGrievanceNotice] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const loadCharters = useCallback(async () => {
    setChartersLoading(true);
    try {
      const payload = await fetchCharterQueue();
      setCharters(payload.results);
      setCharterError(null);
    } catch (err) {
      setCharterError(errorMessage(err));
    } finally {
      setChartersLoading(false);
    }
  }, []);

  const loadGrievances = useCallback(async () => {
    setGrievancesLoading(true);
    try {
      const payload = await fetchGrievanceQueue();
      setGrievances(payload.results);
      setGrievanceError(null);
    } catch (err) {
      setGrievanceError(errorMessage(err));
    } finally {
      setGrievancesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCharters();
    void loadGrievances();
  }, [loadCharters, loadGrievances]);

  const toggleCharter = async (id: string) => {
    if (expandedCharter === id) {
      setExpandedCharter(null);
      return;
    }
    setExpandedCharter(id);
    if (!charterDetails[id]) {
      try {
        const detail = await fetchCharter(id);
        setCharterDetails((prev) => ({ ...prev, [id]: detail }));
      } catch (err) {
        setCharterError(errorMessage(err));
        setExpandedCharter(null);
      }
    }
  };

  const onCharterDecision = async (id: string, decision: CharterDecision) => {
    let reason: string | undefined;
    if (decision === 'reject') {
      const typed =
        window.prompt(t('Reason for rejecting this charter (sent to the college):'), '') ?? '';
      if (!typed.trim()) return;
      reason = typed.trim();
    }
    setCharterBusy(id);
    setCharterNotice(null);
    try {
      await decideCharter(id, { decision, ...(reason ? { reason } : {}) });
      setCharterNotice(t('Decision recorded on the charter.'));
      setExpandedCharter(null);
      await loadCharters();
    } catch (err) {
      setCharterError(errorMessage(err));
    } finally {
      setCharterBusy(null);
    }
  };

  const onTicketDecision = async (id: string, decision: 'resolved' | 'not_resolved') => {
    const typed = window.prompt(
      decision === 'resolved'
        ? t('Resolution summary for the college:')
        : t('Why is this not resolved? (this starts the next 7-day cycle):'),
      '',
    );
    if (typed === null) return;
    setTicketBusy(id);
    setGrievanceNotice(null);
    try {
      await resolveGrievance(id, {
        decision,
        ...(typed.trim() ? { reason: typed.trim() } : {}),
      });
      setGrievanceNotice(
        decision === 'resolved'
          ? t('Ticket resolved.')
          : t('Marked Not Resolved — the next reminder cycle is scheduled.'),
      );
      await loadGrievances();
    } catch (err) {
      setGrievanceError(errorMessage(err));
    } finally {
      setTicketBusy(null);
    }
  };

  const onSweep = async () => {
    setSweeping(true);
    setGrievanceNotice(null);
    try {
      const result = await sweepGrievances();
      const counts = Object.entries(result)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      setGrievanceNotice(counts ? `${t('SLA sweep complete.')} ${counts}` : t('SLA sweep complete.'));
      await loadGrievances();
    } catch (err) {
      setGrievanceError(errorMessage(err));
    } finally {
      setSweeping(false);
    }
  };

  const zoneCode = ZONE_OPTIONS.find((z) => z.value === selectedZone)?.code ?? 'All';
  const filteredCharters = charters.filter((c) => zoneCode === 'All' || c.zone_code === zoneCode);
  const filteredGrievances = grievances.filter((g) => zoneCode === 'All' || g.zone_code === zoneCode);
  const openGrievances = grievances.filter((g) => g.status !== 'resolved');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Top Admin Header */}
      <div className="bg-[#103125] text-white p-5 sm:p-7 rounded-3xl border border-[#1A503E] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-[#0D7751] text-brand-100 text-[11px] font-black px-2.5 py-0.5 rounded-full border border-brand-400/30">
              {t("IIT KHARAGPUR NODAL COMMAND")}
            </span>
            <span className="text-xs text-amber-300 font-semibold">
              {t("6-Zone National Governance Core")}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("Central Administration & Regional Management Desk")}
          </h1>

          <p className="text-xs text-brand-200/90 max-w-2xl">
            {t("Coordinating club charter approvals, regional support desk dispatches (EMP01–EMP07), institutional authority transitions, and legacy data healing.")}
          </p>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold hover:bg-white/20 transition-all shrink-0"
          >
            {t("Sign out")}
          </button>
        )}

        {/* Telemetry Pills — live counts from the real queues */}
        <div className="grid grid-cols-2 gap-3 text-center shrink-0">
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-xs">
            <div className="text-2xl font-black text-amber-300">
              {chartersLoading ? '—' : filteredCharters.length}
            </div>
            <div className="text-[11px] text-brand-200 uppercase font-bold">{t("Charters In Queue")}</div>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-xs">
            <div className="text-2xl font-black text-white">
              {grievancesLoading ? '—' : openGrievances.length}
            </div>
            <div className="text-[11px] text-brand-200 uppercase font-bold">{t("Active Tickets")}</div>
          </div>
        </div>
      </div>

      {/* Zone Selector & Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-3 rounded-2xl border border-[#E2ECE7] shadow-xs">
        {/* Navigation Desks */}
        <div className="tab-scroll flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setAdminTab('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'approvals' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>{t("Club Approvals")} ({filteredCharters.length})</span>
          </button>

          <button
            onClick={() => setAdminTab('tickets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'tickets' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <LifeBuoy className="h-4 w-4" />
            <span>{t("Grievance Desk")} ({filteredGrievances.filter((g) => g.status !== 'resolved').length})</span>
          </button>

          <button
            onClick={() => setAdminTab('succession')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'succession' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>{t("Authority Succession")} ({authorityRequests.length})</span>
          </button>

          <button
            onClick={() => setAdminTab('migration')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'migration' ? 'bg-[#B45309] text-white shadow-xs' : 'text-[#B45309] hover:bg-amber-50'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>{t("Forensic Migration Desk")}</span>
            <span className="bg-white text-[#B45309] text-[11px] px-1 rounded font-black">{t("Legacy Data Healing")}</span>
          </button>

          <button
            onClick={() => setAdminTab('zones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'zones' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Landmark className="h-4 w-4" />
            <span>{t("7 Regional Officers")}</span>
          </button>

          <button
            onClick={() => setAdminTab('renewals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'renewals' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{t("Renewal Desk")}</span>
          </button>

          <button
            onClick={() => setAdminTab('insights')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'insights' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{t("MCC Insights")}</span>
          </button>

          <button
            onClick={() => setAdminTab('dashboards')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'dashboards' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>{t("Dashboards")}</span>
          </button>

          <button
            onClick={() => setAdminTab('system')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'system' ? 'bg-rose-700 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{t("System")}</span>
          </button>
        </div>

        {/* Regional Zone Filter */}
        <div className="flex items-center space-x-2 text-xs self-end sm:self-auto">
          <Filter className="h-3.5 w-3.5 text-[#5A7366]" />
          <span className="font-semibold text-[#5A7366]">{t("Zone:")}</span>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="text-xs font-bold text-[#103125] bg-[#F4F8F6] border border-[#E2ECE7] rounded-lg px-2.5 py-1.5 shadow-xs hover:border-[#0D7751]/40 focus:outline-hidden focus:ring-2 focus:ring-[#0D7751]/25 transition-colors"
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z.value} value={z.value}>{t(z.label)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* DESK 1: Charter Review & Sanction Desk (REAL — apps.governance) */}
      {adminTab === 'approvals' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-[#103125]">
                {t("Charter Review & Sanction Desk")}
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t("Review the onboarding file (4-tier quorum + uploads) and move the charter through queued → under review → sanctioned / rejected.")}
              </p>
            </div>
            <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-3 py-1 rounded-full">
              {filteredCharters.length} {t("In Queue")}
            </span>
          </div>

          {charterNotice && (
            <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-semibold">
              {charterNotice}
            </div>
          )}
          {charterError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {charterError}</span>
              <button onClick={() => void loadCharters()} className="underline font-bold">{t("Retry")}</button>
            </div>
          )}

          {chartersLoading ? (
            <div className="text-center py-12 text-xs text-[#5A7366]">{t("Loading charter queue…")}</div>
          ) : filteredCharters.length > 0 ? (
            <div className="space-y-4">
              {filteredCharters.map((row) => {
                const detail = charterDetails[row.id];
                const busy = charterBusy === row.id;
                return (
                  <div key={row.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            row.status === 'sanctioned' ? 'bg-brand-100 text-brand-800'
                              : row.status === 'rejected' ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {t(CHARTER_STATUS_LABEL[row.status] ?? row.status)}
                          </span>
                          <span className="text-xs font-semibold text-[#5A7366]">
                            {t("Zone:")} <strong>{row.zone_code}</strong> • {row.state_code} • {row.district_code}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-[#103125] mt-1">{row.club_name}</h4>
                        <div className="text-xs text-[#5A7366]">{row.institution_name}</div>
                        <div className="text-[11px] text-[#5A7366] mt-0.5">
                          {t("Submitted:")} {formatDate(row.submitted_at)}
                          {row.reviewed_at ? ` • ${t("Reviewed:")} ${formatDate(row.reviewed_at)}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => void toggleCharter(row.id)}
                          className="px-3.5 py-1.5 rounded-lg border border-[#0D7751]/30 bg-white hover:bg-[#E9F5EF] text-[#0D7751] text-xs font-bold transition-all flex items-center space-x-1"
                        >
                          <FileText className="h-4 w-4" />
                          <span>{expandedCharter === row.id ? t("Hide File") : t("Review File")}</span>
                        </button>
                      </div>
                    </div>

                    {expandedCharter === row.id && (
                      <div className="pt-2 border-t border-[#E2ECE7] space-y-4">
                        {!detail ? (
                          <div className="text-xs text-[#5A7366]">{t("Loading file…")}</div>
                        ) : (
                          <>
                            {/* 4-Authority Quorum (detail payload) */}
                            <div>
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5A7366] block mb-2 flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5" /> {t("Submitted Authority Quorum")}
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                {detail.authorities.map((a) => (
                                  <div key={a.role} className="p-2.5 rounded-lg bg-white border border-[#E2ECE7]">
                                    <span className="text-[11px] font-bold text-[#0D7751] uppercase">{t(a.role)}</span>
                                    <div className="font-bold text-[#103125]">{a.full_name}</div>
                                    <div className="text-[11px] text-[#5A7366]">{t(a.designation)}</div>
                                    <div className={`text-[11px] font-bold ${a.otp_verified ? 'text-brand-700' : 'text-amber-700'}`}>
                                      {a.otp_verified ? t("OTP verified") : t("OTP pending")}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Uploads — metadata only, bytes stay behind the scoped endpoint */}
                            <div>
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5A7366] block mb-2 flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5" /> {t("Uploaded Documents")} ({detail.uploads.length})
                              </span>
                              <div className="space-y-1.5">
                                {detail.uploads.map((u) => (
                                  <div key={u.id} className="p-2.5 rounded-lg bg-white border border-[#E2ECE7] text-xs flex justify-between items-center">
                                    <span className="font-mono font-semibold text-[#103125]">{u.original_name}</span>
                                    <span className="text-[11px] text-[#5A7366]">{u.mime_type} • {Math.round(u.size_bytes / 1024)} KB • {formatDate(u.uploaded_at)}</span>
                                  </div>
                                ))}
                                {detail.uploads.length === 0 && (
                                  <div className="text-[11px] text-[#5A7366]">{t("No documents uploaded.")}</div>
                                )}
                              </div>
                            </div>

                            {row.review_reason && (
                              <div className="text-xs text-[#5A7366]">
                                {t("Review note:")} <span className="font-semibold">{row.review_reason}</span>
                              </div>
                            )}

                            {/* State-machine actions — the server owns the transitions */}
                            <div className="flex items-center space-x-2 pt-1">
                              {row.status === 'queued' && (
                                <button
                                  onClick={() => void onCharterDecision(row.id, 'review')}
                                  disabled={busy}
                                  className="px-4 py-1.5 rounded-lg bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                                >
                                  {t("Start Review")}
                                </button>
                              )}
                              {row.status === 'under_review' && (
                                <button
                                  onClick={() => void onCharterDecision(row.id, 'sanction')}
                                  disabled={busy}
                                  className="px-4 py-1.5 rounded-lg bg-[#0D7751] hover:bg-[#0a5c3e] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>{t("Sanction Charter")}</span>
                                </button>
                              )}
                              {(row.status === 'queued' || row.status === 'under_review') && (
                                <button
                                  onClick={() => void onCharterDecision(row.id, 'reject')}
                                  disabled={busy}
                                  className="px-3.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center space-x-1 disabled:opacity-50"
                                >
                                  <XCircle className="h-4 w-4" />
                                  <span>{t("Reject")}</span>
                                </button>
                              )}
                              {busy && <span className="text-[11px] text-[#5A7366]">{t("Saving…")}</span>}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-[#5A7366]">
              <CheckCircle2 className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h4 className="font-bold text-[#103125]">{t("Charter Queue Clear")}</h4>
              <p>{t("No charter applications in the selected zone.")}</p>
            </div>
          )}
        </div>
      )}

      {/* DESK 2: Grievance & SLA Dispatch Desk (REAL — apps.grievances) */}
      {adminTab === 'tickets' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#103125]">
                {t("National Grievance & SLA Dispatch Desk")}
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t("Club-authority issues routed to the regional desks. Timers show the C3 ladder: 72h reminders → 7-day cycles → 30-day central escalation.")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
                {filteredGrievances.filter((g) => g.status !== 'resolved').length} {t("Unresolved Issues")}
              </span>
              <button
                onClick={() => void onSweep()}
                disabled={sweeping}
                className="px-3 py-1.5 rounded-lg bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{sweeping ? t("Sweeping…") : t("Run SLA Sweep")}</span>
              </button>
            </div>
          </div>

          {grievanceNotice && (
            <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-semibold">
              {grievanceNotice}
            </div>
          )}
          {grievanceError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {grievanceError}</span>
              <button onClick={() => void loadGrievances()} className="underline font-bold">{t("Retry")}</button>
            </div>
          )}

          {grievancesLoading ? (
            <div className="text-center py-12 text-xs text-[#5A7366]">{t("Loading grievance queue…")}</div>
          ) : (
            <div className="space-y-3">
              {filteredGrievances.map((row) => {
                const busy = ticketBusy === row.id;
                const resolved = row.status === 'resolved';
                return (
                  <div key={row.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2 text-xs">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-mono font-bold text-[#103125] bg-white px-2 py-0.5 rounded border border-[#E2ECE7]">
                          {row.id.slice(0, 8)}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          resolved ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {t(TICKET_STATUS_LABEL[row.status] ?? row.status)}
                        </span>
                        {row.is_admin_escalated && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {t("Central Escalation Active")}
                          </span>
                        )}
                        <span className="text-[#5A7366]">({row.zone_code} • {row.state_code})</span>
                      </div>

                      {!resolved ? (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => void onTicketDecision(row.id, 'resolved')}
                            disabled={busy}
                            className="px-3 py-1 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs disabled:opacity-50"
                          >
                            {t("Mark Resolved")}
                          </button>
                          <button
                            onClick={() => void onTicketDecision(row.id, 'not_resolved')}
                            disabled={busy}
                            className="px-3 py-1 rounded-lg border border-amber-300 bg-white text-amber-800 font-bold hover:bg-amber-50 shadow-2xs disabled:opacity-50"
                          >
                            {t("Not Resolved")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-brand-700 font-bold bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                          {t("✓ Resolved")}
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-[#103125]">{row.subject}</div>
                    <p className="text-[#5A7366]">{row.description}</p>

                    <div className="pt-2 border-t border-[#E2ECE7] flex flex-wrap justify-between items-center gap-2 text-[11px] text-[#5A7366]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("Raised by:")} {row.raised_by ?? '—'} • {t("Age:")} {daysSince(row.created_at)} • {t("Next reminder:")} {hoursUntil(row.reminder_due_at)}
                      </span>
                      <span className={row.is_admin_escalated ? 'text-rose-700 font-bold' : ''}>
                        {row.is_admin_escalated
                          ? `${t("Escalated:")} ${formatDate(row.escalated_at)}`
                          : `${t("Central escalation:")} ${hoursUntil(row.admin_reminder_due_at)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredGrievances.length === 0 && (
                <div className="text-center py-12 text-xs text-[#5A7366]">
                  <CheckCircle2 className="h-10 w-10 text-brand-500 mx-auto mb-2" />
                  <h4 className="font-bold text-[#103125]">{t("No Issues In This Zone")}</h4>
                  <p>{t("The grievance queue is clear for the selected zone.")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DESK 3: Authority Succession — DEMO SHOWCASE (no backend yet: M2-A3) */}
      {adminTab === 'succession' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("[REVIEW ONLY] Demo data — the live Authority Succession desk arrives with milestone M2-A3.")}
          </div>
          <div className="border-b border-[#E2ECE7] pb-4">
            <h3 className="text-lg font-bold text-[#103125]">
              {t("Institutional Authority Succession & Charter Re-Signing Gate")}
            </h3>
            <p className="text-xs text-[#5A7366]">
              {t("Validate appointment orders and cryptographically sanction leadership changes for colleges.")}
            </p>
          </div>

          <div className="space-y-4">
            {authorityRequests.map(req => (
              <div key={req.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-[#103125]">{req.id} • {req.clubName}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    req.status === 'Approved & Updated' ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {t(req.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-white p-3 rounded-xl border border-[#E2ECE7]">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#5A7366]">{t("Current Officer")}</span>
                    <div className="font-bold text-[#103125]">{t(req.currentName)}</div>
                    <div className="text-[11px] text-[#5A7366]">{t("Role:")} {t(req.role)}</div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#0D7751]">{t("Incoming Nominee")}</span>
                    <div className="font-bold text-[#103125]">{t(req.proposedName)}</div>
                    <div className="text-[11px] text-[#5A7366]">{req.proposedEmail} ({req.proposedPhone})</div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-[#5A7366]">
                  <span>{t("Uploaded Order:")} <strong className="font-mono">{req.officialDocName}</strong></span>
                  {req.status === 'Pending Admin Review' && (
                    <button
                      onClick={() => onApproveAuthorityChange(req.id)}
                      className="px-4 py-1.5 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs"
                    >
                      {t("Authorize & Re-Sign Charter")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DESK 4: Forensic Migration — DEMO SHOWCASE (out of M6 per C7) */}
      {adminTab === 'migration' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("[REVIEW ONLY] Showcase sample — the live Quarantine & Healing desk is out of M6 scope (owner decision C7; M6.1 candidate).")}
          </div>
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1 rounded-full mb-1">
                <Database className="h-3.5 w-3.5 text-amber-700" />
                <span>{t("Legacy Database Recovery & Reconciliation Pipeline")}</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                {t("Forensic Migration & Recovery of Legacy Data")}
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t("Automated schema reverse-engineering, entity inference against AISHE master, and reconciliation-accounted healing.")}
              </p>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-[#0D7751]">{forensicRecords.length ? Math.round(forensicRecords.filter(r => r.recoveryStatus === 'Auto-Healed').length / forensicRecords.length * 100) : 0}%</span>
              <span className="block text-[11px] font-bold uppercase text-[#5A7366]">{t("Auto-Healing Rate (Sample)")}</span>
            </div>
          </div>

          {/* Migration Pipeline Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-center">
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#103125]">{forensicRecords.length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">{t("Legacy Records Scanned")}</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-brand-700">{forensicRecords.filter(r => r.recoveryStatus === 'Auto-Healed').length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">{t("Reconstructed & Healed")}</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#B45309]">{forensicRecords.filter(r => r.recoveryStatus === 'Needs Review').length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">{t("Quarantined for Review")}</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#0D7751]">—</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">{t("Past Certs Re-Anchored (live count at M8)")}</div>
            </div>
          </div>

          {/* Quarantined Records Inspection Table */}
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-sm text-[#103125]">{t("Isolated Anomaly Quarantine Table:")}</h4>
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">{t("Legacy ID")}</th>
                    <th className="p-3">{t("Raw Ingested Name")}</th>
                    <th className="p-3">{t("Detected Anomaly")}</th>
                    <th className="p-3">{t("Inferred AISHE")}</th>
                    <th className="p-3">{t("Status")}</th>
                    <th className="p-3 text-right">{t("Action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {forensicRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-[#F4F8F6]/60">
                      <td className="p-3 font-mono font-bold text-[#103125]">{rec.legacyId}</td>
                      <td className="p-3 font-semibold text-rose-900">{rec.rawInstituteName}</td>
                      <td className="p-3 text-[#5A7366] max-w-xs">{rec.anomalyDetected}</td>
                      <td className="p-3 font-mono text-brand-800 font-bold">{rec.healedAisheCode}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          rec.recoveryStatus === 'Auto-Healed' ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {t(rec.recoveryStatus)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {rec.recoveryStatus !== 'Auto-Healed' ? (
                          <button
                            onClick={() => onHealForensicRecord(rec.id)}
                            className="px-3 py-1 rounded bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs"
                          >
                            {t("Heal & Commit")}
                          </button>
                        ) : (
                          <span className="text-brand-700 font-bold">{t("✓ Committed")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DESK 6: Renewal Desk (REAL — D5 stage 1 backend, both Q1 paths) */}
      {adminTab === 'renewals' && <RenewalDesk />}

      {/* DESK 7: MCC Strategic Insights (REAL — D5 stage 2 backend) */}
      {adminTab === 'insights' && <InsightsPanel />}

      {/* DESK 9: Zone dashboards (REAL — D4 endpoints) */}
      {adminTab === 'dashboards' && <DashboardsPanel zoneCode={zoneCode} />}

      {/* DESK 8: Red Zone guarded hard reset (REAL — D5 stage 3 backend) */}
      {adminTab === 'system' && <RedZoneReset />}

      {/* DESK 5: The 6 Zonal Regions / 7 Regional Officers (REAL since slice 1) */}
      {adminTab === 'zones' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4">
            <h3 className="text-lg font-bold text-[#103125]">
              {t("Employee Management")}
            </h3>
            <p className="text-xs text-[#5A7366]">
              {t("Who handles which States/UTs. Saving a duty set re-routes work immediately.")}
            </p>
          </div>

          <EmployeeDutyPanel />
        </div>
      )}
    </div>
  );
};
