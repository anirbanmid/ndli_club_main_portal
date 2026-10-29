/**
 * Admin Performance Dashboard Panel — Central Administration Office (Tier 2).
 *
 * Full parity with previous project `templates/admin.html` & `static/js/admin_club_details.js`:
 * - Top 5 zero-jargon KPI cards (Total NDLI Clubs, Total Daily Support Logs,
 *   Active Nodal Officers, Renewal Attention Required, 30-Day Escalations).
 * - Interactive KPI Drilldown: Clicking "Total NDLI Clubs" card opens the
 *   Club Register modal with real-time multi-field search and edit capabilities.
 * - Admin Super-Power: TOTP-gated (Google Authenticator RFC 6238) password regeneration
 *   for locked-out club authorities, with audit logging and single-click credential copying.
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
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Filter,
  Key,
  Layers,
  Lock,
  MapPin,
  PhoneCall,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { ApiError, TelemetryPayload, fetchTelemetry } from '../lib/api';
import { t } from '../i18n';
import {
  AdminClubRow,
  AuditFeed,
  AuditRow,
  OfficerEvaluation,
  OfficerRatings,
  ZoneDashboard,
  fetchAdminClubs,
  fetchAdminTotpSetup,
  fetchAuditFeed,
  fetchOfficerRatings,
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
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
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
      title={clickable ? 'Click to open Club Register' : undefined}
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
              <span>View</span>
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

export const DashboardsPanel: React.FC<{ zoneCode: string }> = ({ zoneCode }) => {
  const zone = zoneCode === 'All' ? undefined : zoneCode;
  const [dashboard, setDashboard] = useState<ZoneDashboard | null>(null);
  const [ratings, setRatings] = useState<OfficerRatings | null>(null);
  const [audit, setAudit] = useState<AuditFeed | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      // Update in local state
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
      setDetailsNotice('✅ Club properties updated in live database.');
    } catch (err) {
      setDetailsNotice(`⚠️ ${errorMessage(err)}`);
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
      setTotpError('Please enter a valid 6-digit Google Authenticator code.');
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
      setSetupNotice(`✅ ${res.message}`);
      setIsSetupOpen(false);
    } catch (err) {
      setSetupNotice(errorMessage(err));
    }
  };

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

  // Filter clubs in Club Register
  const filteredClubs = clubsList.filter((c) => {
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
            onClick={openClubRegister}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0D7751] hover:bg-[#0a5e40] text-white flex items-center gap-2 shadow-xs transition-colors"
            title="Open Master Club Register"
          >
            <Building2 className="w-4 h-4" />
            <span>{t('Open Club Register')}</span>
          </button>

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
          desc={t('Click to open Club Register & details')}
          badge={t('11 Canonical')}
          icon={<Building2 className="w-5 h-5" />}
          variant="green"
          clickable={true}
          onClick={openClubRegister}
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
          clickable={true}
          onClick={openClubRegister}
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
                <th className="p-3">{t('State / UT')}</th>
                <th className="p-3">{t('Zone')}</th>
                <th className="p-3 text-right">{t('Institutions')}</th>
                <th className="p-3 text-right">{t('Registered Clubs')}</th>
                <th className="p-3 text-right">{t('Active Members')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {stateRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#5A7366]">
                    {loading ? t('Loading telemetry…') : t('No divisional records found.')}
                  </td>
                </tr>
              ) : (
                stateRows.map((s, idx) => (
                  <tr key={s.code} className="hover:bg-[#F4F8F6]/60 transition-colors">
                    <td className="p-3 font-mono text-[#5A7366]">{idx + 1}</td>
                    <td className="p-3 font-semibold text-[#103125]">
                      {s.name}{' '}
                      <span className="font-mono text-[10px] text-[#5A7366]">
                        ({s.code})
                      </span>
                    </td>
                    <td className="p-3 font-medium text-[#2E4A3E]">{s.zone}</td>
                    <td className="p-3 text-right font-mono">{s.institutions}</td>
                    <td className="p-3 text-right font-mono font-bold text-[#103125]">
                      {s.clubs}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-[#0D7751]">
                      {s.members.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {stateRows.length > 0 && (
              <tfoot className="bg-[#E9F5EF] text-[#103125] font-extrabold border-t-2 border-[#BFE3D2]">
                <tr>
                  <td colSpan={3} className="p-3 text-right uppercase text-[11px]">
                    {t('National Total')}:
                  </td>
                  <td className="p-3 text-right font-mono">{totals.institutions}</td>
                  <td className="p-3 text-right font-mono">{totals.clubs}</td>
                  <td className="p-3 text-right font-mono text-[#0D7751]">
                    {totals.members.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Regional Officer Performance Matrix & Stars */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              {t('Regional Officer Performance Matrix (EMP01–EMP07)')}
            </h4>
            <p className="text-xs text-[#5A7366]">
              {t('Official 50/30/20/10 weighted formula based on real-time log entries and verification')}
            </p>
          </div>
          <span className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            {ratings?.officers.length ?? 0} {t('Officers Evaluated')}
          </span>
        </div>

        <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
          <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
            <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">{t('Officer ID')}</th>
                <th className="p-3">{t('Officer Name')}</th>
                <th className="p-3">{t('Zone')}</th>
                <th className="p-3 text-right">{t('Calls (50%)')}</th>
                <th className="p-3 text-right">{t('Emails (30%)')}</th>
                <th className="p-3 text-right">{t('Events (20%)')}</th>
                <th className="p-3 text-right">{t('Training (10%)')}</th>
                <th className="p-3 text-right">{t('Composite Score')}</th>
                <th className="p-3 text-center">{t('Rating')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
              {(ratings?.officers.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[#5A7366]">
                    {loading ? t('Loading evaluations…') : t('No officer evaluations recorded.')}
                  </td>
                </tr>
              ) : (
                ratings?.officers.map((o: OfficerEvaluation) => {
                  const stars = Math.min(
                    5,
                    Math.max(1, Math.round(Number(o.weighted_score ?? o.score ?? 3) / 20)),
                  );
                  return (
                    <tr key={o.officer_id} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3 font-mono font-bold text-[#103125]">
                        <span className="bg-[#103125] text-white px-2 py-0.5 rounded text-[11px]">
                          {o.emp_id || o.officer_id}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-[#103125]">{o.officer_name}</td>
                      <td className="p-3 font-medium text-[#2E4A3E]">{o.zone}</td>
                      <td className="p-3 text-right font-mono">{String(o.calls ?? o.calls_made ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{String(o.emails ?? o.emails_sent ?? 0)}</td>
                      <td className="p-3 text-right font-mono">{String(o.events ?? 0)}</td>
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

      {/* =====================================================================
          MODAL 1: CLUB REGISTER MODAL (Opens on clicking Total NDLI Clubs KPI)
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
                <strong>{clubsList.length}</strong> canonical clubs (all sample fixtures filtered).
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
          MODAL 2: CLUB DETAILS & EDIT MODAL
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
          MODAL 3: ADMIN SUPER-POWER TOTP GOOGLE AUTHENTICATOR RESET DIALOG
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
          MODAL 4: TOTP SETUP / QR CODE DIALOG
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
