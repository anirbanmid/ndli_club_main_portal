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
 *   Desk 3 Authority Succession is now REAL (M2-A3): view-only oversight of
 *   /admin/api/v1/succession/desk/ — Central Admin reads, the duty-scoped
 *   regional officer decides in the Employee Module; the Forensic Migration
 *   desk is out of M6 scope per owner decision C7 (M6.1 candidate).
 * Desk 5 (Employee Management) is real since slice 1.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Key,
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
import { ForensicQuarantineRecord } from '../types';
import {
  SuccessionRow,
  fetchSuccessionDesk,
  statusLabel,
  tierLabel,
} from '../lib/successionApi';
import { t } from '../i18n';
import { EmployeeDutyPanel } from './EmployeeDutyPanel';
import { InsightsPanel, RedZoneReset, RenewalDesk } from './AdminMccPanels';
import { DashboardsPanel } from './AdminDashboardsPanel';
import { NotificationBell, NotificationItem } from './NotificationBell';
import {
  CharterDecision,
  CharterDetail,
  CharterRow,
  GrievanceRow,
  decideCharter,
  fetchCharter,
  fetchCharterQueue,
  fetchGrievanceQueue,
  fetchRenewalAttention,
  resolveGrievance,
  sweepGrievances,
  changeAdminPassword,
} from '../lib/adminApi';

