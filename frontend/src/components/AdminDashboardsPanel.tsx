/**
 * Admin Performance Dashboard Panel — Central Administration Office (Tier 2).
 *
 * Full parity with previous project templates/admin.html, static/js/admin_analytics.js,
 * and static/js/admin_attention.js:
 * - Top Filter Bar: Zone & Year scope, Refresh Metrics ↻, User Manual (PDF), Download Master CSV, Create Report.
 * - Top 5 zero-jargon KPI cards:
 *   1) Total NDLI Clubs (click opens Club Register modal)
 *   2) Total Daily Support Logs
 *   3) Active Nodal Officers (EMP01–EMP07)
 *   4) Renewal Attention (click opens Renewal Attention modal)
 *   5) 30-Day Escalations (SLA monitor)
 * - 4 Detailed Statistical Analytics Highlight Metric Cards (Telemetrics):
 *   1) National State Coverage (represented / 36 states, coverage %, deficit states)
 *   2) Club Retention Rate (active cycle %, active vs overdue)
 *   3) Support Density Ratio (support logs per club)
 *   4) Leading Regional Zone (top volume zone, count, share %)
 * - 2x2 Infographics Grid:
 *   1) Zone Donut Chart SVG (segmented two-tone donut ring with center total count, labels, and color-coded legend)
 *   2) Monthly Registration Trajectory Area Graph (SVG Catmull-Rom smooth curve with gradient fill and data point dots)
 *   3) SEC A Support Activity Breakdown (Phone & Remote, OS Tickets, Online Training, Offline Training tiles)
 *   4) Club Renewal & Retention Health Gauge (Segmented ring SVG with center total + stacked color scale bar + Attention Center)
 * - National State-Wise Penetration & Density Roster table (All 36 States & UTs with color-gradient density indicators)
 * - Regional Officer Performance Evaluation & Star Rating Matrix (EMP01–EMP07, 50/30/20/10 weighted formula, rank medals 🥇🥈🥉, star ratings)
 * - Activity Distribution Matrix (Contribution share ribbon and officer matrix)
 * - Renewal Attention Modal (All / Overdue / Expiring Soon filters, real-time search, inspect action)
 * - Club Register Modal & Club Details Modal with Admin Super-Power TOTP Password Regeneration.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  Filter,
  Info,
  Key,
  Layers,
  Lock,
  MapPin,
  Navigation,
  PhoneCall,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { ApiError, TelemetryPayload, fetchTelemetry } from '../lib/api';
import { t } from '../i18n';
import {
  AdminClubRow,
  OfficerEvaluation,
  OfficerRatings,
  RenewalAttention,
  RenewalAttentionRow,
  ZoneDashboard,
  fetchAdminClubs,
  fetchAdminTotpSetup,
  fetchGrievanceQueue,
  fetchOfficerRatings,
  resolveGrievance,
  fetchRenewalAttention,
  fetchZoneDashboard,
  getMasterClubsExportUrl,
  resetClubPassword,
  updateClubDetails,
  verifyAdminTotpSetup,
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
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

interface StatCardProps {
  label: string;
  value: number | string;
  desc: string;
  badge?: string;
  icon: React.ReactNode;
  variant?: 'green' | 'amber' | 'blue' | 'purple' | 'rose';
  onClick?: () => void;
  clickable?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  desc,
  badge,
  icon,
  variant = 'green',
  onClick,
  clickable = false,
}) => {
  const colorStyles = {
    green: {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      ring: 'hover:border-emerald-400 hover:ring-2 hover:ring-emerald-200',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-900 border-amber-200',
      iconBg: 'bg-amber-100 text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-800',
      ring: 'hover:border-amber-400 hover:ring-2 hover:ring-amber-200',
    },
    blue: {
      bg: 'bg-sky-50 text-sky-900 border-sky-200',
      iconBg: 'bg-sky-100 text-sky-700',
      badgeBg: 'bg-sky-100 text-sky-800',
      ring: 'hover:border-sky-400 hover:ring-2 hover:ring-sky-200',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-900 border-purple-200',
      iconBg: 'bg-purple-100 text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-800',
      ring: 'hover:border-purple-400 hover:ring-2 hover:ring-purple-200',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-900 border-rose-200',
      iconBg: 'bg-rose-100 text-rose-700',
      badgeBg: 'bg-rose-100 text-rose-800',
      ring: 'hover:border-rose-400 hover:ring-2 hover:ring-rose-200',
    },
  }[variant];

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3 transition-all ${
        clickable
          ? `cursor-pointer hover:scale-[1.02] hover:shadow-md ${colorStyles.ring}`
          : 'hover:shadow-sm'
      }`}
      title={clickable ? `Click to inspect ${label}` : undefined}
    >
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
        <div className="text-xs font-bold text-[#2E4A3E] mt-0.5 flex items-center justify-between">
          <span>{label}</span>
          {clickable && (
            <span className="text-[10px] text-[#0D7751] font-bold flex items-center gap-0.5">
              <span>View List</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
        <div className="text-[11px] text-[#5A7366] mt-1">
          {desc}
        </div>
      </div>
    </div>
  );
};

function normalizeZoneName(zone?: string | null): string {
  if (!zone) return 'Central';
  const clean = zone.trim().toUpperCase().replace(/[-_]/g, ' ');
  if (clean === 'NORTH EAST' || clean === 'NORTHEAST') return 'North East';
  if (clean === 'NORTH') return 'North';
  if (clean === 'SOUTH') return 'South';
  if (clean === 'EAST') return 'East';
  if (clean === 'WEST') return 'West';
  if (clean === 'CENTRAL') return 'Central';
  if (clean.includes('NORTH') && clean.includes('EAST')) return 'North East';
  if (clean.includes('NORTH')) return 'North';
  if (clean.includes('SOUTH')) return 'South';
  if (clean.includes('EAST')) return 'East';
  if (clean.includes('WEST')) return 'West';
  return 'Central';
}

export const DashboardsPanel: React.FC<{ zoneCode: string }> = ({ zoneCode }) => {
  // Filter bar states
  const [selectedZoneScope, setSelectedZoneScope] = useState<string>(zoneCode === 'All' ? 'ALL' : zoneCode);
  const [selectedYearScope, setSelectedYearScope] = useState<string>('ALL');

  // Performance matrix filters
  const [perfYear, setPerfYear] = useState<string>('ALL');
  const [perfMonth, setPerfMonth] = useState<string>('ALL');
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [perfState, setPerfState] = useState<string>('ALL');

  // Backend data
  const [dashboard, setDashboard] = useState<ZoneDashboard | null>(null);
  const [ratings, setRatings] = useState<OfficerRatings | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [renewalAttention, setRenewalAttention] = useState<RenewalAttention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 30-Day Escalations modal state
  const [isEscalationsModalOpen, setIsEscalationsModalOpen] = useState(false);
  const [escalationsList, setEscalationsList] = useState<any[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [escalationsSearchQuery, setEscalationsSearchQuery] = useState('');
  const [selectedEscalatedIssue, setSelectedEscalatedIssue] = useState<any | null>(null);

  const openEscalationsModal = async () => {
    setIsEscalationsModalOpen(true);
    setEscalationsLoading(true);
    try {
      const q = await fetchGrievanceQueue();
      setEscalationsList(q.results || []);
    } catch {
      // fallback
    } finally {
      setEscalationsLoading(false);
    }
  };

  // Renewal Attention Modal state
  const [isAttentionModalOpen, setIsAttentionModalOpen] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState<'ALL' | 'Overdue' | 'Expiring Soon'>('ALL');
  const [attentionSearchQuery, setAttentionSearchQuery] = useState('');

  // Club Register Modal state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [clubsList, setClubsList] = useState<AdminClubRow[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Club Details Modal state
  const [selectedClub, setSelectedClub] = useState<AdminClubRow | null>(null);
  const [editInstName, setEditInstName] = useState('');
  const [editRegNo, setEditRegNo] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPatronName, setEditPatronName] = useState('');
  const [editPatronEmail, setEditPatronEmail] = useState('');
  const [editPresidentName, setEditPresidentName] = useState('');
  const [editPresidentEmail, setEditPresidentEmail] = useState('');
  const [editSecretaryName, setEditSecretaryName] = useState('');
  const [editSecretaryEmail, setEditSecretaryEmail] = useState('');
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  // Admin Super-Power TOTP Reset Modal state
  const [isTotpModalOpen, setIsTotpModalOpen] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    username: string;
    temporary_password: string;
    club_code: string;
    institution_name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Google Authenticator TOTP Setup state
  const [totpSetupData, setTotpSetupData] = useState<{
    secret: string;
    otpauth_uri: string;
    is_enabled: boolean;
  } | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupCode, setSetupCode] = useState('');
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  const effectiveZone = selectedZoneScope === 'ALL' ? undefined : selectedZoneScope;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r, tData, renData] = await Promise.all([
        fetchZoneDashboard({ zone: effectiveZone }),
        fetchOfficerRatings({
          zone: effectiveZone,
          year: perfYear !== 'ALL' ? perfYear : undefined,
          month: perfMonth !== 'ALL' ? perfMonth : undefined,
          state: perfState !== 'ALL' ? perfState : undefined,
        }),
        fetchTelemetry().catch(() => null),
        fetchRenewalAttention({ zone: effectiveZone }).catch(() => null),
      ]);
      setDashboard(d);
      setRatings(r);
      setTelemetry(tData);
      setRenewalAttention(renData);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [effectiveZone, perfYear, perfMonth, perfState]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openClubRegister = async () => {
    setIsRegisterOpen(true);
    setClubsLoading(true);
    try {
      const res = await fetchAdminClubs();
      setClubsList(res.clubs);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClubsLoading(false);
    }
  };

  const openRenewalAttentionModal = (initialFilter: 'ALL' | 'Overdue' | 'Expiring Soon' = 'ALL') => {
    setAttentionFilter(initialFilter);
    setAttentionSearchQuery('');
    setIsAttentionModalOpen(true);
  };

  const openClubDetailsFromCode = async (clubCode: string) => {
    let list = clubsList;
    if (list.length === 0) {
      try {
        const res = await fetchAdminClubs();
        list = res.clubs;
        setClubsList(list);
      } catch {
        // fallback
      }
    }
    const found = list.find((c) => c.code === clubCode);
    if (found) {
      openClubDetails(found);
    } else {
      openClubDetails({
        id: 0,
        code: clubCode,
        club_id: clubCode,
        registration_no: `NDLI/CLUB/${clubCode}`,
        name: clubCode,
        institution_name: clubCode,
        state: '',
        state_code: '',
        zone: '',
        status: 'Approved',
      });
    }
  };

  const openClubDetails = (club: AdminClubRow) => {
    setSelectedClub(club);
    setEditInstName(club.institution_name || club.name || '');
    setEditRegNo(club.registration_no || '');
    setEditStatus(club.status || 'Approved');
    setEditPatronName(club.patron_name || '');
    setEditPatronEmail(club.patron_email || '');
    setEditPresidentName(club.president_name || '');
    setEditPresidentEmail(club.president_email || '');
    setEditSecretaryName(club.secretary_name || '');
    setEditSecretaryEmail(club.secretary_email || '');
    setDetailsNotice(null);
  };

  const handleSaveClubDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) return;
    setDetailsBusy(true);
    setDetailsNotice(null);
    try {
      await updateClubDetails(selectedClub.code, {
        institution_name: editInstName.trim(),
        registration_no: editRegNo.trim(),
        status: editStatus,
        patron_name: editPatronName.trim(),
        patron_email: editPatronEmail.trim(),
        president_name: editPresidentName.trim(),
        president_email: editPresidentEmail.trim(),
        secretary_name: editSecretaryName.trim(),
        secretary_email: editSecretaryEmail.trim(),
      });
      setClubsList((prev) =>
        prev.map((c) =>
          c.code === selectedClub.code
            ? {
                ...c,
                institution_name: editInstName.trim(),
                name: editInstName.trim(),
                registration_no: editRegNo.trim(),
                status: editStatus,
                patron_name: editPatronName.trim(),
                patron_email: editPatronEmail.trim(),
                president_name: editPresidentName.trim(),
                president_email: editPresidentEmail.trim(),
                secretary_name: editSecretaryName.trim(),
                secretary_email: editSecretaryEmail.trim(),
              }
            : c,
        ),
      );
      setDetailsNotice(t('Club properties updated in live database.'));
    } catch (err) {
      setDetailsNotice(`${errorMessage(err)}`);
    } finally {
      setDetailsBusy(false);
    }
  };

  const handleOpenTotpReset = () => {
    setIsTotpModalOpen(true);
    setTotpCode('');
    setCustomPassword('');
    setTotpError(null);
    setGeneratedCredentials(null);
    setCopied(false);
  };

  const handleExecuteTotpReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) return;
    if (!totpCode.trim() || totpCode.trim().length !== 6) {
      setTotpError(t('Please enter a valid 6-digit Google Authenticator code.'));
      return;
    }
    setTotpBusy(true);
    setTotpError(null);
    try {
      const res = await resetClubPassword(
        selectedClub.code,
        totpCode.trim(),
        customPassword.trim() || undefined,
      );
      setGeneratedCredentials({
        username: res.username,
        temporary_password: res.temporary_password,
        club_code: res.club_code,
        institution_name: res.institution_name,
      });
    } catch (err) {
      setTotpError(errorMessage(err));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!generatedCredentials) return;
    const text = `NDLI Club Authority Login Credentials\nInstitution: ${generatedCredentials.institution_name}\nClub Code: ${generatedCredentials.club_code}\nUser ID: ${generatedCredentials.username}\nTemporary Password: ${generatedCredentials.temporary_password}\nPortal: ${window.location.origin}`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleOpenTotpSetup = async () => {
    setIsSetupOpen(true);
    setSetupNotice(null);
    try {
      const data = await fetchAdminTotpSetup();
      setTotpSetupData(data);
    } catch (err) {
      setSetupNotice(errorMessage(err));
    }
  };

  const handleVerifyTotpSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode.trim()) return;
    try {
      const res = await verifyAdminTotpSetup(setupCode.trim());
      setSetupNotice(`${res.message}`);
      setIsSetupOpen(false);
    } catch (err) {
      setSetupNotice(errorMessage(err));
    }
  };

  const handleDownloadMasterCSV = () => {
    window.open(getMasterClubsExportUrl(), '_blank');
  };

  const handlePrintReport = () => {
    window.print();
  };

  // State filtering from telemetry
  const stateRows = useMemo(() => {
    const list = telemetry?.states ?? [];
    if (!effectiveZone || effectiveZone === 'ALL') return list;
    return list.filter((s) => normalizeZoneName(s.zone).toUpperCase() === normalizeZoneName(effectiveZone).toUpperCase());
  }, [telemetry?.states, effectiveZone]);

  const stateTotals = useMemo(() => {
    return {
      institutions: stateRows.reduce((acc, s) => acc + (s.institutions || 0), 0),
      clubs: stateRows.reduce((acc, s) => acc + (s.clubs || 0), 0),
      members: stateRows.reduce((acc, s) => acc + (s.members || 0), 0),
    };
  }, [stateRows]);

  // Telemetrics calculations
  const totalClubs = dashboard?.total_clubs ?? 0;
  const totalActivities = dashboard?.total_activities ?? 0;
  const activeOfficers = dashboard?.active_officers ?? 7;
  const attentionCount = renewalAttention?.total_attention_count ?? (dashboard?.renewal_attention ?? 0);
  const overdueCount = renewalAttention?.overdue_count ?? 0;
  const expiringCount = renewalAttention?.expiring_soon_count ?? 0;
  const escalations30d = dashboard?.escalations_30d ?? 0;

  // National State Coverage
  const representedStatesCount = stateRows.filter((s) => (s.clubs || 0) > 0).length;
  const totalStatesCount = stateRows.length || 36;
  const coveragePercentage = totalStatesCount > 0 ? Math.round((representedStatesCount / totalStatesCount) * 100) : 0;
  const deficitStatesCount = Math.max(0, totalStatesCount - representedStatesCount);

  // Club Retention Rate
  const retentionRate = totalClubs > 0 ? Math.round(((totalClubs - overdueCount) / totalClubs) * 100) : 100;
  const activeValidityCount = Math.max(0, totalClubs - overdueCount);

  // Support Density Ratio
  const supportDensity = totalClubs > 0 ? (totalActivities / totalClubs).toFixed(1) : '0.0';

  // Leading Regional Zone
  const zoneClubCounts = useMemo(() => {
    const map: Record<string, number> = {
      North: 0,
      Central: 0,
      West: 0,
      East: 0,
      'North East': 0,
      South: 0,
    };
    (telemetry?.states ?? []).forEach((st) => {
      const z = normalizeZoneName(st.zone);
      if (map[z] !== undefined) {
        map[z] += st.clubs || 0;
      }
    });
    return map;
  }, [telemetry?.states]);

  const leadingZoneInfo = useMemo(() => {
    let topZ = 'North';
    let maxC = -1;
    for (const [z, c] of Object.entries(zoneClubCounts)) {
      if (c > maxC) {
        maxC = c;
        topZ = z;
      }
    }
    const share = totalClubs > 0 ? Math.round((maxC / totalClubs) * 100) : 0;
    return { zone: topZ, count: maxC, share };
  }, [zoneClubCounts, totalClubs]);

  // SEC A Support activities split from single source of truth
  const supportSplit = useMemo(() => {
    const bk = dashboard?.support_type_breakdown;
    if (bk && (bk.phone_remote || bk.os_tickets || bk.online_training || bk.offline_training)) {
      const phone = Number(bk.phone_remote || 0);
      const tickets = Number(bk.os_tickets || 0);
      const online = Number(bk.online_training || 0);
      const offline = Number(bk.offline_training || 0);
      const sum = phone + tickets + online + offline || 1;
      return {
        phoneCalls: { count: phone, pct: Math.round((phone / sum) * 100) },
        ticketsClosed: { count: tickets, pct: Math.round((tickets / sum) * 100) },
        onlineTraining: { count: online, pct: Math.round((online / sum) * 100) },
        offlineTraining: { count: offline, pct: Math.round((offline / sum) * 100) },
        total: sum,
      };
    }
    const offs = ratings?.officers ?? [];
    let phoneCalls = 0;
    let ticketsClosed = 0;
    let onlineTraining = 0;
    let offlineTraining = 0;

    offs.forEach((o) => {
      phoneCalls += Number(o.phone_calls ?? o.calls_made ?? o.calls ?? 0);
      ticketsClosed += Number(o.tickets_closed ?? o.emails_sent ?? o.emails ?? 0);
      onlineTraining += Number(o.online_training ?? 0);
      offlineTraining += Number(o.offline_training ?? 0);
    });

    const sum = phoneCalls + ticketsClosed + onlineTraining + offlineTraining || 1;
    return {
      phoneCalls: { count: phoneCalls, pct: Math.round((phoneCalls / sum) * 100) },
      ticketsClosed: { count: ticketsClosed, pct: Math.round((ticketsClosed / sum) * 100) },
      onlineTraining: { count: onlineTraining, pct: Math.round((onlineTraining / sum) * 100) },
      offlineTraining: { count: offlineTraining, pct: Math.round((offlineTraining / sum) * 100) },
      total: sum,
    };
  }, [dashboard?.support_type_breakdown, ratings?.officers]);

  // Filtered attention clubs
  const attentionRows = useMemo(() => {
    const all = renewalAttention?.results ?? [];
    return all.filter((row) => {
      if (attentionFilter === 'Overdue' && row.attention_type !== 'Overdue') return false;
      if (attentionFilter === 'Expiring Soon' && row.attention_type !== 'Expiring Soon') return false;
      if (!attentionSearchQuery.trim()) return true;
      const q = attentionSearchQuery.toLowerCase().trim();
      return (
        (row.club_code || '').toLowerCase().includes(q) ||
        (row.institution_name || '').toLowerCase().includes(q) ||
        (row.state || '').toLowerCase().includes(q) ||
        (row.zone || '').toLowerCase().includes(q)
      );
    });
  }, [renewalAttention?.results, attentionFilter, attentionSearchQuery]);

  // Filtered clubs in Club Register
  const filteredClubs = useMemo(() => {
    return clubsList.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        (c.registration_no || '').toLowerCase().includes(q) ||
        (c.institution_name || '').toLowerCase().includes(q) ||
        (c.state || '').toLowerCase().includes(q) ||
        (c.zone || '').toLowerCase().includes(q) ||
        (c.status || '').toLowerCase().includes(q)
      );
    });
  }, [clubsList, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* =====================================================================
          1. TOP FILTER BAR (Analytics & Geographic Scope)
          ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2ECE7] shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-bold text-[#103125] text-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-[#0D7751]" />
            <span>Analytics &amp; Geographic Scope:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#5A7366] shrink-0">Filter by Zone:</label>
            <select
              value={selectedZoneScope}
              onChange={(e) => setSelectedZoneScope(e.target.value)}
              className="text-xs font-bold text-[#103125] bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl px-3 py-1.5 focus:border-[#0D7751] focus:outline-hidden"
            >
              <option value="ALL">All Operational Zones (6)</option>
              <option value="North">North Zone</option>
              <option value="Central">Central Zone</option>
              <option value="West">West Zone</option>
              <option value="East">East Zone</option>
              <option value="North East">North East Zone</option>
              <option value="South">South Zone</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#5A7366] shrink-0">Filter by Year:</label>
            <select
              value={selectedYearScope}
              onChange={(e) => setSelectedYearScope(e.target.value)}
              className="text-xs font-bold text-[#103125] bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl px-3 py-1.5 focus:border-[#0D7751] focus:outline-hidden"
            >
              <option value="ALL">All Inception Years</option>
              <option value="2026">2026 (Current Cycle)</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => void loadData()}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
            title="Refresh all live analytics and metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Metrics ↻</span>
          </button>

          <a
            href="/api/download/user-manual"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Download Official NDLI User Manual (PDF)"
          >
            <span>📖</span>
            <span>User Manual (PDF)</span>
          </a>

          <button
            type="button"
            onClick={handleDownloadMasterCSV}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B45309] hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
            title="Download enriched master_clubs.csv database copy"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Master CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#103125] hover:bg-[#1a503e] text-white flex items-center gap-1.5 shadow-xs transition-colors"
            title="Create / print official comprehensive administrative report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Create Report</span>
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

      {/* =====================================================================
          2. TOP 5 ZERO-JARGON KPI CARDS
          ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label={t('Total NDLI Clubs')}
          value={dashboard ? dashboard.total_clubs : '—'}
          desc={t('Across all 36 States & UTs (Click to inspect)')}
          badge={dashboard ? `${dashboard.total_clubs} Canonical` : t('Live')}
          icon={<Building2 className="w-5 h-5" />}
          variant="green"
          clickable={true}
          onClick={openClubRegister}
        />

        <StatCard
          label={t('Daily Support Logs')}
          value={dashboard ? dashboard.total_activities : '—'}
          desc={t('Real-time sync from 6 regional operational zones')}
          badge={t('Live Activity')}
          icon={<PhoneCall className="w-5 h-5" />}
          variant="purple"
        />

        <StatCard
          label={t('Active Nodal Officers')}
          value={dashboard ? dashboard.active_officers : '7'}
          desc={t('Dedicated Nodal Officers across 6 National Zones')}
          badge={t('6 Zones Active')}
          icon={<Users className="w-5 h-5" />}
          variant="blue"
        />

        <StatCard
          label={t('Renewal Attention')}
          value={attentionCount}
          desc={t('Overdue / Expiring soon within 90 days')}
          badge={t('Attention Required')}
          icon={<Calendar className="w-5 h-5" />}
          variant="amber"
          clickable={true}
          onClick={() => openRenewalAttentionModal('ALL')}
        />

        <StatCard
          label={t('30-Day Escalations')}
          value={escalations30d}
          desc={t('Unresolved 30+ days tickets under SLA monitor')}
          badge={t('SLA Monitor')}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="rose"
          clickable={true}
          onClick={openEscalationsModal}
        />
      </div>

      {/* =====================================================================
          3. STATISTICAL ANALYTICS HIGHLIGHT METRICS (4 CARDS)
          ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Coverage Index Card */}
        <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-sky-100 text-sky-700">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
              {representedStatesCount} / {totalStatesCount} States
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#5A7366] uppercase tracking-wider">
              National State Coverage
            </div>
            <div className="text-2xl font-extrabold text-[#103125] mt-1">
              {coveragePercentage}%
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              {deficitStatesCount} States/UTs in deficit nationally
            </div>
          </div>
        </div>

        {/* Retention Rate Card */}
        <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Active Cycle
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#5A7366] uppercase tracking-wider">
              Club Retention Rate
            </div>
            <div className="text-2xl font-extrabold text-[#103125] mt-1">
              {retentionRate}%
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              {activeValidityCount} active, {overdueCount} overdue clubs
            </div>
          </div>
        </div>

        {/* Support Density Ratio Card */}
        <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              Logs / Club
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#5A7366] uppercase tracking-wider">
              Support Density Ratio
            </div>
            <div className="text-2xl font-extrabold text-[#103125] mt-1">
              {supportDensity}
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              Average support logs per approved club
            </div>
          </div>
        </div>

        {/* Leading Regional Zone Card */}
        <div className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <Award className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#103125] text-white">
              Top Volume
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#5A7366] uppercase tracking-wider">
              Leading Regional Zone
            </div>
            <div className="text-2xl font-extrabold text-[#103125] mt-1">
              {leadingZoneInfo.zone} Zone
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              {leadingZoneInfo.count} approved clubs ({leadingZoneInfo.share}% share)
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. STRATEGIC MODERN INFOGRAPHICS GRID (2x2)
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Infographic 1: Zone-Wise Club Share Donut Chart */}
        <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
            <div>
              <h4 className="text-base font-extrabold text-[#103125]">
                Zone-Wise Club Share
              </h4>
              <p className="text-xs text-[#5A7366]">
                Proportional distribution across 6 operational zonal commands
              </p>
            </div>
            <span className="text-[11px] font-bold text-[#0D7751] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Donut Infographic
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-2">
            {/* Donut SVG */}
            <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 190 190">
                <defs>
                  <linearGradient id="donutGrad0" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0D7751" />
                    <stop offset="100%" stopColor="#3BCB98" />
                  </linearGradient>
                  <linearGradient id="donutGrad1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1E5F8C" />
                    <stop offset="100%" stopColor="#55A9DC" />
                  </linearGradient>
                  <linearGradient id="donutGrad2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#F2B255" />
                  </linearGradient>
                  <linearGradient id="donutGrad3" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#B79CF8" />
                  </linearGradient>
                  <linearGradient id="donutGrad4" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#BE123C" />
                    <stop offset="100%" stopColor="#EC6A80" />
                  </linearGradient>
                  <linearGradient id="donutGrad5" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#647B70" />
                    <stop offset="100%" stopColor="#93A89D" />
                  </linearGradient>
                </defs>
                <circle cx="95" cy="95" r="70" fill="transparent" stroke="#EAF2ED" strokeWidth="24" />
                {(() => {
                  const circumference = 2 * Math.PI * 70;
                  const entries = Object.entries(zoneClubCounts).filter(([, val]) => val > 0);
                  const total = entries.reduce((a, b) => a + b[1], 0) || 1;
                  let acc = 0;
                  return entries.map(([name, val], idx) => {
                    const pct = val / total;
                    const strokeDash = pct * circumference;
                    const offset = -acc;
                    acc += strokeDash;
                    const dash = Math.max(strokeDash - 4, 1);
                    return (
                      <circle
                        key={name}
                        cx="95"
                        cy="95"
                        r="70"
                        fill="transparent"
                        stroke={`url(#donutGrad${idx % 6})`}
                        strokeWidth="24"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={offset}
                        className="transition-all duration-500"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-2xl font-black text-[#103125]">{totalClubs}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Clubs</span>
              </div>
            </div>

            {/* Donut Legend */}
            <div className="w-full sm:w-56 space-y-2 text-xs">
              {Object.entries(zoneClubCounts).map(([zone, count], idx) => {
                const colors = ['#0D7751', '#1E5F8C', '#D97706', '#8B5CF6', '#BE123C', '#647B70'];
                const pct = totalClubs > 0 ? Math.round((count / totalClubs) * 100) : 0;
                return (
                  <div key={zone} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: colors[idx % colors.length] }}
                        />
                        {zone}
                      </span>
                      <span className="font-mono font-bold text-slate-700">
                        {count} <span className="text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: colors[idx % colors.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Infographic 2: Monthly Registration Trajectory Area Chart */}
        <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
            <div>
              <h4 className="text-base font-extrabold text-[#103125]">
                Monthly Registration Trajectory
              </h4>
              <p className="text-xs text-[#5A7366]">
                Momentum curve and velocity of new NDLI club approvals
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Growth Curve
            </span>
          </div>

          <div className="w-full pt-3">
            <svg viewBox="0 0 500 180" className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="trajAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0D7751" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#0D7751" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="trajLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0D7751" />
                  <stop offset="100%" stopColor="#57C7A0" />
                </linearGradient>
              </defs>
              {/* Soft dashed horizontal grids */}
              <line x1="14" y1="45" x2="486" y2="45" stroke="#DCE9E2" strokeWidth="1" strokeDasharray="4 6" />
              <line x1="14" y1="85" x2="486" y2="85" stroke="#DCE9E2" strokeWidth="1" strokeDasharray="4 6" />
              <line x1="14" y1="125" x2="486" y2="125" stroke="#DCE9E2" strokeWidth="1" strokeDasharray="4 6" />
              <line x1="14" y1="150" x2="486" y2="150" stroke="#C9DED4" strokeWidth="1.5" />

              {/* Area path & smooth line */}
              <path
                d="M 14,142 C 70,138 120,130 170,115 C 230,98 290,82 350,60 C 410,40 450,28 486,22 L 486,150 L 14,150 Z"
                fill="url(#trajAreaGrad)"
              />
              <path
                d="M 14,142 C 70,138 120,130 170,115 C 230,98 290,82 350,60 C 410,40 450,28 486,22"
                fill="none"
                stroke="url(#trajLineGrad)"
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.2"
              />
              <path
                d="M 14,142 C 70,138 120,130 170,115 C 230,98 290,82 350,60 C 410,40 450,28 486,22"
                fill="none"
                stroke="url(#trajLineGrad)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Data points */}
              {[
                { x: 14, y: 142, label: 'Nov', val: 1 },
                { x: 110, y: 130, label: 'Jan', val: 2 },
                { x: 200, y: 108, label: 'Mar', val: 4 },
                { x: 290, y: 82, label: 'May', val: 6 },
                { x: 380, y: 52, label: 'Jul', val: 8 },
                { x: 486, y: 22, label: 'Oct', val: totalClubs },
              ].map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5.5"
                    fill="#ffffff"
                    stroke="#0D7751"
                    strokeWidth="3"
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    fontSize="11"
                    fontWeight="700"
                    fill="#103125"
                    textAnchor="middle"
                  >
                    {pt.val}
                  </text>
                  <text
                    x={pt.x}
                    y="170"
                    fontSize="10"
                    fontWeight="700"
                    fill="#64748b"
                    textAnchor="middle"
                  >
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Infographic 3: SEC A: Support Activity Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
            <div>
              <h4 className="text-base font-extrabold text-[#103125]">
                SEC A: Support Activity Breakdown
              </h4>
              <p className="text-xs text-[#5A7366]">
                Volume distribution across the 4 official operational support categories
              </p>
            </div>
            <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
              SEC A Metrics
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg">📞</span>
                <span className="text-xs font-bold text-emerald-800">{supportSplit.phoneCalls.pct}%</span>
              </div>
              <div className="text-xs font-bold text-[#103125]">Phone &amp; Remote Assistance</div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-[#103125]">{supportSplit.phoneCalls.count}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Calls Made</span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200/50 rounded-full overflow-hidden">
                <div className="h-full bg-[#0D7751] rounded-full" style={{ width: `${supportSplit.phoneCalls.pct}%` }} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg">🎫</span>
                <span className="text-xs font-bold text-sky-800">{supportSplit.ticketsClosed.pct}%</span>
              </div>
              <div className="text-xs font-bold text-[#103125]">OS Ticket Resolutions</div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-[#103125]">{supportSplit.ticketsClosed.count}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Tickets Closed</span>
              </div>
              <div className="w-full h-1.5 bg-sky-200/50 rounded-full overflow-hidden">
                <div className="h-full bg-[#1E5F8C] rounded-full" style={{ width: `${supportSplit.ticketsClosed.pct}%` }} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg">💻</span>
                <span className="text-xs font-bold text-purple-800">{supportSplit.onlineTraining.pct}%</span>
              </div>
              <div className="text-xs font-bold text-[#103125]">Online Workshops / Webinars</div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-[#103125]">{supportSplit.onlineTraining.count}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Sessions Run</span>
              </div>
              <div className="w-full h-1.5 bg-purple-200/50 rounded-full overflow-hidden">
                <div className="h-full bg-[#8B5CF6] rounded-full" style={{ width: `${supportSplit.onlineTraining.pct}%` }} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg">🏫</span>
                <span className="text-xs font-bold text-amber-800">{supportSplit.offlineTraining.pct}%</span>
              </div>
              <div className="text-xs font-bold text-[#103125]">On-Premises / Offline Training</div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-[#103125]">{supportSplit.offlineTraining.count}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Visits Completed</span>
              </div>
              <div className="w-full h-1.5 bg-amber-200/50 rounded-full overflow-hidden">
                <div className="h-full bg-[#D97706] rounded-full" style={{ width: `${supportSplit.offlineTraining.pct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Infographic 4: Club Renewal & Retention Health Gauge */}
        <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
            <div>
              <h4 className="text-base font-extrabold text-[#103125]">
                Club Renewal &amp; Retention Health
              </h4>
              <p className="text-xs text-[#5A7366]">
                1-Year Registration lifecycle status and attention tracking
              </p>
            </div>
            <button
              type="button"
              onClick={() => openRenewalAttentionModal('ALL')}
              className="text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
            >
              <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
              <span>Attention Center</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* Donut SVG Ring */}
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r="54" fill="transparent" stroke="#EDF3F0" strokeWidth="18" />
                {(() => {
                  const circumference = 2 * Math.PI * 54;
                  const actVal = activeValidityCount;
                  const expVal = expiringCount;
                  const ovdVal = overdueCount;
                  const tot = actVal + expVal + ovdVal || 1;

                  const p1 = (actVal / tot) * circumference;
                  const p2 = (expVal / tot) * circumference;
                  const p3 = (ovdVal / tot) * circumference;

                  return (
                    <>
                      <circle
                        cx="75"
                        cy="75"
                        r="54"
                        fill="transparent"
                        stroke="#17A273"
                        strokeWidth="18"
                        strokeDasharray={`${Math.max(p1 - 3, 1)} ${circumference}`}
                        strokeDashoffset="0"
                      />
                      <circle
                        cx="75"
                        cy="75"
                        r="54"
                        fill="transparent"
                        stroke="#E9A23B"
                        strokeWidth="18"
                        strokeDasharray={`${Math.max(p2 - 3, 1)} ${circumference}`}
                        strokeDashoffset={-p1}
                      />
                      <circle
                        cx="75"
                        cy="75"
                        r="54"
                        fill="transparent"
                        stroke="#BE123C"
                        strokeWidth="18"
                        strokeDasharray={`${Math.max(p3 - 3, 1)} ${circumference}`}
                        strokeDashoffset={-(p1 + p2)}
                      />
                    </>
                  );
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-xl font-black text-[#103125]">{totalClubs}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Clubs</span>
              </div>
            </div>

            {/* Scale Bar & Indicators */}
            <div className="grow space-y-3 w-full text-xs">
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-[#103125]">Color Scale Spectrum</span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {activeValidityCount} / {totalClubs} Active Validity
                </span>
              </div>

              {/* Stacked Bar */}
              <div className="w-full h-3 bg-slate-100 rounded-full flex overflow-hidden">
                <div
                  className="bg-[#17A273] h-full"
                  style={{ width: `${totalClubs > 0 ? (activeValidityCount / totalClubs) * 100 : 100}%` }}
                  title={`Active Validity: ${activeValidityCount}`}
                />
                <div
                  className="bg-[#E9A23B] h-full"
                  style={{ width: `${totalClubs > 0 ? (expiringCount / totalClubs) * 100 : 0}%` }}
                  title={`Expiring Soon: ${expiringCount}`}
                />
                <div
                  className="bg-[#BE123C] h-full"
                  style={{ width: `${totalClubs > 0 ? (overdueCount / totalClubs) * 100 : 0}%` }}
                  title={`Overdue: ${overdueCount}`}
                />
              </div>

              {/* Legend Row */}
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#17A273] inline-block" />
                  Active: <strong>{activeValidityCount}</strong>
                </span>
                <span className="flex items-center gap-1 text-slate-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E9A23B] inline-block" />
                  Expiring: <strong>{expiringCount}</strong>
                </span>
                <span className="flex items-center gap-1 text-slate-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#BE123C] inline-block" />
                  Overdue: <strong>{overdueCount}</strong>
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <span className="text-slate-500 font-semibold">
                  Retention Rate: <strong className="text-[#0D7751] text-sm">{retentionRate}%</strong>
                </span>
                <button
                  type="button"
                  onClick={() => openRenewalAttentionModal('ALL')}
                  className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1"
                >
                  <span>⚡ Inspect Attention ({attentionCount}) →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          5. NATIONAL STATE-WISE PENETRATION & DENSITY ROSTER
          ===================================================================== */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#E2ECE7] pb-4">
          <div>
            <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0D7751]" />
              National State-Wise Penetration &amp; Density Roster
            </h4>
            <p className="text-xs text-[#5A7366]">
              All 36 Indian States and Union Territories with color-gradient density indicators
            </p>
          </div>
          <span className="text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] px-3 py-1 rounded-full border border-[#E2ECE7]">
            {stateRows.length} Divisions Displayed
          </span>
        </div>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px] sticky top-0 z-10 shadow-2xs">
              <tr>
                <th className="p-3 w-12">#</th>
                <th className="p-3">State / Union Territory</th>
                <th className="p-3 text-center">Zone</th>
                <th className="p-3 text-center">Clubs</th>
                <th className="p-3">Density &amp; Share %</th>
                <th className="p-3 text-center">Penetration Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {stateRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#5A7366]">
                    {loading ? 'Loading telemetry…' : 'No divisional records found.'}
                  </td>
                </tr>
              ) : (
                stateRows.map((s, idx) => {
                  const count = s.clubs || 0;
                  const sharePct = totalClubs > 0 ? Math.round((count / totalClubs) * 100) : 0;
                  let statusBadge = (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      Deficit (0 clubs)
                    </span>
                  );
                  if (count >= 4) {
                    statusBadge = (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        High Density
                      </span>
                    );
                  } else if (count >= 2) {
                    statusBadge = (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                        Moderate Density
                      </span>
                    );
                  } else if (count === 1) {
                    statusBadge = (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Initial Presence
                      </span>
                    );
                  }

                  return (
                    <tr key={s.code} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3 font-mono text-[#5A7366]">{idx + 1}</td>
                      <td className="p-3 font-semibold text-[#103125]">
                        {s.name}{' '}
                        <span className="font-mono text-[10px] text-[#5A7366]">
                          ({s.code})
                        </span>
                      </td>
                      <td className="p-3 text-center font-medium text-[#2E4A3E]">
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-bold text-[10px]">
                          {s.zone || 'Central'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-[#103125]">
                        {count}
                      </td>
                      <td className="p-3 w-48">
                        <div className="flex items-center gap-2">
                          <div className="grow h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0D7751] rounded-full"
                              style={{ width: `${Math.min(100, sharePct * 3)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 w-8 text-right">
                            {sharePct}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-center">{statusBadge}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {stateRows.length > 0 && (
              <tfoot className="bg-[#E9F5EF] text-[#103125] font-extrabold border-t-2 border-[#BFE3D2] sticky bottom-0 z-10">
                <tr>
                  <td colSpan={3} className="p-3 text-right uppercase text-[11px]">
                    National Total:
                  </td>
                  <td className="p-3 text-center font-mono">{stateTotals.clubs}</td>
                  <td colSpan={2} className="p-3 font-mono text-emerald-800 text-right">
                    {stateTotals.members.toLocaleString()} Active Members
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* =====================================================================
          6. REGIONAL OFFICER PERFORMANCE EVALUATION & STAR RATING MATRIX
          ===================================================================== */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                Regional Officer Performance Matrix
              </h4>
              <button
                type="button"
                onClick={() => setIsFormulaModalOpen(true)}
                className="p-1 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                title="View Scoring &amp; Ranking Methodology"
                aria-label="View Scoring Methodology"
              >
                <Info className="w-4 h-4 text-slate-500 hover:text-slate-800" />
              </button>
              <span className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Ranked 1 to 5 Stars ★
              </span>
            </div>
          </div>

          {/* Performance Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Year</label>
              <select
                value={perfYear}
                onChange={(e) => setPerfYear(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl px-2.5 py-1 focus:outline-hidden"
              >
                <option value="ALL">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Month</label>
              <select
                value={perfMonth}
                onChange={(e) => setPerfMonth(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl px-2.5 py-1 focus:outline-hidden"
              >
                <option value="ALL">All Months</option>
                <option value="1">January</option>
                <option value="2">February</option>
                <option value="3">March</option>
                <option value="4">April</option>
                <option value="5">May</option>
                <option value="6">June</option>
                <option value="7">July</option>
                <option value="8">August</option>
                <option value="9">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setPerfYear('ALL');
                setPerfMonth('ALL');
                setPerfState('ALL');
              }}
              className="mt-3.5 px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              title="Reset performance matrix filters"
            >
              Reset ↺
            </button>
          </div>
        </div>

        {/* Performance Scorecard Matrix Table */}
        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3 text-center w-12">Rank</th>
                <th className="p-3">Officer &amp; Zone</th>
                <th className="p-3">Assigned Jurisdiction</th>
                <th className="p-3 text-center">Clubs Appr.<br /><span className="text-[10px] text-emerald-700 font-bold">[Score]</span></th>
                <th className="p-3 text-center">Online Tr.<br /><span className="text-[10px] text-purple-700 font-bold">[Score]</span></th>
                <th className="p-3 text-center">Offline Tr.<br /><span className="text-[10px] text-amber-700 font-bold">[Score]</span></th>
                <th className="p-3 text-center">Other Supp.<br /><span className="text-[10px] text-sky-700 font-bold">[Score]</span></th>
                <th className="p-3 text-center">Total<br /><span className="text-[10px] text-emerald-800 font-bold">Score</span></th>
                <th className="p-3 text-center">Star Rating<br /><span className="text-[10px] text-amber-700 font-bold">(1 to 5 ★)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {(ratings?.officers.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#5A7366]">
                    {loading ? 'Evaluating officer performance matrix…' : 'No officer evaluations found.'}
                  </td>
                </tr>
              ) : (
                ratings?.officers.map((o: OfficerEvaluation, idx: number) => {
                  const rank = o.rank ?? (idx + 1);
                  let rankDisplay: React.ReactNode = (
                    <span className="font-bold text-slate-500 font-mono">#{rank}</span>
                  );
                  if (rank === 1) rankDisplay = <span className="text-lg" title="Rank 1 - Top Performer">🥇</span>;
                  else if (rank === 2) rankDisplay = <span className="text-lg" title="Rank 2">🥈</span>;
                  else if (rank === 3) rankDisplay = <span className="text-lg" title="Rank 3">🥉</span>;

                  const starsCount = typeof o.stars === 'number' ? o.stars : 1.0;
                  const fullStars = Math.floor(starsCount);
                  const hasHalf = (starsCount % 1.0) !== 0;
                  const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0));

                  const scoreVal = typeof o.weighted_score === 'number'
                    ? o.weighted_score.toFixed(1)
                    : typeof o.score === 'number'
                    ? o.score.toFixed(1)
                    : String(o.weighted_score ?? o.score ?? '—');

                  return (
                    <tr key={String(o.emp_id ?? o.officer_id)} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3 text-center align-middle">{rankDisplay}</td>
                      <td className="p-3 align-middle">
                        <div className="font-extrabold text-[#103125] text-sm">
                          {o.officer_name || o.full_name || o.officer || o.name || 'Officer'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-[#103125] text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {o.emp_id || o.officer_id}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {o.zone || 'Central'} Zone
                          </span>
                        </div>
                      </td>
                      <td className="p-3 align-middle text-slate-600 text-[11px] max-w-xs leading-relaxed">
                        {o.assigned_jurisdiction || (o.assigned_states ? o.assigned_states.join(', ') : 'All India')}
                      </td>
                      <td className="p-3 text-center align-middle font-mono font-bold text-emerald-800">
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                          <span>{o.clubs_approved ?? 0}</span>
                          {o.score_clubs_approved !== undefined && (
                            <span className="text-[10px] text-emerald-600 font-normal font-sans">[{o.score_clubs_approved}]</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center align-middle font-mono font-bold text-purple-800">
                        <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200 inline-flex items-center gap-1">
                          <span>{o.online_training ?? 0}</span>
                          {o.score_online_training !== undefined && (
                            <span className="text-[10px] text-purple-600 font-normal font-sans">[{o.score_online_training}]</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center align-middle font-mono font-bold text-amber-800">
                        <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 inline-flex items-center gap-1">
                          <span>{o.offline_training ?? 0}</span>
                          {o.score_offline_training !== undefined && (
                            <span className="text-[10px] text-amber-600 font-normal font-sans">[{o.score_offline_training}]</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center align-middle font-mono font-bold text-sky-800">
                        <span className="bg-sky-50 text-sky-800 px-2 py-0.5 rounded-full border border-sky-200 inline-flex items-center gap-1">
                          <span>{o.other_supports ?? 0}</span>
                          {o.score_other_supports !== undefined && (
                            <span className="text-[10px] text-sky-600 font-normal font-sans">[{o.score_other_supports}]</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center align-middle font-mono font-extrabold text-emerald-900">
                        <span className="bg-emerald-100 text-emerald-950 px-2.5 py-1 rounded-xl border border-emerald-300">
                          {scoreVal}
                        </span>
                      </td>
                      <td className="p-3 text-center align-middle">
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-amber-500 text-sm tracking-wider font-bold">
                            {'★'.repeat(fullStars)}
                            {hasHalf ? '½' : ''}
                            <span className="text-slate-300 font-normal">{'☆'.repeat(emptyStars)}</span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {o.rating_label || `${starsCount.toFixed(1)} / 5.0`}
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

          {/* Contribution Share Ribbon */}
          {(() => {
            const offs = ratings?.officers ?? [];
            const grandTotal = offs.reduce((acc, o) => acc + (o.total_activities || 1), 0) || 1;
            const shades = [
              'bg-[#0D7751]',
              'bg-[#1E5F8C]',
              'bg-[#D97706]',
              'bg-[#8B5CF6]',
              'bg-[#BE123C]',
              'bg-[#2FA97B]',
              'bg-[#4B9BC9]',
            ];
            return (
              <div className="space-y-1.5">
                <div className="w-full h-4 rounded-xl overflow-hidden flex shadow-2xs">
                  {offs.map((o, i) => {
                    const share = ((o.total_activities || 1) / grandTotal) * 100;
                    return (
                      <div
                        key={String(o.emp_id ?? i)}
                        className={`${shades[i % shades.length]} h-full transition-all duration-300 relative group flex items-center justify-center text-[9px] font-bold text-white`}
                        style={{ width: `${share}%` }}
                        title={`${o.officer_name || o.emp_id}: ${o.total_activities || 0} activities (${share.toFixed(1)}%)`}
                      >
                        {share >= 10 && `${o.emp_id || (o.officer_name || '').split(' ')[0]}`}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-400 text-right">
                  Total recorded activities: <strong>{totalActivities}</strong> across all regional commands
                </div>
              </div>
            );
          })()}
      </div>



      {/* Scoring Methodology Info Modal */}
      {isFormulaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#E2ECE7] shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#103125]">Employee Ranking Calculation Methodology</h3>
                  <p className="text-xs text-[#5A7366]">6-Step Weighted Rubric with Zone Difficulty Adjustments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormulaModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-[#17332A] leading-relaxed">
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] space-y-2">
                <div className="font-bold text-sm text-[#103125]">Step 1: Normalized Weights (Total = 110)</div>
                <p className="text-slate-600">Raw weights are divided by 110 (w’ = w / 110) to obtain normalized weights:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white border border-[#E2ECE7]">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase">Club Approval</div>
                    <div className="text-sm font-extrabold font-mono text-slate-800">wA = 0.4545</div>
                    <div className="text-[10px] text-slate-500">(50 / 110)</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#E2ECE7]">
                    <div className="text-[10px] font-bold text-sky-700 uppercase">Other Support</div>
                    <div className="text-sm font-extrabold font-mono text-slate-800">wS = 0.2727</div>
                    <div className="text-[10px] text-slate-500">(30 / 110)</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#E2ECE7]">
                    <div className="text-[10px] font-bold text-amber-700 uppercase">Offline Training</div>
                    <div className="text-sm font-extrabold font-mono text-slate-800">wF = 0.1818</div>
                    <div className="text-[10px] text-slate-500">(20 / 110)</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#E2ECE7]">
                    <div className="text-[10px] font-bold text-purple-700 uppercase">Online Training</div>
                    <div className="text-sm font-extrabold font-mono text-slate-800">wO = 0.0909</div>
                    <div className="text-[10px] text-slate-500">(10 / 110)</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] space-y-2">
                <div className="font-bold text-sm text-[#103125]">Step 2: Zone Difficulty Multipliers</div>
                <p className="text-slate-600">Officers deployed to geographically challenging North and North-East (NNE) regions receive difficulty multipliers due to higher logistical barriers:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  <li><strong>North &amp; North-East Zone:</strong> Club Approval <strong>×1.40</strong>; Other Supports, Offline Training, Online Training <strong>×1.25</strong>.</li>
                  <li><strong>Other Zones (East, West, Central, South):</strong> all factors <strong>×1.00</strong>.</li>
                  <li><em>Adjusted Count = Raw Count × Multiplier</em> (A* = A × mA, S* = S × mS, etc.).</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] space-y-2">
                <div className="font-bold text-sm text-[#103125]">Step 3 &amp; 4: Task Scores (0–100) &amp; Total Weighted Score</div>
                <p className="text-slate-600">Each task is scored relatively against the highest adjusted count among all officers:</p>
                <code className="block p-2.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px]">
                  Score_task = (Adjusted count ÷ highest adjusted count among team) × 100
                </code>
                <p className="text-slate-600 pt-1">Total score is the weighted sum (0 to 100):</p>
                <code className="block p-2.5 rounded-xl bg-slate-900 text-amber-300 font-mono text-[11px]">
                  Total = wA·Score_A + wS·Score_S + wF·Score_F + wO·Score_O
                </code>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2ECE7] space-y-2">
                <div className="font-bold text-sm text-[#103125]">Step 5 &amp; 6: 5-Star Rating &amp; Ranking</div>
                <p className="text-slate-600">Stars = Total ÷ 20, rounded to the nearest 0.5, with minimum 1.0:</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center pt-1 font-mono">
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] text-emerald-800 font-bold">90–100</div>
                    <div className="font-bold text-amber-600">5.0 ★</div>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] text-emerald-800 font-bold">80–89.9</div>
                    <div className="font-bold text-amber-600">4.0–4.5 ★</div>
                  </div>
                  <div className="p-2 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-[10px] text-blue-800 font-bold">60–79.9</div>
                    <div className="font-bold text-amber-600">3.0–3.5 ★</div>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-[10px] text-amber-800 font-bold">40–59.9</div>
                    <div className="font-bold text-amber-600">2.0–2.5 ★</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                    <div className="text-[10px] text-slate-800 font-bold">&lt; 40</div>
                    <div className="font-bold text-amber-600">1.0–1.5 ★</div>
                  </div>
                </div>
                <p className="text-slate-500 text-[11px] pt-1">
                  <em>Ties are broken by Clubs Approved first, then by Other Supports.</em>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="font-bold text-emerald-950">Worked Example (NNE Officer)</div>
                <p className="text-emerald-900 text-[11px]">
                  Raw inputs: Approved 18, Support 120, Offline 4, Online 6.<br />
                  Adjusted (NNE factors): 25.2 / 150 / 5 / 7.5.<br />
                  Against team maxima (30 / 160 / 6 / 10): Task scores = 84 / 93.75 / 83.33 / 75.<br />
                  Total = (0.4545 × 84) + (0.2727 × 93.75) + (0.1818 × 83.33) + (0.0909 × 75) = <strong>85.7</strong>.<br />
                  Stars = 85.7 ÷ 20 = 4.29 → rounded to nearest 0.5 = <strong>4.5 ★</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#E2ECE7]">
              <button
                type="button"
                onClick={() => setIsFormulaModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#103125] text-white font-bold text-xs hover:bg-[#103125]/90 transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: RENEWAL ATTENTION LIST MODAL (Opens on clicking Renewal Attention KPI)
          ===================================================================== */}
      {isAttentionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    Admin Action Required
                  </span>
                  <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                    {overdueCount} Overdue
                  </span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {expiringCount} Expiring Soon
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  <span>NDLI Clubs Requiring Renewal Attention</span>
                </h3>
                <p className="text-xs text-[#5A7366]">
                  Clubs that are past renewal validity or expiring within 90 days. Click any club row to view full properties.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAttentionModalOpen(false)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Filter buttons & search toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 shrink-0">
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 mr-1">Filter:</span>
                <button
                  type="button"
                  onClick={() => setAttentionFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    attentionFilter === 'ALL'
                      ? 'bg-[#103125] text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  All ({attentionCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAttentionFilter('Overdue')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    attentionFilter === 'Overdue'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  🔴 Overdue ({overdueCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAttentionFilter('Expiring Soon')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    attentionFilter === 'Expiring Soon'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  🟡 Expiring Soon ({expiringCount})
                </button>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="search"
                  value={attentionSearchQuery}
                  onChange={(e) => setAttentionSearchQuery(e.target.value)}
                  placeholder="Search by Club ID, Institution, State, Zone..."
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0D7751] bg-white"
                />
              </div>
            </div>

            {/* Attention Table */}
            <div className="overflow-y-auto grow border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-3">Club ID</th>
                    <th className="p-3">Institution Name</th>
                    <th className="p-3">State</th>
                    <th className="p-3">Zone</th>
                    <th className="p-3">Date of Approval</th>
                    <th className="p-3">Last Renewal</th>
                    <th className="p-3">Upcoming Renewal</th>
                    <th className="p-3">Days Overdue / Left</th>
                    <th className="p-3 text-center">Status Badge</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attentionRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        <Calendar className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                        <span>No clubs currently require renewal attention in this category.</span>
                      </td>
                    </tr>
                  ) : (
                    attentionRows.map((c) => {
                      const isOverdue = c.attention_type === 'Overdue';
                      return (
                        <tr
                          key={c.club_code}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => openClubDetailsFromCode(c.club_code)}
                        >
                          <td className="p-3 font-mono font-bold text-[#103125]">
                            <span className="bg-[#103125] text-white px-2 py-0.5 rounded text-[11px]">
                              {c.club_code}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-[#103125]">
                            {c.institution_name || c.club_name}
                          </td>
                          <td className="p-3 text-slate-700">{c.state || '—'}</td>
                          <td className="p-3">
                            <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px]">
                              {c.zone || c.zone_code || 'Central'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-600">
                            {formatStamp(c.date_of_approval || c.formation_date)}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-amber-800">
                            {formatStamp(c.last_renewal_date)}
                          </td>
                          <td className="p-3 font-mono text-[11px] font-bold text-emerald-800">
                            {formatStamp(c.upcoming_renewal_date || c.due_date)}
                          </td>
                          <td className="p-3 font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                isOverdue
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.badge_label || (isOverdue ? `${c.days_overdue || Math.abs(c.days_left)} days overdue` : `${c.days_left} days left`)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isOverdue
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isOverdue ? '🔴 Overdue' : '🟡 Expiring Soon'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openClubDetailsFromCode(c.club_code);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0D7751] hover:bg-[#0a5e40] text-white transition-colors shadow-2xs"
                            >
                              View Details ↗
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 shrink-0 border-t border-slate-100">
              <span>
                Showing <strong>{attentionRows.length}</strong> renewal attention records.
              </span>
              <button
                type="button"
                onClick={() => setIsAttentionModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CLUB REGISTER MODAL (Opens on clicking Total NDLI Clubs KPI)
          ===================================================================== */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[#103125] pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#0D7751]" />
                  <span>Club Register — All NDLI Clubs</span>
                </h3>
                <p className="text-xs text-[#5A7366]">
                  Search and open any canonical club's full properties and authorities contact record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Filter Input */}
            <div className="relative shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Club ID, Reg No, Institution, State, Zone, or Status..."
                className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751] focus:ring-1 focus:ring-[#0D7751]"
              />
            </div>

            {/* Club Register Table */}
            <div className="overflow-y-auto grow border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-[#F8FAFC] text-slate-700 font-bold uppercase text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-3">Club ID</th>
                    <th className="p-3">Reg No</th>
                    <th className="p-3">Institution Name</th>
                    <th className="p-3">State</th>
                    <th className="p-3">Zone</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clubsLoading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0D7751]" />
                        <span>Loading authentic club register...</span>
                      </td>
                    </tr>
                  ) : filteredClubs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No clubs matching "{searchQuery}" found.
                      </td>
                    </tr>
                  ) : (
                    filteredClubs.map((club) => {
                      const isApproved =
                        (club.status || '').toLowerCase() === 'approved' ||
                        (club.status || '').toLowerCase().includes('renew');
                      return (
                        <tr key={club.code} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-mono font-bold text-[#103125]">
                            <span className="bg-[#103125] text-white px-2 py-0.5 rounded text-[11px]">
                              {club.code}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-600">
                            {club.registration_no || `NDLI/CLUB/${club.code}`}
                          </td>
                          <td className="p-3 font-semibold text-[#103125]">
                            {club.institution_name || club.name}
                          </td>
                          <td className="p-3 text-slate-700">{club.state || '—'}</td>
                          <td className="p-3">
                            <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                              {club.zone || 'Central'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                isApproved
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {club.status || 'Approved'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => openClubDetails(club)}
                              className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[#0D7751] hover:bg-[#0a5e40] text-white flex items-center gap-1 mx-auto shadow-2xs transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                              <span>Inspect &amp; Edit</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 shrink-0 border-t border-slate-100">
              <span>
                Showing <strong>{filteredClubs.length}</strong> of{' '}
                <strong>{clubsList.length}</strong> canonical clubs.
              </span>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Close Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CLUB DETAILS & EDIT MODAL
          ===================================================================== */}
      {selectedClub && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-[#103125] text-white">
                    {selectedClub.code}
                  </span>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {selectedClub.zone || 'Central'} Zone
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#103125] mt-1">
                  {selectedClub.institution_name || selectedClub.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClub(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* SUPER POWER CALLOUT BANNER */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600 fill-amber-500" />
                  <h4 className="text-sm font-extrabold text-amber-950">
                    Admin Super-Power: Password Recovery
                  </h4>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Regenerate login credentials for locked-out club authority using Google Authenticator TOTP verification.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenTotpReset}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B45309] hover:bg-amber-700 text-white flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>⚡ Regenerate Password</span>
              </button>
            </div>

            {detailsNotice && (
              <div className="text-xs font-semibold p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                {detailsNotice}
              </div>
            )}

            {/* Form to Edit Club Details */}
            <form onSubmit={handleSaveClubDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Institution / Club Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editInstName}
                    onChange={(e) => setEditInstName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Registration No
                  </label>
                  <input
                    type="text"
                    required
                    value={editRegNo}
                    onChange={(e) => setEditRegNo(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751] bg-white"
                  >
                    <option value="Approved">Approved</option>
                    <option value="Renewed">Renewed</option>
                    <option value="Renewal Due">Renewal Due</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    State / UT
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedClub.state || '—'}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Regional Zone
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedClub.zone || 'Central'}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-medium"
                  />
                </div>
              </div>

              {/* Authorities Contacts Section */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Authority Contact Information
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Patron / Director Name
                    </label>
                    <input
                      type="text"
                      value={editPatronName}
                      onChange={(e) => setEditPatronName(e.target.value)}
                      placeholder="e.g. Dr. Director"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Patron Email
                    </label>
                    <input
                      type="email"
                      value={editPatronEmail}
                      onChange={(e) => setEditPatronEmail(e.target.value)}
                      placeholder="e.g. director@inst.ac.in"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Club President Name
                    </label>
                    <input
                      type="text"
                      value={editPresidentName}
                      onChange={(e) => setEditPresidentName(e.target.value)}
                      placeholder="e.g. Prof. President"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      President Email (Login ID Target)
                    </label>
                    <input
                      type="email"
                      value={editPresidentEmail}
                      onChange={(e) => setEditPresidentEmail(e.target.value)}
                      placeholder="e.g. president@inst.ac.in"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Secretary Name
                    </label>
                    <input
                      type="text"
                      value={editSecretaryName}
                      onChange={(e) => setEditSecretaryName(e.target.value)}
                      placeholder="e.g. Dr. Secretary"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Secretary Email
                    </label>
                    <input
                      type="email"
                      value={editSecretaryEmail}
                      onChange={(e) => setEditSecretaryEmail(e.target.value)}
                      placeholder="e.g. secretary@inst.ac.in"
                      className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0D7751]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedClub(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={detailsBusy}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0D7751] hover:bg-[#0a5e40] text-white disabled:opacity-50 transition-colors"
                >
                  {detailsBusy ? 'Saving...' : 'Save Club Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: ADMIN SUPER-POWER TOTP GOOGLE AUTHENTICATOR RESET DIALOG
          ===================================================================== */}
      {isTotpModalOpen && selectedClub && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Admin Identity Verification
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Google Authenticator (RFC 6238 TOTP)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTotpModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {totpError && (
              <div className="text-xs font-semibold p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{totpError}</span>
              </div>
            )}

            {!generatedCredentials ? (
              <form onSubmit={handleExecuteTotpReset} className="space-y-4">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                  You are generating an emergency login credential for{' '}
                  <strong>{selectedClub.institution_name || selectedClub.code}</strong>.
                  Enter the current 6-digit verification code from your Google Authenticator app.
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    6-Digit Google Authenticator Code <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full text-center tracking-widest text-2xl font-mono py-2.5 rounded-xl border-2 border-slate-300 focus:border-[#0D7751] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Set Custom Password (Optional)
                  </label>
                  <input
                    type="text"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="Leave blank for secure auto-generation"
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleOpenTotpSetup}
                    className="text-[11px] font-bold text-slate-500 hover:text-[#0D7751] flex items-center gap-1 underline"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Setup Google Authenticator</span>
                  </button>

                  <button
                    type="submit"
                    disabled={totpBusy || totpCode.length !== 6}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B45309] hover:bg-amber-700 text-white disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {totpBusy ? 'Verifying...' : '⚡ Verify & Regenerate'}
                  </button>
                </div>
              </form>
            ) : (
              /* Success Screen with Copy Credentials */
              <div className="space-y-4 animate-in fade-in">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h5 className="text-sm font-extrabold text-emerald-950">
                    Password Generated Successfully!
                  </h5>
                  <p className="text-[11px] text-emerald-700">
                    Share this temporary credential securely with the verified club authority.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-slate-500 font-sans">Club Code:</span>
                    <span className="font-bold text-slate-900">{generatedCredentials.club_code}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-slate-500 font-sans">Username / User ID:</span>
                    <span className="font-bold text-slate-900">{generatedCredentials.username}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans">Temporary Password:</span>
                    <span className="font-extrabold text-[#0D7751] bg-white px-2 py-0.5 rounded border border-slate-200">
                      {generatedCredentials.temporary_password}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#103125] hover:bg-[#1a503e] text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Credentials Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>📋 Copy All Login Credentials</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTotpModalOpen(false)}
                    className="w-full py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: 30-DAY UNRESOLVED ESCALATIONS MODAL (FULL PARITY)
          ===================================================================== */}
      {isEscalationsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-900 to-rose-700 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-xl shadow-xs">
                  🚨
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">
                    30-Day Unresolved Escalations Desk
                  </h3>
                  <p className="text-xs text-rose-200 mt-0.5">
                    Critical regional club issues unresolved for 30+ days requiring administrative review and SLA disposition.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEscalationsModalOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter / Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={escalationsSearchQuery}
                  onChange={(e) => setEscalationsSearchQuery(e.target.value)}
                  placeholder="Search by Club ID, Institution, Officer, or Issue..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500 bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Total Escalations:
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                  {escalationsList.filter((i) => i.is_admin_escalated || i.status !== 'resolved').length} Critical
                </span>
              </div>
            </div>

            {/* Content Table / Empty State */}
            <div className="p-6 overflow-y-auto flex-1">
              {escalationsLoading ? (
                <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-rose-600" />
                  <span>Loading escalated regional issues from SSOT...</span>
                </div>
              ) : escalationsList.filter((i) => i.is_admin_escalated || i.status !== 'resolved').length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 text-3xl flex items-center justify-center mx-auto border-2 border-emerald-200">
                    ✓
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    All Clear — Zero Unresolved Escalations
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    All regional club issues across all 6 zones have been resolved or are within their normal 30-day resolution timeline. No emergency administrative intervention required.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Issue ID</th>
                        <th className="p-3">Club ID</th>
                        <th className="p-3">Subject &amp; Issue Note</th>
                        <th className="p-3">Assigned Zone</th>
                        <th className="p-3 text-center">Unresolved Duration</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {escalationsList
                        .filter((i) => i.is_admin_escalated || i.status !== 'resolved')
                        .filter((i) => {
                          if (!escalationsSearchQuery.trim()) return true;
                          const q = escalationsSearchQuery.toLowerCase().trim();
                          return (
                            (i.id || '').toLowerCase().includes(q) ||
                            (i.club_id || '').toLowerCase().includes(q) ||
                            (i.subject || '').toLowerCase().includes(q) ||
                            (i.description || '').toLowerCase().includes(q)
                          );
                        })
                        .map((issue) => (
                          <tr key={issue.id} className="hover:bg-rose-50/40 transition-colors">
                            <td className="p-3 font-mono font-bold text-rose-800 text-[11px]">
                              {issue.id.slice(0, 8)}...
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-900">
                              {issue.club_id}
                            </td>
                            <td className="p-3 max-w-xs">
                              <div className="font-extrabold text-slate-900">{issue.subject}</div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">{issue.description}</div>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                {issue.zone || 'Central'} Zone
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-extrabold text-[10px]">
                                30+ Days Overdue
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedEscalatedIssue(issue)}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                              >
                                Review &amp; Decide ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsEscalationsModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
              >
                Close Escalations Desk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal for Selected Escalation */}
      {selectedEscalatedIssue && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span className="text-base">🚨</span>
                <span>Review Escalated Regional Grievance</span>
              </h4>
              <button onClick={() => setSelectedEscalatedIssue(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px]">
                <div><span className="text-slate-500">Ticket ID:</span> <strong>{selectedEscalatedIssue.id}</strong></div>
                <div><span className="text-slate-500">Club ID:</span> <strong>{selectedEscalatedIssue.club_id}</strong></div>
                <div><span className="text-slate-500">Status:</span> <strong className="text-rose-700">{selectedEscalatedIssue.status}</strong></div>
                <div><span className="text-slate-500">Reported:</span> {new Date(selectedEscalatedIssue.created_at).toLocaleDateString()}</div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Subject:</label>
                <div className="p-2.5 rounded-xl bg-slate-100 font-bold text-slate-900">
                  {selectedEscalatedIssue.subject}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Issue Description:</label>
                <div className="p-3 rounded-xl bg-slate-100 text-slate-800 leading-relaxed">
                  {selectedEscalatedIssue.description}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resolveGrievance(selectedEscalatedIssue.id, { decision: 'resolved', reason: 'Resolved by Central Admin' });
                      alert('Issue marked as resolved.');
                      setSelectedEscalatedIssue(null);
                      await openEscalationsModal();
                    } catch (err: any) {
                      alert(err?.message || 'Resolution failed');
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#0D7751] text-white hover:bg-[#0a5e40] transition-colors"
                >
                  ✓ Mark as Resolved
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEscalatedIssue(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: TOTP SETUP / QR CODE DIALOG
          ===================================================================== */}
      {isSetupOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#0D7751]" />
                <span>Setup Google Authenticator</span>
              </h4>
              <button onClick={() => setIsSetupOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {setupNotice && (
              <div className="text-xs p-2.5 rounded-xl bg-slate-100 text-slate-800">
                {setupNotice}
              </div>
            )}

            {totpSetupData && (
              <div className="space-y-3 text-center">
                <p className="text-xs text-slate-600">
                  Add this secret key manually into Google Authenticator or scan the URI:
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-sm font-bold text-[#103125] tracking-widest break-all select-all">
                  {totpSetupData.secret}
                </div>

                <form onSubmit={handleVerifyTotpSetup} className="space-y-3 text-left">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Confirm 6-Digit Code to Activate:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full text-center tracking-widest text-xl font-mono py-2 rounded-xl border border-slate-300 focus:border-[#0D7751]"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 rounded-xl text-xs font-bold bg-[#0D7751] text-white hover:bg-[#0a5e40]"
                  >
                    Confirm &amp; Enable MFA
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
