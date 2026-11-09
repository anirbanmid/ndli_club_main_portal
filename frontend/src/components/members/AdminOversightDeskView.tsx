import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Filter,
  GraduationCap,
  Layers,
  Loader2,
  LogOut,
  Mail,
  MousePointerClick,
  Phone,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  AdminOversightData,
  acknowledgeOversightSeal,
  markOversightNotificationsRead,
} from '../../lib/campusApi';
import { broadcastPortalEvent } from '../../lib/realtimeSync';

interface AdminOversightDeskViewProps {
  data: AdminOversightData;
  onNavigateToModule2?: (clubCode?: string) => void;
  onSignOut?: () => void;
}

export const AdminOversightDeskView: React.FC<AdminOversightDeskViewProps> = ({
  data,
  onNavigateToModule2,
  onSignOut,
}) => {
  const instName =
    data.club?.institution_name || data.club?.name || 'Institutional Club';
  const roleDisplay = (data.role || 'Club Admin').replace(/_/g, ' ');

  // Notifications State & Dropdown
  const [showNotifications, setShowNotifications] = useState(false);
  const storageKey = useMemo(
    () => `ndli_read_notifs_${data.club?.code || 'global'}_${data.user?.id || 'admin'}`,
    [data.club?.code, data.user?.id]
  );
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`ndli_read_notifs_${data.club?.code || 'global'}_${data.user?.id || 'admin'}`) : null;
      const set = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      (data.notifications || []).forEach((n) => {
        if (n.read) set.add(n.id);
      });
      return set;
    } catch {
      return new Set<string>();
    }
  });
  const [activeModal, setActiveModal] = useState<{
    id?: string;
    type: 'renewal' | 'approval';
    title?: string;
    description?: string;
    timestamp?: string;
  } | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [acknowledgedNotice, setAcknowledgedNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      const set = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      (data.notifications || []).forEach((n) => {
        if (n.read) set.add(n.id);
      });
      setReadNotifIds(set);
    } catch {
      // ignore
    }
  }, [data.notifications, storageKey]);

  const markNotificationAsRead = (notifId: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev).add(notifId);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
    void markOversightNotificationsRead([notifId]).catch(() => {});
    broadcastPortalEvent('NOTIFICATION_READ', {
      notification_id: notifId,
      club_code: data.club?.code,
    });
  };

  const markAllNotificationsAsRead = () => {
    const allIds = (data.notifications || []).map((n) => n.id);
    setReadNotifIds((prev) => {
      const next = new Set([...prev, ...allIds]);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
    void markOversightNotificationsRead(allIds, true).catch(() => {});
    broadcastPortalEvent('NOTIFICATION_READ', {
      action: 'mark_all_read',
      club_code: data.club?.code,
    });
  };

  // Scholars Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [subClubFilter, setSubClubFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // Events Display Tab
  const [eventsTab, setEventsTab] = useState<'upcoming' | 'completed'>('upcoming');

  // Chart Hover Tooltip State
  const [activeChartPoint, setActiveChartPoint] = useState<{
    year: number;
    events_count: number;
    members_enrolled: number;
    x: number;
    yEvents: number;
    yMembers: number;
  } | null>(null);

  // Stats derivation
  const totalMembers =
    data.stats?.total_members ?? data.oversight?.total_members ?? 0;
  const activeMembers =
    data.stats?.active_members ??
    data.stats?.active_students ??
    data.oversight?.active_students ??
    0;
  const suspendedMembers =
    data.stats?.suspended_or_expired ??
    data.stats?.suspended_students ??
    data.oversight?.suspended_students ??
    0;
  const subClubUnits =
    data.stats?.heis_disciplines ??
    data.stats?.total_sub_clubs ??
    data.oversight?.total_sub_clubs ??
    0;
  const totalEvents =
    data.events?.total_count ??
    data.stats?.total_events ??
    data.oversight?.total_events ??
    0;

  // Validity derivation
  const validity = data.validity || {
    days_remaining: 180,
    is_overdue: false,
    last_renewal_date: null,
    upcoming_renewal_date: null,
  };

  // Notifications derivation
  const notifications = data.notifications || [];
  const unreadNotifsCount = notifications.filter(
    (n) => !n.read && !readNotifIds.has(n.id)
  ).length;

  // Library Telemetry derivation
  const libTelemetry = data.libraries_telemetry || {
    total_clicks: 0,
    tier_breakdown: {
      club_tier_clicks: 0,
      personal_tier_clicks: 0,
      community_tier_clicks: 0,
    },
  };

  // Certificates derivation
  const certCount = data.certificates_telemetry?.total_issued ?? 0;

  // Administrators derivation
  const mainAdmins = data.administrators?.main_admins || [];
  const subClubCoords = data.administrators?.subclub_coordinators || [];

  // Scholars derivation & filtering
  const allScholars = useMemo(() => {
    if (data.scholars && data.scholars.length > 0) return data.scholars;
    if (data.recent_members && data.recent_members.length > 0) {
      return data.recent_members.map((m) => ({
        id: m.id,
        user_id: m.id,
        full_name: m.full_name,
        email: m.email || '',
        roll_number: m.roll_number || '',
        department: m.department || 'General',
        sub_clubs: [],
        enrollment_year: 2026,
        valid_until: m.valid_until || null,
        is_suspended: !!m.is_suspended,
        points: m.points || 0,
        badge: m.badge || 'copper',
      }));
    }
    return [];
  }, [data.scholars, data.recent_members]);

  // Unique Filter Options
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    allScholars.forEach((s) => {
      if (s.department) set.add(s.department);
    });
    return Array.from(set).sort();
  }, [allScholars]);

  const uniqueSubClubs = useMemo(() => {
    const map = new Map<number, string>();
    allScholars.forEach((s) => {
      s.sub_clubs?.forEach((sc) => map.set(sc.id, sc.name));
    });
    subClubCoords.forEach((c) => {
      map.set(c.subclub_id, c.subclub_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allScholars, subClubCoords]);

  const uniqueYears = useMemo(() => {
    const set = new Set<number>();
    allScholars.forEach((s) => {
      if (s.enrollment_year) set.add(s.enrollment_year);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [allScholars]);

  // Filtered Scholars
  const filteredScholars = useMemo(() => {
    return allScholars.filter((s) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.full_name?.toLowerCase().includes(q);
        const matchesRoll = s.roll_number?.toLowerCase().includes(q);
        const matchesEmail = s.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesEmail) return false;
      }
      // Department
      if (deptFilter !== 'ALL' && s.department !== deptFilter) return false;
      // Sub-Club
      if (subClubFilter !== 'ALL') {
        const targetId = Number(subClubFilter);
        const hasSubClub = s.sub_clubs?.some((sc) => sc.id === targetId);
        if (!hasSubClub) return false;
      }
      // Year
      if (yearFilter !== 'ALL' && String(s.enrollment_year) !== yearFilter) {
        return false;
      }
      // Status
      if (statusFilter === 'ACTIVE' && s.is_suspended) return false;
      if (statusFilter === 'SUSPENDED' && !s.is_suspended) return false;

      return true;
    });
  }, [allScholars, searchQuery, deptFilter, subClubFilter, yearFilter, statusFilter]);

  // Telemetry Line Graph calculation
  const trendData = useMemo(() => {
    if (data.telemetry?.year_trends && data.telemetry.year_trends.length > 0) {
      return data.telemetry.year_trends;
    }
    const currentYear = new Date().getFullYear();
    return [
      { year: currentYear - 4, events_count: 2, members_enrolled: 15 },
      { year: currentYear - 3, events_count: 5, members_enrolled: 42 },
      { year: currentYear - 2, events_count: 8, members_enrolled: 80 },
      { year: currentYear - 1, events_count: 14, members_enrolled: 130 },
      { year: currentYear, events_count: totalEvents || 18, members_enrolled: totalMembers || 165 },
    ];
  }, [data.telemetry, totalEvents, totalMembers]);

  // SVG dimensions
  const svgWidth = 560;
  const svgHeight = 180;
  const padX = 40;
  const padY = 30;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padY * 2;

  const maxEventVal = Math.max(...trendData.map((d) => d.events_count), 5);
  const maxMemberVal = Math.max(...trendData.map((d) => d.members_enrolled), 20);

  const points = useMemo(() => {
    const step = trendData.length > 1 ? plotW / (trendData.length - 1) : plotW;
    return trendData.map((d, i) => {
      const x = padX + i * step;
      const yEvt = padY + plotH - (d.events_count / maxEventVal) * plotH;
      const yMem = padY + plotH - (d.members_enrolled / maxMemberVal) * plotH;
      return {
        ...d,
        x,
        yEvents: isNaN(yEvt) ? padY + plotH : yEvt,
        yMembers: isNaN(yMem) ? padY + plotH : yMem,
      };
    });
  }, [trendData, plotW, plotH, padX, padY, maxEventVal, maxMemberVal]);

  const eventPathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yEvents}`).join(' ');
  const memberPathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yMembers}`).join(' ');

  const eventAreaStr =
    points.length > 0
      ? `${eventPathStr} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`
      : '';
  const memberAreaStr =
    points.length > 0
      ? `${memberPathStr} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`
      : '';

  const completedEvents = data.events?.completed || [];
  const upcomingEvents = data.events?.upcoming || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in">
      {/* 1. Header Banner with Authority Seal & Notification Bell */}
      <div className="relative overflow-visible bg-gradient-to-r from-[#0d2a20] via-[#133d2e] to-[#0d2a20] rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-emerald-900/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-emerald-400 text-gray-950 text-xs font-black rounded-full uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-950" />
                <span>Administrative Oversight Desk</span>
              </span>
              <span className="px-3 py-1 bg-white/15 text-emerald-200 text-xs font-bold rounded-full capitalize">
                {roleDisplay}
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-mono rounded-full border border-emerald-500/30">
                Club: {data.club?.code || 'MAIN'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white drop-shadow-sm">
              {instName}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200/90 flex items-center space-x-2">
              <span>National Digital Library of India Institutional Club Governance</span>
              <span>•</span>
              <span className="font-semibold text-white">
                {data.user?.full_name || data.user?.username}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-center">
            {/* Bell Icon Notification Center Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-md hover:shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400"
                title="Club Notification Centre"
                aria-label="Club Notification Centre"
              >
                <Bell className="h-5 w-5" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-[#0d2a20] animate-pulse">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Notification Center Dropdown */}
              {showNotifications && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
                    onClick={() => setShowNotifications(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white text-gray-900 rounded-2xl shadow-2xl border border-gray-200 p-4 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <div className="flex items-center space-x-2">
                        <Bell className="h-4 w-4 text-emerald-700" />
                        <h3 className="font-bold text-sm text-gray-900">Important Notifications</h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        {unreadNotifsCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllNotificationsAsRead}
                            className="text-[10px] text-emerald-700 hover:text-emerald-800 font-semibold underline cursor-pointer"
                          >
                            Mark all read
                          </button>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                          {notifications.length} Alerts
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowNotifications(false)}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 cursor-pointer"
                          aria-label="Close notifications"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto mt-2 space-y-1">
                      {notifications.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-500">
                          No pending alerts. All institutional club statuses are normal.
                        </div>
                      ) : (
                        notifications.map((n) => {
                          const isRead = n.read || readNotifIds.has(n.id);
                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                markNotificationAsRead(n.id);
                                setShowNotifications(false);
                                if (n.action_type === 'open_renewal_modal') {
                                  setActiveModal({
                                    id: n.id,
                                    type: 'renewal',
                                    title: n.title,
                                    description: n.description,
                                    timestamp: n.timestamp,
                                  });
                                } else if (n.action_type === 'view_approval_modal') {
                                  setActiveModal({
                                    id: n.id,
                                    type: 'approval',
                                    title: n.title,
                                    description: n.description,
                                    timestamp: n.timestamp,
                                  });
                                }
                              }}
                              className={`p-3 rounded-xl transition-all cursor-pointer hover:bg-gray-50 flex items-start space-x-3 text-left ${
                                isRead
                                  ? 'opacity-65 bg-gray-50/50 border-l-4 border-gray-300'
                                  : n.type === 'warning_critical'
                                  ? 'bg-rose-50/60 border-l-4 border-rose-500'
                                  : n.type === 'warning'
                                  ? 'bg-amber-50/60 border-l-4 border-amber-500'
                                  : 'bg-emerald-50/40 border-l-4 border-emerald-600'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {n.type === 'warning_critical' ? (
                                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                                ) : n.type === 'warning' ? (
                                  <Timer className="h-4 w-4 text-amber-600" />
                                ) : (
                                  <Award className="h-4 w-4 text-emerald-600" />
                                )}
                              </div>
                              <div className="flex-1 space-y-1 min-w-0">
                                <div className="text-xs font-bold text-gray-900 leading-tight">
                                  {n.title}
                                </div>
                                <p className="text-[11px] text-gray-600 line-clamp-2">
                                  {n.description}
                                </p>
                                <span className="text-[9px] text-gray-400 block font-mono">
                                  Click to view official modal
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Return to Module 2 */}
            <button
              onClick={() => {
                if (onNavigateToModule2) {
                  onNavigateToModule2(data.club?.code);
                } else {
                  window.location.href =
                    data.module_2_url || `/?view=club_module&club=${data.club?.code || ''}`;
                }
              }}
              className="px-5 py-3 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-gray-950 font-black text-xs transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center space-x-2 cursor-pointer"
            >
              <Building2 className="h-4 w-4" />
              <span>Return to Club Admin (Module 2)</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            {onSignOut && (
              <button
                onClick={onSignOut}
                className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Dynamic KPI Cards Row (5 Core Telemetry Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Event Count KPI */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Events</span>
            <Calendar className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{totalEvents}</div>
          <div className="text-[11px] font-medium text-emerald-800 flex items-center space-x-1">
            <span>{completedEvents.length} Completed</span>
            <span>•</span>
            <span>{upcomingEvents.length} Upcoming</span>
          </div>
        </div>

        {/* Card 2: Validity Countdown Timer KPI */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Validity Countdown</span>
            <Timer
              className={`h-4 w-4 ${
                validity.days_remaining <= 15
                  ? 'text-rose-600'
                  : validity.days_remaining <= 30
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            />
          </div>
          <div
            className={`text-3xl font-black ${
              validity.days_remaining <= 15
                ? 'text-rose-600'
                : validity.days_remaining <= 30
                ? 'text-amber-600'
                : 'text-emerald-700'
            }`}
          >
            {validity.is_overdue
              ? '0 Days (Expired)'
              : `${validity.days_remaining} Days`}
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
            <span className="truncate">Last Renewal: {validity.last_renewal_date || 'Charter Active'}</span>
            {(validity.is_overdue || validity.days_remaining <= 30) && (
              <button
                type="button"
                onClick={() =>
                  setActiveModal({
                    type: 'renewal',
                    title: validity.is_overdue
                      ? 'Registration Renewal Overdue'
                      : `Renewal Due (${validity.days_remaining} Days Remaining)`,
                    description: `Annual institutional club renewal is required. Current upcoming renewal date: ${
                      validity.upcoming_renewal_date || 'immediate'
                    }. Ensure compliance documents are certified.`,
                  })
                }
                className="text-[10px] font-bold text-rose-600 hover:text-rose-800 underline shrink-0 ml-1 cursor-pointer"
              >
                Renew Now
              </button>
            )}
          </div>
        </div>

        {/* Card 3: 3-Tier Curated Library Clicks KPI */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Library Usage</span>
            <MousePointerClick className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">
            {libTelemetry.total_clicks}{' '}
            <span className="text-sm font-semibold text-gray-500">clicks</span>
          </div>
          <div className="text-[10px] text-gray-500 flex items-center justify-between font-mono">
            <span title="Tier 1: Club Official">T1: {libTelemetry.tier_breakdown.club_tier_clicks}</span>
            <span title="Tier 2: Personal Study">T2: {libTelemetry.tier_breakdown.personal_tier_clicks}</span>
            <span title="Tier 3: Inter-Club Community">T3: {libTelemetry.tier_breakdown.community_tier_clicks}</span>
          </div>
        </div>

        {/* Card 4: Certificates Issued KPI */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Certificates Issued</span>
            <Award className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{certCount}</div>
          <div className="text-[11px] font-medium text-amber-700 flex items-center space-x-1">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>IIT Kharagpur HMAC Certified</span>
          </div>
        </div>

        {/* Card 5: Scholars Enrolled KPI */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Enrolled Scholars</span>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{totalMembers}</div>
          <div className="text-[11px] text-gray-600 flex items-center space-x-1">
            <span className="font-bold text-emerald-700">{activeMembers} Active</span>
            <span>•</span>
            <span className="font-bold text-rose-700">{suspendedMembers} Suspended</span>
          </div>
        </div>
      </div>

      {/* 3. Animated Dual-Line Telemetry Graph */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-black text-gray-900">
                Annual Telemetry Trends (5-Year Activity & Enrollment)
              </h2>
            </div>
            <p className="text-xs text-gray-500">
              Correlated metrics tracking student member admissions vs club activity delivery.
            </p>
          </div>

          <div className="flex items-center space-x-4 text-xs font-bold">
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-600 inline-block shadow-xs" />
              <span className="text-gray-700">Events Hosted</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-indigo-600 inline-block shadow-xs" />
              <span className="text-gray-700">Scholars Enrolled</span>
            </div>
          </div>
        </div>

        {/* Animated SVG Graph Container */}
        <div
          className="relative w-full overflow-hidden bg-gray-50/70 rounded-2xl p-4 border border-gray-100"
          onMouseLeave={() => setActiveChartPoint(null)}
        >
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-48 sm:h-60 overflow-visible"
          >
            <defs>
              <linearGradient id="eventGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="memberGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <style>{`
              @keyframes lineDrawAnimation {
                from { stroke-dashoffset: 1200; }
                to { stroke-dashoffset: 0; }
              }
              .telemetry-line-draw-event {
                stroke-dasharray: 1200;
                stroke-dashoffset: 1200;
                animation: lineDrawAnimation 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
              .telemetry-line-draw-member {
                stroke-dasharray: 1200;
                stroke-dashoffset: 1200;
                animation: lineDrawAnimation 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
              }
            `}</style>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padY + plotH * ratio;
              return (
                <line
                  key={ratio}
                  x1={padX}
                  y1={y}
                  x2={padX + plotW}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              );
            })}

            {/* Area Fills under curves */}
            {eventAreaStr && (
              <path
                d={eventAreaStr}
                fill="url(#eventGrad)"
                className="transition-opacity duration-500"
              />
            )}
            {memberAreaStr && (
              <path
                d={memberAreaStr}
                fill="url(#memberGrad)"
                className="transition-opacity duration-500"
              />
            )}

            {/* Event Trend Path */}
            <path
              d={eventPathStr}
              fill="none"
              stroke="#059669"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="telemetry-line-draw-event"
            />

            {/* Member Trend Path */}
            <path
              d={memberPathStr}
              fill="none"
              stroke="#4f46e5"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="telemetry-line-draw-member"
            />

            {/* Interactive Data Points */}
            {points.map((p, idx) => (
              <g key={idx}>
                {/* Event circle */}
                <circle
                  cx={p.x}
                  cy={p.yEvents}
                  r="5"
                  className="fill-white stroke-emerald-600 stroke-[3] hover:r-7 transition-all cursor-pointer"
                  onMouseEnter={() => setActiveChartPoint(p)}
                />
                {/* Member circle */}
                <circle
                  cx={p.x}
                  cy={p.yMembers}
                  r="5"
                  className="fill-white stroke-indigo-600 stroke-[3] hover:r-7 transition-all cursor-pointer"
                  onMouseEnter={() => setActiveChartPoint(p)}
                />

                {/* X Axis Year Labels */}
                <text
                  x={p.x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  className="text-[11px] font-bold fill-gray-500 font-mono"
                >
                  {p.year}
                </text>
              </g>
            ))}
          </svg>

          {/* Hover Tooltip Overlay */}
          {activeChartPoint && (
            <div className="absolute top-2 right-4 bg-gray-900 text-white rounded-xl px-3 py-2 text-xs shadow-lg space-y-1 animate-in fade-in">
              <div className="font-bold border-b border-gray-800 pb-1 font-mono">
                Year: {activeChartPoint.year}
              </div>
              <div className="flex items-center space-x-2 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Events: {activeChartPoint.events_count}</span>
              </div>
              <div className="flex items-center space-x-2 text-indigo-300">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                <span>Scholars Enrolled: {activeChartPoint.members_enrolled}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Administrative Roster Section (Main Admins & Sub-Club Coordinators) */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <div className="flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-black text-gray-900">
              Institutional Administrative Roster
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            Registered governance authority members of the main club and departmental sub-clubs.
          </p>
        </div>

        {/* Main Admins Grid */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-gray-600 uppercase tracking-wider">
            Main Club Administrative Authorities
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mainAdmins.map((admin, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-gradient-to-b from-gray-50 to-white border border-gray-200 hover:border-emerald-500/50 transition-all space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-full">
                    {admin.role}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active Authority" />
                </div>
                <div>
                  <div className="font-bold text-gray-900 text-sm">{admin.name}</div>
                  <div className="text-xs text-gray-500">{admin.title}</div>
                </div>
                <div className="space-y-1 pt-2 border-t border-gray-100 text-xs">
                  {admin.email && (
                    <a
                      href={`mailto:${admin.email}`}
                      className="flex items-center space-x-1.5 text-gray-600 hover:text-emerald-700 truncate"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{admin.email}</span>
                    </a>
                  )}
                  {admin.phone && (
                    <a
                      href={`tel:${admin.phone}`}
                      className="flex items-center space-x-1.5 text-gray-600 hover:text-emerald-700 truncate font-mono text-[11px]"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{admin.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sub-Club Coordinators */}
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-gray-600 uppercase tracking-wider">
              Departmental Sub-Club Coordinators ({subClubCoords.length} Chapters)
            </h3>
          </div>

          {subClubCoords.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-500 italic">
              No departmental sub-clubs provisioned for this institution yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subClubCoords.map((coord) => (
                <div
                  key={coord.id}
                  className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-indigo-400/50 transition-all space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {coord.subclub_name}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {coord.discipline}
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs">
                      {coord.coordinator_name}
                    </div>
                    <div className="text-[11px] text-gray-500">Coordinator</div>
                  </div>
                  <div className="space-y-0.5 pt-2 border-t border-gray-100 text-[11px]">
                    {coord.coordinator_email && (
                      <div className="flex items-center space-x-1 text-gray-600 truncate">
                        <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate">{coord.coordinator_email}</span>
                      </div>
                    )}
                    {coord.coordinator_phone && (
                      <div className="flex items-center space-x-1 text-gray-600 font-mono text-[10px]">
                        <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                        <span>{coord.coordinator_phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Scholars Roster with Live Real-Time Multi-Filters */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <GraduationCap className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-black text-gray-900">
                Institutional Scholars Roster
              </h2>
            </div>
            <p className="text-xs text-gray-500">
              Verified student scholars enrolled in this club and affiliated disciplinary chapters.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-gray-100 text-gray-700 rounded-full self-start">
            Showing {filteredScholars.length} of {allScholars.length} Scholars
          </span>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scholar name / roll..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Departments / Classes</option>
            {uniqueDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Sub-Club Filter */}
          <select
            value={subClubFilter}
            onChange={(e) => setSubClubFilter(e.target.value)}
            disabled={uniqueSubClubs.length === 0}
            className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              uniqueSubClubs.length === 0
                ? 'opacity-60 cursor-not-allowed bg-gray-100'
                : ''
            }`}
          >
            <option value="ALL">
              {uniqueSubClubs.length === 0
                ? 'No Sub-Clubs (School)'
                : 'All Sub-Clubs'}
            </option>
            {uniqueSubClubs.map((sc) => (
              <option key={sc.id} value={String(sc.id)}>
                {sc.name}
              </option>
            ))}
          </select>

          {/* Year Filter */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Enrollment Years</option>
            {uniqueYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Scholars</option>
            <option value="SUSPENDED">Suspended Scholars</option>
          </select>
        </div>

        {/* Scholars Table */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px] font-black border-b border-gray-200">
              <tr>
                <th className="p-3.5">Scholar Name</th>
                <th className="p-3.5">Roll Number</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Sub-Club Tags</th>
                <th className="p-3.5">Enrollment Year</th>
                <th className="p-3.5">Validity Expiry</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredScholars.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500 italic">
                    No scholars match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredScholars.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-gray-900 flex items-center space-x-2">
                      <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                        {s.full_name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <div>{s.full_name}</div>
                        {s.email && (
                          <div className="text-[10px] font-normal text-gray-400">
                            {s.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-gray-600">{s.roll_number || '—'}</td>
                    <td className="p-3.5 text-gray-600">{s.department || '—'}</td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {s.sub_clubs && s.sub_clubs.length > 0 ? (
                          s.sub_clubs.map((sc) => (
                            <span
                              key={sc.id}
                              className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full"
                            >
                              {sc.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-gray-600">
                      {s.enrollment_year || '—'}
                    </td>
                    <td className="p-3.5 font-mono text-gray-500">
                      {s.valid_until || 'Annual Pass'}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          s.is_suspended
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {s.is_suspended ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Event Lifecycle Hub (Completed & Upcoming Events Cards) */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-black text-gray-900">Event Lifecycle Hub</h2>
            </div>
            <p className="text-xs text-gray-500">
              Institutional activities organized by this club with participation summaries.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setEventsTab('upcoming')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                eventsTab === 'upcoming'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Upcoming ({upcomingEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setEventsTab('completed')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                eventsTab === 'completed'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed ({completedEvents.length})
            </button>
          </div>
        </div>

        {eventsTab === 'upcoming' ? (
          upcomingEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500 bg-gray-50 rounded-2xl italic">
              No upcoming events scheduled. Create events from Module 2 Activities desk.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50/50 via-white to-gray-50 border border-emerald-200/60 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-full uppercase">
                      Upcoming
                    </span>
                    <span className="text-[11px] font-mono text-gray-500">
                      {evt.event_date}
                    </span>
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm">{evt.title}</h4>
                  <div className="flex items-center space-x-3 text-xs text-gray-600">
                    <span className="capitalize">{evt.category}</span>
                    <span>•</span>
                    <span className="font-semibold text-emerald-700">{evt.mode}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : completedEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500 bg-gray-50 rounded-2xl italic">
            No completed past events recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px] font-black">
                <tr>
                  <th className="p-3.5">Event Title</th>
                  <th className="p-3.5">Event Date</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Mode</th>
                  <th className="p-3.5">Attendees</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {completedEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-gray-50/80">
                    <td className="p-3.5 font-bold text-gray-900">{evt.title}</td>
                    <td className="p-3.5 font-mono text-gray-500">{evt.event_date}</td>
                    <td className="p-3.5 text-gray-600 capitalize">{evt.category}</td>
                    <td className="p-3.5 text-gray-600">{evt.mode}</td>
                    <td className="p-3.5 font-bold text-emerald-700">
                      {evt.attendee_count} attendees
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full">
                        {evt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Interactive Modals (Live Redirection / Verification) */}
      {activeModal && activeModal.type === 'renewal' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
                <AlertTriangle className="h-5 w-5" />
                <span>Club Registration Renewal Alert</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-900 text-sm">
                {activeModal.title}
              </p>
              <p>{activeModal.description}</p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                <div className="font-bold">Next Steps for Renewal:</div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>Verify Patron & President verification signatures.</li>
                  <li>Ensure at least 3 completed events are documented.</li>
                  <li>Submit the annual institutional audit via Module 2.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  if (onNavigateToModule2) {
                    onNavigateToModule2(data.club?.code);
                  } else {
                    window.location.href =
                      data.module_2_url || `/?view=club_module&club=${data.club?.code || ''}`;
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md cursor-pointer flex items-center space-x-1"
              >
                <span>Open Renewal in Module 2</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal && activeModal.type === 'approval' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-700 font-bold text-base">
                <Award className="h-5 w-5" />
                <span>IIT Kharagpur Official Endorsement</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setAcknowledgedNotice(null);
                }}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600">
              <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 text-emerald-950 space-y-2">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <span className="font-black text-sm">Certified Endorsement</span>
                </div>
                <div className="font-bold text-gray-900">{activeModal.title}</div>
                <p className="text-xs text-emerald-900">{activeModal.description}</p>
              </div>
              {activeModal.timestamp && (
                <div className="text-[10px] font-mono text-gray-400">
                  Certified Timestamp: {activeModal.timestamp}
                </div>
              )}

              {acknowledgedNotice && (
                <div className="p-3 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="leading-snug">{acknowledgedNotice}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-[10px] text-gray-400">
                Acknowledge to notify responsible IIT Kharagpur Nodal Officer
              </span>
              <button
                type="button"
                disabled={isAcknowledging || !!acknowledgedNotice}
                onClick={async () => {
                  if (!activeModal) return;
                  setIsAcknowledging(true);
                  try {
                    const res = await acknowledgeOversightSeal({
                      notification_id: activeModal.id,
                      title: activeModal.title,
                      description: activeModal.description,
                    });
                    if (activeModal.id) {
                      markNotificationAsRead(activeModal.id);
                    }
                    broadcastPortalEvent('SEAL_ACKNOWLEDGED', {
                      club_code: data.club?.code,
                      club_name: data.club?.name,
                      officer_emp_id: res.officer_emp_id,
                      notification_id: activeModal.id,
                      title: activeModal.title,
                    });
                    setAcknowledgedNotice(
                      res.message ||
                        `Official Seal acknowledged. Dispatched to IIT Kharagpur Nodal Desk (${res.officer_emp_id || 'Desk'}).`
                    );
                    setTimeout(() => {
                      setActiveModal(null);
                      setIsAcknowledging(false);
                      setAcknowledgedNotice(null);
                    }, 1600);
                  } catch {
                    if (activeModal.id) {
                      markNotificationAsRead(activeModal.id);
                    }
                    setActiveModal(null);
                    setIsAcknowledging(false);
                    setAcknowledgedNotice(null);
                  }
                }}
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-75 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center space-x-2"
              >
                {isAcknowledging ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    <span>Notifying IIT KGP Desk...</span>
                  </>
                ) : acknowledgedNotice ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Dispatched</span>
                  </>
                ) : (
                  <span>Acknowledge Seal</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