interface AdminModuleViewProps {
  forensicRecords: ForensicQuarantineRecord[];
  onHealForensicRecord: (recordId: string) => void;
  /** Patch 0016: sign-out control (the admin module had no logout). */
  onSignOut?: () => void;
  /** Patch 0017: session sub-role — MCC Insights is Central/Super only. */
  subRole?: string;
  onLaunchEmployeeNode?: (empId: string) => void;
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
  forensicRecords,
  onHealForensicRecord,
  onSignOut,
  subRole,
  onLaunchEmployeeNode,
}) => {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError(t('New password and confirmation do not match.'));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t('New password must be at least 8 characters long.'));
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNotice(null);
    try {
      await changeAdminPassword(oldPassword, newPassword);
      setPasswordNotice(t('✅ Administrator password updated successfully.'));
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setIsChangePasswordOpen(false), 2000);
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  };
  // Master-control desks (patch 0017) — visibility mirrors the backend gates
  // (enforcement stays server-side): MCC Insights = INSIGHTS_GATE
  // (CentralAdmin/SuperAdminOps); Forensic Migration + System = data_admin
  // ADMIN_GATE (CentralAdmin only — SUPEROPS re-auths via Dual-Layer later).
  const canSeeMcc = subRole === 'central_admin' || subRole === 'super_admin_ops';
  const canSeeRedZone = subRole === 'super_admin_ops'; // red-zone = SERVER turf (owner 2026-10-27 21:29)
  const canSeeEmployee =
    subRole === 'central_admin' || subRole === 'regional_officer'; // business turf (AUTH-TURF: never SUPEROPS)
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [adminTab, setAdminTab] = useState<'dashboards' | 'tickets' | 'renewals' | 'insights' | 'zones' | 'succession'>('dashboards');

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

  const [renewalAttentionCount, setRenewalAttentionCount] = useState<number>(0);

  const loadRenewalAttention = useCallback(async () => {
    try {
      const payload = await fetchRenewalAttention();
      const count = payload.total_attention_count ?? (Array.isArray(payload.results) ? payload.results.length : 0);
      setRenewalAttentionCount(count);
    } catch {
      // ignore
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

  // Desk 3 — authority succession (REAL, M2-A3): Central Admin oversight is
  // read-only by design; decisions live in the duty-scoped Employee desk.
  const [successionRows, setSuccessionRows] = useState<SuccessionRow[]>([]);
  const [successionLoading, setSuccessionLoading] = useState(true);

  const loadSuccession = useCallback(async () => {
    setSuccessionLoading(true);
    try {
      const payload = await fetchSuccessionDesk();
      setSuccessionRows(payload.results);
    } catch {
      // Non-blocking: a closed door shows an honest empty desk
    } finally {
      setSuccessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCharters();
    void loadGrievances();
    void loadRenewalAttention();
    void loadSuccession();
  }, [loadCharters, loadGrievances, loadRenewalAttention, loadSuccession]);

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

  const adminNotifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];

    if (renewalAttentionCount > 0) {
      list.push({
        id: `admin-renew-${renewalAttentionCount}`,
        type: 'renewal',
        title: `${renewalAttentionCount} Club Validity Renewal(s) Due`,
        description: 'Campus clubs due or overdue for annual validity extension.',
        timestamp: 'Renewal Desk',
        read: false,
        actionTab: 'renewals',
      });
    }
    if (openGrievances.length > 0) {
      list.push({
        id: `admin-griev-${openGrievances.length}`,
        type: 'reminder',
        title: `${openGrievances.length} Active Support Ticket(s)`,
        description: 'Unresolved grievance and technical issues pending resolution across zones.',
        timestamp: 'Grievance Desk',
        read: false,
        actionTab: 'tickets',
      });
    }
    if (filteredCharters.length > 0) {
      list.push({
        id: `admin-chart-${filteredCharters.length}`,
        type: 'approval',
        title: `${filteredCharters.length} Open Club Request(s)`,
        description: 'New campus club applications logged for regional officer review.',
        timestamp: 'Renewal Desk',
        read: false,
        actionTab: 'renewals',
      });
    }
    const pendingSuccession = successionRows.filter((r) => r.status === 'pending');
    if (pendingSuccession.length > 0) {
      list.push({
        id: `admin-succ-${pendingSuccession.length}`,
        type: 'succession',
        title: `${pendingSuccession.length} Authority Succession Request(s)`,
        description: 'Nomination orders awaiting the nodal officer’s dual-control sanction.',
        timestamp: 'Succession Desk',
        read: false,
        actionTab: 'succession',
      });
    }
    return list;
  }, [filteredCharters, openGrievances, renewalAttentionCount, successionRows]);

  const handleAdminNavigateTab = (tab: string) => {
    let targetTab: 'dashboards' | 'tickets' | 'renewals' | 'insights' | 'zones' | 'succession' = 'dashboards';
    if (tab === 'tickets' || tab === 'grievances' || tab === 'support') {
      targetTab = 'tickets';
    } else if (tab === 'renewals' || tab === 'charters' || tab === 'clubs' || tab === 'requests') {
      targetTab = 'renewals';
    } else if (tab === 'zones' || tab === 'employees' || tab === 'officers' || tab === 'ro') {
      targetTab = 'zones';
    } else if (tab === 'insights' || tab === 'ai' || tab === 'mcc') {
      targetTab = 'insights';
    } else if (tab === 'succession' || tab === 'authority') {
      targetTab = 'succession';
    } else if (tab === 'dashboards' || tab === 'performance') {
      targetTab = 'dashboards';
    }
    setAdminTab(targetTab);

    setTimeout(() => {
      const el = document.getElementById('admin-desks-container') || document.querySelector('.tab-scroll');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Top Admin Header */}
      <div className="bg-gradient-to-br from-[#103125] via-[#164433] to-[#0A5C3E] text-white p-6 sm:p-8 rounded-3xl border border-[#0D7751]/30 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-visible z-20">
        {/* Ambient glow mesh clipped to banner curvature */}
        <div className="hero-mesh absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-[#0D7751] text-brand-100 text-[11px] font-black px-3 py-0.5 rounded-full border border-brand-400/30 tracking-wider">
              {t("IIT KHARAGPUR NODAL COMMAND")}
            </span>
            <span className="text-xs text-amber-300 font-extrabold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {t("6-Zone National Governance Core")}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight">
            {t("Central Administration & Regional Management Desk")}
          </h1>

          <p className="text-xs sm:text-sm text-brand-100/90 max-w-2xl font-normal leading-relaxed">
            {t("Coordinating club charter approvals, regional support desk dispatches (EMP01–EMP07), institutional authority transitions, and legacy data healing.")}
          </p>
        </div>

        <div className="relative z-30 flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center gap-4 shrink-0">
          <div className="flex items-center gap-2.5 shrink-0 relative z-30">
            <NotificationBell
              notifications={adminNotifications}
              storageKey="ndli_admin_read_notifications"
              variant="dark"
              onNavigateTab={handleAdminNavigateTab}
            />
            <button
              type="button"
              onClick={() => {
                setIsChangePasswordOpen(true);
                setPasswordError(null);
                setPasswordNotice(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold hover:bg-white/20 transition-all shrink-0 flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
              title="Rotate Administrator Password"
            >
              <Key className="w-3.5 h-3.5 text-amber-300" />
              <span>{t("Change Password")}</span>
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold hover:bg-white/20 transition-all shrink-0 cursor-pointer backdrop-blur-md"
              >
                {t("Sign out")}
              </button>
            )}
          </div>

          {/* Telemetry Pills */}
          <div className="grid grid-cols-2 gap-3 text-center shrink-0 w-full sm:w-auto">
            <div className="glass-card bg-white/10 p-3.5 rounded-2xl border border-white/15 backdrop-blur-md shadow-xs">
              <div className="text-2xl sm:text-3xl font-black text-amber-300">
                7
              </div>
              <div className="text-[10px] text-brand-200 uppercase font-black tracking-wider">{t("Nodal Officers")}</div>
            </div>
            <div className="glass-card bg-white/10 p-3.5 rounded-2xl border border-white/15 backdrop-blur-md shadow-xs">
              <div className="text-2xl sm:text-3xl font-black text-white">
                {grievancesLoading ? '—' : openGrievances.length}
              </div>
              <div className="text-[10px] text-brand-200 uppercase font-black tracking-wider">{t("Active Tickets")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone Selector & Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#F4F8F6] p-2 rounded-2xl border border-[#E2ECE7] shadow-2xs">
        {/* Navigation Desks */}
        <div id="admin-desks-container" className="tab-scroll flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setAdminTab('dashboards')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'dashboards' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>{t("Performance Dashboard")}</span>
          </button>

          <button
            onClick={() => setAdminTab('insights')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'insights' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <Users className="h-4 w-4 text-emerald-400" />
            <span>{t("AI Strategic Insights")}</span>
          </button>

          <button
            onClick={() => setAdminTab('zones')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'zones' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <Landmark className="h-4 w-4 text-amber-300" />
            <span>{t("Employee Management")}</span>
          </button>

          <button
            onClick={() => setAdminTab('tickets')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'tickets' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <LifeBuoy className="h-4 w-4" />
            <span>{t("Grievance Desk")} ({filteredGrievances.filter((g) => g.status !== 'resolved').length})</span>
          </button>

          <button
            onClick={() => setAdminTab('renewals')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'renewals' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{t("Renewal Desk")}</span>
          </button>

          <button
            onClick={() => setAdminTab('succession')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              adminTab === 'succession' ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]' : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>{t("Succession Desk")} ({successionRows.filter((r) => r.status === 'pending').length})</span>
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

      {/* DESK 6: Renewal Desk (REAL — D5 stage 1 backend, both Q1 paths) */}
      {adminTab === 'renewals' && <RenewalDesk />}

      {/* DESK 3: Authority Succession Oversight (REAL — M2-A3, view-only) */}
      {adminTab === 'succession' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <Lock className="h-5 w-5 text-[#0D7751]" />
                <span>{t("Authority Succession — Central Oversight")}</span>
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t("Read-only view of every dual-control succession request. The duty-scoped nodal officer decides in the Employee Module; Central Admin sanctions nothing here.")}
              </p>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full self-start">
              {successionRows.filter((r) => r.status === 'pending').length} {t("Pending")}
            </span>
          </div>

          {successionLoading ? (
            <div className="text-center py-12 text-xs text-[#5A7366]">{t("Loading succession desk…")}</div>
          ) : successionRows.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#5A7366]">{t("No authority succession requests found in node registry.")}</div>
          ) : (
            <div className="space-y-3">
              {successionRows.map((req) => (
                <div key={req.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2 text-xs">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-mono font-bold text-[#103125] bg-white px-2 py-0.5 rounded border border-[#E2ECE7]">
                        {req.id}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        req.status === 'approved' ? 'bg-brand-100 text-brand-800' :
                        req.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {t(statusLabel(req.status))}
                      </span>
                      <span className="text-[#5A7366]">
                        ({req.club_name}{req.state_code ? ` • ${req.state_code}` : ''})
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-[#2E4A3E] bg-white px-2 py-0.5 rounded border border-[#E2ECE7]">
                      {t(tierLabel(req.tier))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-ink-700">
                    <div><strong>{t("Current Officer:")}</strong> {req.current_holder || '—'}</div>
                    <div><strong>{t("Incoming Nominee:")}</strong> {req.proposed_name} ({req.proposed_email})</div>
                  </div>

                  <div className="text-[11px] text-[#5A7366]">
                    <strong>{t("Reason:")}</strong> {req.reason}
                    {' • '}{t("Submitted")}{req.submitted_by ? ` ${t("by")} ${req.submitted_by}` : ''} {t("on")} {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>

                  {req.conflicts.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                      <span className="font-bold text-amber-900 text-[11px]">
                        ⚠ {req.conflicts.length} {t("active post(s) elsewhere")}{req.conflicts_confirmed ? ` (${t("confirmed at submission")})` : ''}
                      </span>
                      <ul className="text-[11px] text-amber-800 space-y-0.5 list-disc pl-4">
                        {req.conflicts.map((c, i) => (
                          <li key={`${c.club_code}-${c.tier}-${i}`}>
                            {t(tierLabel(c.tier))} @ {c.club_name} ({c.institution_name}, {c.state_code}) — {t("since")} {c.from_date}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {req.status !== 'pending' && req.decided_by && (
                    <div className="text-[11px] text-[#5A7366] pt-2 border-t border-[#E2ECE7]">
                      <strong>{req.status === 'approved' ? t("Approved by:") : t("Rejected by:")}</strong> {req.decided_by}
                      {req.decision_note ? ` — ${req.decision_note}` : ''}
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-block">
                      {t("Oversight view — the officer on duty decides")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DESK 7: MCC Strategic Insights (REAL — D5 stage 2 backend) */}
      {adminTab === 'insights' && canSeeMcc && <InsightsPanel />}

      {/* DESK 9: Zone dashboards (REAL — D4 endpoints) */}
      {adminTab === 'dashboards' && <DashboardsPanel zoneCode={zoneCode} />}

      

      {/* DESK 5: The 6 Zonal Regions / 7 Regional Officers (REAL since slice 1) */}
      {adminTab === 'zones' && (
        <EmployeeDutyPanel onLaunchEmployeeNode={onLaunchEmployeeNode} />
      )}
   
      {/* Change Admin Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-[#103125]">
                    {t("Change Administrator Password")}
                  </h4>
                  <p className="text-[11px] text-[#5A7366]">
                    {t("Self-service credential rotation for Central Admin account")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {passwordError}
              </div>
            )}
            {passwordNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                {passwordNotice}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t("Current Password")}
                </label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter current admin password"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t("New Password (min 8 characters)")}
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter strong new password"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t("Confirm New Password")}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={passwordBusy}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#103125] hover:bg-[#1a503e] text-white disabled:opacity-50 transition-colors shadow-xs"
                >
                  {passwordBusy ? t("Updating...") : t("Update Password")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};