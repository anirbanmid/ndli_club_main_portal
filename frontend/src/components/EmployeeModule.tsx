/**
 * Regional Employee Operations Portal (Tier 3: Regional Nodal Officer Console).
 *
 * Full fidelity reproduction of `templates/employee.html` from `ndli-club-management`:
 * - Complete `.app-shell` layout with `.app-sidebar`, `.app-topbar`, and `.officer-banner`
 * - Live real-time ticking IST clock badge (`⏰ HH:MM:SS IST`)
 * - Active Officer Banner with authentic pills, nodal performance quota cards, and assigned states
 * - Daily Activity (SEC A) with authentic `.form-group` styles and dedicated Bulk Entry Provision
 * - Universal Search & Edit table with client-side searching and CSV export
 * - Node Activity History table with `[Bulk Entry: N Calls]` badge and non-deletable club approval records
 * - Zonal Grievance Redressal and Tracking desk
 * - Zonal Club Approvals desk (auto-triggers registration certificate upon sanction)
 * - Tool Box with 12 regional utilities and PI Digital Signature & Affiliation settings
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ndliClubLogo from '../assets/img/ndli_club_logo.png';
import {
  FileCheck,
  LifeBuoy,
  Trash2,
  Wrench,
} from 'lucide-react';
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

type EmployeeTab = 'activity' | 'search' | 'history' | 'grievances' | 'approvals' | 'toolbox';

export interface EmployeeModuleProps {
  onSignOut?: () => void;
  subRole?: string;
}

const NODAL_OFFICERS: Record<string, { name: string; zone: string; email: string; states: string }> = {
  EMP01: {
    name: 'Rohan Sharma',
    zone: 'North',
    email: 'emp.north@ndli.edu.in',
    states: 'Jammu & Kashmir, Ladakh, Uttarakhand, Himachal Pradesh, Chandigarh, Punjab, Haryana, Delhi, Uttar Pradesh',
  },
  EMP02: {
    name: 'Pooja Verma',
    zone: 'Central',
    email: 'emp.central@ndli.edu.in',
    states: 'Madhya Pradesh, Chhattisgarh',
  },
  EMP03: {
    name: 'Amit Patel',
    zone: 'West',
    email: 'emp.west@ndli.edu.in',
    states: 'Rajasthan, Gujarat, Maharashtra, Goa, Daman and Diu, Dadar & Nagar Haveli',
  },
  EMP04: {
    name: 'Debabrata Ghosh',
    zone: 'East',
    email: 'emp.east@ndli.edu.in',
    states: 'Bihar, Jharkhand, West Bengal, Odisha',
  },
  EMP05: {
    name: 'Mayanglambam Singh',
    zone: 'North East',
    email: 'emp.northeast@ndli.edu.in',
    states: 'Sikkim, Assam, Arunachal Pradesh, Meghalaya, Manipur, Tripura, Nagaland, Mizoram',
  },
  EMP06: {
    name: 'K. Venkatesh',
    zone: 'South 1',
    email: 'emp.south1@ndli.edu.in',
    states: 'Andhra Pradesh, Telangana, Karnataka',
  },
  EMP07: {
    name: 'Ananya Nair',
    zone: 'South 2',
    email: 'emp.south2@ndli.edu.in',
    states: 'Tamil Nadu, Puducherry, Kerala, Andaman & Nicobar Island, Lakshadweep',
  },
};

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export const EmployeeModule: React.FC<EmployeeModuleProps> = ({
  onSignOut,
  subRole = 'EMP01',
}) => {
  const [activeTab, setActiveTab] = useState<EmployeeTab>('activity');

  // Resolved identity
  const currentEmpId = useMemo(() => {
    const raw = (subRole || 'EMP01').toUpperCase();
    return raw.startsWith('EMP') ? raw : 'EMP01';
  }, [subRole]);

  const currentOfficer = useMemo(() => {
    return NODAL_OFFICERS[currentEmpId] || NODAL_OFFICERS.EMP01;
  }, [currentEmpId]);

  // Real-time ticking IST Clock
  const [clockTime, setClockTime] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClockTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Daily Activity Form State ------------------------------------
  const [supportType, setSupportType] = useState<string>('');
  const [callCount, setCallCount] = useState<number>(1);
  const [clubId, setClubId] = useState('');
  const [notes, setNotes] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  // --- Shared Alert / Notice ----------------------------------------
  const [alertMsg, setAlertMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const showAlert = useCallback((text: string, isError = false) => {
    setAlertMsg({ text, isError });
    setTimeout(() => {
      setAlertMsg((cur) => (cur?.text === text ? null : cur));
    }, 6000);
  }, []);

  // --- Activity History State ---------------------------------------
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);

  // --- Universal Search State ---------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [clubRows, setClubRows] = useState<ClubSearchRow[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);

  // --- Grievance Desk State -----------------------------------------
  const [grievances, setGrievances] = useState<GrievanceRow[]>([]);
  const [grievancesLoading, setGrievancesLoading] = useState(false);
  const [grievanceFilter, setGrievanceFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [grievanceBusy, setGrievanceBusy] = useState<string | null>(null);

  // --- Charter Approvals State --------------------------------------
  const [charters, setCharters] = useState<CharterRow[]>([]);
  const [chartersLoading, setChartersLoading] = useState(false);
  const [expandedCharter, setExpandedCharter] = useState<string | null>(null);
  const [charterDetails, setCharterDetails] = useState<Record<string, CharterDetail>>({});
  const [charterBusy, setCharterBusy] = useState<string | null>(null);

  // --- Tool Box / PI Signature State --------------------------------
  const [, setPiSettings] = useState<PISignatureSettings | null>(null);
  const [piAffiliation, setPiAffiliation] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [piBusy, setPiBusy] = useState(false);

  // Load activities
  const loadActivities = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchActivities();
      setRows(data.activities || []);
    } catch {
      showAlert('Unable to load activity logs from server.', true);
    } finally {
      setHistoryLoading(false);
    }
  }, [showAlert]);

  // Load clubs
  const loadClubs = useCallback(async () => {
    setClubsLoading(true);
    try {
      const data = await fetchClubRows();
      setClubRows(data);
    } catch {
      showAlert('Unable to load clubs directory.', true);
    } finally {
      setClubsLoading(false);
    }
  }, [showAlert]);

  // Load grievances
  const loadGrievances = useCallback(async () => {
    setGrievancesLoading(true);
    try {
      const res = await fetchGrievanceQueue();
      setGrievances(res.results);
    } catch {
      // Non-blocking
    } finally {
      setGrievancesLoading(false);
    }
  }, []);

  // Load charters
  const loadCharters = useCallback(async () => {
    setChartersLoading(true);
    try {
      const res = await fetchCharterQueue();
      setCharters(res.results);
    } catch {
      // Non-blocking
    } finally {
      setChartersLoading(false);
    }
  }, []);

  // Load PI signature settings
  const loadPISettings = useCallback(async () => {
    try {
      const data = await fetchPISignatureSettings();
      setPiSettings(data);
      setPiAffiliation(data.pi_affiliation || '');
      if (data.has_signature_image && data.signature_image_url) {
        setSignaturePreview(data.signature_image_url);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    void loadActivities();
    void loadClubs();
    void loadGrievances();
    void loadCharters();
    void loadPISettings();
  }, [loadActivities, loadClubs, loadGrievances, loadCharters, loadPISettings]);

  // Quota counts
  const quota = useMemo(() => {
    let clubsCount = 0;
    let onlineCount = 0;
    let offlineCount = 0;
    let otherSupportCount = 0;

    for (const r of rows) {
      const countVal = Number(r.call_count || 1);
      if (r.is_approval_log || r.support_type.toLowerCase().includes('approval')) {
        clubsCount += 1;
      } else if (r.support_type.toLowerCase().includes('online')) {
        onlineCount += 1;
      } else if (r.support_type.toLowerCase().includes('offline')) {
        offlineCount += 1;
      } else {
        otherSupportCount += countVal;
      }
    }

    return {
      clubs: clubsCount,
      online: onlineCount,
      offline: offlineCount,
      support: otherSupportCount,
    };
  }, [rows]);

  // Submit SEC A support log
  const handleSecASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportType) {
      showAlert('Please select the nature of support provided.', true);
      return;
    }
    setLogBusy(true);
    try {
      const payloadCount = supportType === BULK_TYPE ? Math.max(1, callCount) : 1;
      const res = await logActivity({
        support_type: supportType,
        club_id: clubId.trim() || undefined,
        notes: notes.trim(),
        count: payloadCount,
      });
      showAlert(
        `✓ ${res.message || 'Support activity logged successfully!'} (Added to node database)`
      );
      setSupportType('');
      setCallCount(1);
      setClubId('');
      setNotes('');
      await loadActivities();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to record activity log.';
      showAlert(msg, true);
    } finally {
      setLogBusy(false);
    }
  };

  // Delete activity records
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const deletableIds = Array.from(selected).filter((id) => {
      const row = rows.find((r) => r.activity_id === id);
      return row && !row.is_approval_log;
    });

    if (deletableIds.length === 0) {
      showAlert('Club approval records are permanently locked and cannot be deleted.', true);
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete ${deletableIds.length} selected activity record(s)?`
      )
    ) {
      return;
    }

    setDeleteBusy(true);
    try {
      const res = await deleteActivities({
        emp_id: currentEmpId,
        activity_ids: deletableIds,
      });
      showAlert(`✓ Deleted ${res.deleted_count ?? deletableIds.length} activity record(s).`);
      setSelected(new Set());
      await loadActivities();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete activity entries.';
      showAlert(msg, true);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteSingle = async (row: ActivityRow) => {
    if (row.is_approval_log) {
      showAlert('Club approval records are permanently locked and cannot be deleted.', true);
      return;
    }
    if (!window.confirm('Delete this activity entry?')) return;
    setDeleteBusy(true);
    try {
      await deleteActivities({
        emp_id: currentEmpId,
        activity_ids: [row.activity_id],
      });
      showAlert('✓ Activity entry deleted successfully.');
      await loadActivities();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete activity entry.';
      showAlert(msg, true);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Filtered universal search clubs
  const filteredClubs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clubRows;
    return clubRows.filter((c) => {
      const id = (c.club_id || '').toLowerCase();
      const inst = (c.institution_name || '').toLowerCase();
      const st = (c.state || '').toLowerCase();
      const zn = (c.zone || '').toLowerCase();
      return id.includes(q) || inst.includes(q) || st.includes(q) || zn.includes(q);
    });
  }, [clubRows, searchQuery]);

  // Filtered grievances
  const filteredGrievances = useMemo(() => {
    if (grievanceFilter === 'all') return grievances;
    if (grievanceFilter === 'resolved') {
      return grievances.filter((g) => g.status === 'resolved');
    }
    return grievances.filter((g) => g.status !== 'resolved');
  }, [grievances, grievanceFilter]);

  // Handle grievance resolution
  const handleResolveGrievance = async (ticketId: string) => {
    const resolution = window.prompt('Enter resolution summary / closing remarks for this grievance:');
    if (!resolution) return;
    setGrievanceBusy(ticketId);
    try {
      await resolveGrievance(ticketId, { decision: 'resolved', reason: resolution });
      showAlert('✓ Grievance resolved and marked closed.');
      await loadGrievances();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to resolve grievance.';
      showAlert(msg, true);
    } finally {
      setGrievanceBusy(null);
    }
  };

  // Expand charter details
  const toggleCharterDetails = async (appId: string) => {
    if (expandedCharter === appId) {
      setExpandedCharter(null);
      return;
    }
    setExpandedCharter(appId);
    if (!charterDetails[appId]) {
      try {
        const detail = await fetchCharter(appId);
        setCharterDetails((prev) => ({ ...prev, [appId]: detail }));
      } catch {
        showAlert('Unable to load charter application details.', true);
      }
    }
  };

  // Decide charter sanction / reject
  const handleDecideCharter = async (appId: string, decision: CharterDecision) => {
    const reason =
      decision === 'reject'
        ? window.prompt('Reason for rejection (sent to institution):')
        : 'Sanctioned by Zonal Officer under standard charter guidelines.';
    if (decision === 'reject' && !reason) return;

    setCharterBusy(appId);
    try {
      await decideCharter(appId, { decision, reason: reason || undefined });
      showAlert(
        decision === 'sanction'
          ? '✓ Charter sanctioned! Club materialised and registration certificate generated.'
          : '✓ Charter application rejected.'
      );
      setExpandedCharter(null);
      await loadCharters();
      await loadClubs();
      await loadActivities();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Charter decision failed.';
      showAlert(msg, true);
    } finally {
      setCharterBusy(null);
    }
  };

  // Save PI Signature settings
  const handleSavePISettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPiBusy(true);
    try {
      const res = await savePISignatureSettings(piAffiliation.trim(), signatureFile || undefined);
      showAlert('✓ PI Signature and Affiliation settings updated successfully.');
      setPiSettings(res);
      setSignatureFile(null);
      if (res.signature_image_url) {
        setSignaturePreview(res.signature_image_url);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save PI Signature settings.';
      showAlert(msg, true);
    } finally {
      setPiBusy(false);
    }
  };

  const openReminders = useMemo(() => {
    return grievances.filter((g) => g.status === 'open').length;
  }, [grievances]);

  const pendingApprovals = useMemo(() => {
    return charters.filter((c) => c.status === 'queued' || c.status === 'under_review').length;
  }, [charters]);

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', background: 'var(--c-bg, #F4F8F6)' }}>
      {/* 1. LEFT SIDEBAR */}
      <aside className="app-sidebar" id="app-sidebar" style={{ width: '280px', flexShrink: 0 }}>
        <div className="brand">
          <div className="brand-logo-card">
            <img
              src={ndliClubLogo}
              alt="NDLI Club Logo"
              className="brand-logo-img"
            />
          </div>
          <div className="brand-text">
            <h1>NDLI Club Employee Portal</h1>
            <p>Activity Tracker &amp; Club Approval System • NDLI IIT Kharagpur</p>
          </div>
        </div>

        <div className="side-caption">Workspace</div>
        <div className="tabs" role="tablist" aria-label="Employee portal sections">
          <button
            className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
            title="Daily Activity Tracker (SEC A)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
              <path d="M9 4.5h6v2.6H9z" />
              <path d="M8.8 12.2l2.1 2.1 4.3-4.4" />
            </svg>
            Daily Activity
          </button>

          <button
            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            title="Universal Club Search & Edit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l5 5" />
            </svg>
            Universal Search
          </button>

          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            title="My Node Activity History"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.2V12l3.3 2" />
            </svg>
            Activity History
          </button>

          <button
            className={`tab-btn ${activeTab === 'grievances' ? 'active' : ''}`}
            onClick={() => setActiveTab('grievances')}
            title="Zonal Grievance Redressal Desk"
          >
            <LifeBuoy className="h-4 w-4 mr-1 text-emerald-700" />
            Grievance Desk
            {openReminders > 0 && <span className="side-count" style={{ background: '#BE123C', color: '#fff' }}>{openReminders}</span>}
          </button>

          <button
            className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActiveTab('approvals')}
            title="Zonal Club Approvals"
          >
            <FileCheck className="h-4 w-4 mr-1 text-amber-700" />
            Club Approvals
            {pendingApprovals > 0 && <span className="side-count" style={{ background: '#D97706', color: '#fff' }}>{pendingApprovals}</span>}
          </button>

          <button
            className={`tab-btn ${activeTab === 'toolbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('toolbox')}
          >
            <Wrench className="h-4 w-4 mr-1 text-teal-700" />
            🧰 Tool Box
          </button>
        </div>

        <div className="side-caption">Attention</div>
        <button
          type="button"
          className="side-link"
          onClick={() => setActiveTab('grievances')}
          title="Open due issue reminders list"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
          Reminders
          <span className="side-count" id="side-count-reminders">
            {openReminders}
          </span>
        </button>

        <div className="side-caption">Portals &amp; Tools</div>
        <a
          href="https://ndl.iitkgp.ac.in"
          className="side-link nav-link"
          target="_blank"
          rel="noopener noreferrer"
          title="Visit Official National Digital Library of India Portal"
        >
          <span>🏛️</span> NDLI Main Site ↗
        </a>
        <a
          href="/api/download/user-manual"
          className="side-link nav-link"
          target="_blank"
          rel="noopener noreferrer"
          title="Download Official NDLI User Manual (PDF)"
        >
          <span>📖</span> User Manual
        </a>
        {onSignOut && (
          <button
            type="button"
            className="side-link"
            onClick={onSignOut}
            style={{ color: '#BE123C', cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            <span>🚪</span> Sign Out Session
          </button>
        )}

        <div className="side-spacer" />
        <div className="side-promo">
          <div className="k">TOOL BOX</div>
          <div className="v">Regional Officer Tools</div>
          <div className="d">
            The 12 regional utilities — support ticketing, official mail, cloud drives and office tools — open from the Tool Box tab.
          </div>
          <div className="side-promo-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setActiveTab('toolbox')}
            >
              Open Tool Box
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WORKSPACE */}
      <div className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header className="app-topbar">
          <div className="app-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l5 5" />
            </svg>
            <input
              type="text"
              id="topbar-search"
              placeholder="Search clubs, officers, issues…"
              aria-label="Search clubs, officers, issues"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (activeTab !== 'search') setActiveTab('search');
              }}
            />
            <span className="kbd">⌘ K</span>
          </div>

          <div className="top-right">
            <div className="top-chip plain">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="5" width="16" height="15" rx="2.5" />
                <path d="M8 3v4M16 3v4M4 10h16" />
              </svg>
              <span>Oct 2026</span>
            </div>

            <div className="live-clock-badge nav-live-clock-compact" title="National Standard System Clock (IST)">
              <span>⏰ {clockTime || '--:--:--'} IST</span>
            </div>

            <div
              className="badge-tag"
              style={{
                background: '#E2F0FB',
                color: '#1E5F8C',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '0.76rem',
              }}
            >
              {currentEmpId} ({currentOfficer.zone} Zone)
            </div>

            <div
              className="avatar"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--primary, #1A503E)',
                color: '#ffffff',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.78rem',
              }}
            >
              {currentEmpId.slice(0, 2)}
            </div>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="btn btn-outline btn-sm"
                title="Sign out of current node"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.76rem' }}
              >
                Sign Out
              </button>
            )}
          </div>
        </header>

        {/* Container */}
        <main className="container" style={{ padding: '1.25rem 1.75rem', flex: 1 }}>
          {/* Active Officer Banner */}
          <div className="officer-banner">
            <div className="officer-details" style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                <span className="pill pill-primary" id="current-emp-id">{currentEmpId}</span>
                <span className="pill pill-success" id="current-zone">{currentOfficer.zone} Zone</span>
                <span className="pill pill-priority" title="Priority Quota Tracked">★ Quota Active</span>
                <span className="pill" style={{ background: '#E2F0FB', color: '#1E5F8C', fontWeight: 600 }}>● Verified Session</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  [Node: <strong style={{ color: 'var(--primary)' }}>{currentEmpId}</strong>]
                </span>
              </div>
              <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.15rem 0', color: 'var(--primary)' }}>
                {currentOfficer.name}
              </h2>
              <p style={{ fontSize: '0.74rem', margin: 0, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                <strong>Assigned States:</strong> {currentOfficer.states}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.15rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right', borderRight: '1px solid var(--border)', paddingRight: '0.75rem' }}>
                <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-light)', fontWeight: 700 }}>
                  Performance Quota
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.028em', color: 'var(--primary)', lineHeight: 1.1 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--success)' }}>{quota.clubs}</span>{' '}
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Clubs</span>
                  </span>
                  <span style={{ margin: '0 0.2rem', color: 'var(--border)' }}>|</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--primary)' }}>{quota.online}</span>{' '}
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Online</span>
                  </span>
                  <span style={{ margin: '0 0.2rem', color: 'var(--border)' }}>|</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--primary)' }}>{quota.offline}</span>{' '}
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Offline</span>
                  </span>
                  <span style={{ margin: '0 0.2rem', color: 'var(--border)' }}>|</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--warning)' }}>{quota.support}</span>{' '}
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Other Support</span>
                  </span>
                </div>
              </div>

              <div className="live-clock-badge" style={{ padding: '0.3rem 0.6rem', fontSize: '0.83rem' }}>
                <span>⏰ {clockTime || '--:--:--'}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => window.open(getActivityExportUrl(), '_blank')}
                  title="Download a copy of activity_log.csv from this employee account database"
                  style={{ fontWeight: 600, padding: '0.28rem 0.55rem', fontSize: '0.86rem' }}
                >
                  Activity Log
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => window.open(getClubsExportUrl(), '_blank')}
                  title="Download a copy of clubs.csv from this employee account database"
                  style={{ fontWeight: 600, padding: '0.28rem 0.55rem', fontSize: '0.86rem' }}
                >
                  Clubs Log
                </button>
              </div>
            </div>
          </div>

          {/* Alert Container */}
          {alertMsg && (
            <div
              id="global-alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 600,
                background: alertMsg.isError ? 'var(--c-red-soft, #FDE7EA)' : 'var(--c-green-soft, #D9EFE4)',
                border: alertMsg.isError ? '1px solid var(--c-red-ink, #9F1239)' : '1px solid var(--c-green, #0D7751)',
                color: alertMsg.isError ? 'var(--c-red-ink, #9F1239)' : 'var(--c-green-deep, #0A5C3E)',
              }}
            >
              {alertMsg.text}
            </div>
          )}

          {/* TAB 1: DAILY ACTIVITY TRACKER */}
          {activeTab === 'activity' && (
            <div className="tab-panel active" id="tab-activity">
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
                {/* SEC A: Support Log Form */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">SEC A: Daily Support Log</h3>
                      <p className="card-subtitle">Real-time logging with automated date &amp; time capture. Can be logged multiple times daily.</p>
                    </div>
                    <span className="pill pill-primary">SEC A</span>
                  </div>

                  <form onSubmit={handleSecASubmit}>
                    <div className="form-group">
                      <label htmlFor="support-type" className="label-required">Nature of Support Provided</label>
                      <select
                        id="support-type"
                        required
                        value={supportType}
                        onChange={(e) => setSupportType(e.target.value)}
                      >
                        <option value="">-- Select nature of support --</option>
                        {SEC_A_TYPES.map((st, i) => (
                          <option key={st} value={st}>
                            {i + 1}) {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Bulk Entry Provision for Phone Call & Remote Assistance ONLY */}
                    {supportType === BULK_TYPE && (
                      <div
                        id="bulk-calls-group"
                        style={{
                          background: 'var(--c-tint-2, #F0F8F4)',
                          border: '1px solid var(--c-green-soft, #D9EFE4)',
                          borderRadius: '8px',
                          padding: '1.25rem 1.5rem',
                          marginBottom: '1.15rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label
                            htmlFor="support-count"
                            style={{ fontWeight: 700, color: 'var(--c-green-deep, #0A5C3E)', margin: 0, fontSize: '0.88rem' }}
                          >
                            📞 Bulk Entry: Total Number of Calls / Remote Assistance
                          </label>
                          <span
                            className="pill pill-success"
                            style={{ fontSize: '0.8rem', padding: '2px 7px', background: '#D9EFE4', color: '#0A5C3E', border: '1px solid var(--c-green-soft, #D9EFE4)' }}
                          >
                            Bulk Entry Facility
                          </span>
                        </div>
                        <p style={{ color: 'var(--c-green-deep, #0A5C3E)', fontSize: '0.86rem', margin: '0 0 0.5rem 0', lineHeight: 1.35 }}>
                          Attended multiple calls or remote sessions one after another? Enter the total number below to log them in bulk at once into your activity history and quota.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <input
                            type="number"
                            id="support-count"
                            min="1"
                            max="100"
                            value={callCount}
                            onChange={(e) => setCallCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            style={{
                              width: '110px',
                              border: '1px solid var(--c-green-soft, #D9EFE4)',
                              borderRadius: '6px',
                              padding: '0.45rem 0.65rem',
                              fontWeight: 700,
                              fontSize: '1rem',
                              background: '#ffffff',
                              color: 'var(--c-ink-2, #2E4A3E)',
                            }}
                          />
                          <span style={{ fontSize: '0.82rem', color: 'var(--c-green-deep, #0A5C3E)', fontWeight: 600 }}>
                            Total calls attended in batch
                          </span>
                        </div>
                        <small style={{ display: 'block', color: 'var(--c-green-deep, #0A5C3E)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                          * Note: This bulk entry facility is available exclusively for Phone Call and Remote Assistance.
                        </small>
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="support-club-id">Related Club ID (Optional)</label>
                      <input
                        type="text"
                        id="support-club-id"
                        placeholder="e.g., 2051"
                        inputMode="numeric"
                        value={clubId}
                        onChange={(e) => setClubId(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="support-notes">Support Notes / OS Ticket # / Remarks</label>
                      <textarea
                        id="support-notes"
                        rows={2}
                        placeholder="Enter institution name, ticket resolution summary, or participant count..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      id="btn-submit-sec-a"
                      disabled={logBusy || !supportType}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {logBusy ? (
                        <span>Logging Activity…</span>
                      ) : (
                        <span>✓ Log Support Activity (Real-Time)</span>
                      )}
                    </button>
                  </form>
                </div>

                {/* Information Card */}
                <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">Zonal Operational Directives</h3>
                      <p className="card-subtitle">Guidelines for logging daily activities and quota accounting.</p>
                    </div>
                    <span className="pill pill-success">Nodal Mandate</span>
                  </div>

                  <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <p>
                      <strong>1. Real-Time Activity Capture:</strong> Every phone interaction, helpdesk resolution, and online/offline workshop must be recorded promptly. Consolidated batch logging should be utilized when attending back-to-back phone calls.
                    </p>
                    <p>
                      <strong>2. Club Approval Workflow:</strong> Club approvals are securely channeled through the modern <em>Zonal Club Approvals Desk</em>. Upon sanctioning a charter application, the system automatically mints the official registration certificate and logs a non-deletable approval record into your activity feed.
                    </p>
                    <p>
                      <strong>3. Zonal Helpdesk Redressal:</strong> Grievance tickets assigned to your operational states are triaged under the <em>Grievance Desk</em>. All ticket resolutions synchronize directly with the central IIT Kharagpur administrative ledger.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UNIVERSAL SEARCH & EDIT */}
          {activeTab === 'search' && (
            <div className="tab-panel active" id="tab-search">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Universal Club Search &amp; Edit</h3>
                    <p className="card-subtitle">Search existing NDLI clubs by ANY field (Club ID, Reg No, Name, State, Emails). Click a result to view details.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={loadClubs}>
                      Refresh All
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => window.open(getClubsExportUrl(), '_blank')}
                      title="Download a copy of clubs.csv from database"
                    >
                      Download Clubs Log
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.15rem', marginBottom: '1.25rem' }}>
                  <input
                    type="text"
                    id="search-input"
                    aria-label="Search clubs"
                    placeholder="Search by institution name, club ID, state, zone, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={() => {}}>
                    Search
                  </button>
                </div>

                <div className="table-responsive table-scroll-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Club ID</th>
                        <th>Registration No</th>
                        <th>Institution Name</th>
                        <th>State</th>
                        <th>Zone</th>
                        <th>Date of Approval</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody id="search-results-tbody">
                      {clubsLoading ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading clubs database...
                          </td>
                        </tr>
                      ) : filteredClubs.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            No clubs found matching search query.
                          </td>
                        </tr>
                      ) : (
                        filteredClubs.map((c) => {
                          const cid = c.club_id || '—';
                          return (
                            <tr key={cid}>
                              <td>
                                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{cid}</span>
                              </td>
                              <td>
                                <span className="pill" style={{ background: '#E2F0FB', color: '#1E5F8C', fontSize: '0.74rem' }}>
                                  NDLI/CLUB/{cid}
                                </span>
                              </td>
                              <td>
                                <strong style={{ color: 'var(--c-ink-2)' }}>{c.institution_name || '—'}</strong>
                              </td>
                              <td>{c.state || '—'}</td>
                              <td>
                                <span className="pill pill-success">{c.zone || '—'}</span>
                              </td>
                              <td>{formatDate(c.date_of_approval)}</td>
                              <td>
                                <span
                                  className="pill"
                                  style={{
                                    background: 'var(--c-green-soft)',
                                    color: 'var(--c-green-deep)',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  active
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => {
                                    setClubId(cid);
                                    setActiveTab('activity');
                                  }}
                                  title="Log support activity for this club"
                                  style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                                >
                                  Log Activity
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NODE ACTIVITY HISTORY */}
          {activeTab === 'history' && (
            <div className="tab-panel active" id="tab-history">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Recent Activity Logs (Node Database)</h3>
                    <p className="card-subtitle">Real-time activity records dual-written to node activity database.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={loadActivities}>
                      Refresh Logs
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => window.open(getActivityExportUrl(), '_blank')}
                      title="Download a copy of activity_log.csv"
                    >
                      Download Activity Log
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      id="btn-bulk-delete-activities"
                      onClick={handleDeleteSelected}
                      disabled={selected.size === 0 || deleteBusy}
                      style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                    >
                      🗑 Delete Selected ({selected.size})
                    </button>
                  </div>
                </div>

                <div className="table-responsive table-scroll-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '2.2rem' }}>
                          <input
                            type="checkbox"
                            checked={selected.size > 0 && selected.size === rows.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelected(new Set(rows.map((r) => r.activity_id)));
                              } else {
                                setSelected(new Set());
                              }
                            }}
                            title="Select all"
                          />
                        </th>
                        <th>Date &amp; Time (Local)</th>
                        <th>Activity ID</th>
                        <th>Nature of Support</th>
                        <th>Priority</th>
                        <th>Club Ref</th>
                        <th>Notes / Remarks</th>
                        <th style={{ width: '3rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody id="activities-tbody">
                      {historyLoading ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading activity history...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            No activity entries recorded yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => {
                          const isBulk = Number(r.call_count || 1) > 1;
                          return (
                            <tr key={r.activity_id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selected.has(r.activity_id)}
                                  onChange={(e) => {
                                    const next = new Set(selected);
                                    if (e.target.checked) next.add(r.activity_id);
                                    else next.delete(r.activity_id);
                                    setSelected(next);
                                  }}
                                />
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatStamp(r.timestamp)}</td>
                              <td>
                                <code style={{ fontSize: '0.74rem' }}>{r.activity_id.slice(0, 8)}</code>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <span>{r.support_type}</span>
                                  {isBulk && (
                                    <span
                                      className="pill pill-success"
                                      style={{ fontSize: '0.72rem', padding: '1px 6px' }}
                                    >
                                      Bulk Entry: {r.call_count} Calls
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {r.is_approval_log ? (
                                  <span className="pill pill-warning">★ Priority</span>
                                ) : (
                                  <span className="pill pill-primary">Normal</span>
                                )}
                              </td>
                              <td>
                                {r.club_id ? (
                                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.club_id}</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.notes || '—'}
                              </td>
                              <td>
                                {r.is_approval_log ? (
                                  <span title="Club approval records are permanently locked." style={{ color: 'var(--text-muted)', cursor: 'not-allowed' }}>
                                    🔒
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSingle(r)}
                                    title="Delete activity record"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BE123C' }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OPERATIONAL TOOL BOX */}
          {activeTab === 'toolbox' && (
            <div className="tab-panel active" id="tab-toolbox">
              <div className="card" style={{ borderTop: '4px solid var(--primary)', marginBottom: '1.5rem' }}>
                <div className="card-header" style={{ marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                      <span className="pill pill-success" style={{ fontWeight: 700 }}>Zonal Operations Hub</span>
                      <span className="pill pill-primary">12 Integrated Utilities</span>
                    </div>
                    <h3 className="card-title" style={{ fontSize: '1.35rem', color: 'var(--primary)' }}>
                      🧰 Regional Officer Operational Tool Box
                    </h3>
                    <p className="card-subtitle">
                      Single-click access to support ticketing (osTicket), official email, video conferencing, cloud storage, collaborative documents, spreadsheets, presentations, notes, official YouTube channel, and broadcasting platforms for regional NDLI club operations.
                    </p>
                  </div>
                </div>
              </div>

              {/* 12 Utility Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
                {/* 1. osTicket */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill" style={{ background: '#ffedd5', color: '#c2410c', fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Club Support Helpdesk
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>osTicket</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Official NDLI Club Helpdesk for tracking, resolving, and closing institutional support tickets.
                    </p>
                  </div>
                  <a
                    href="https://club-support.ndl.gov.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>🎫</span> Launch osTicket Helpdesk ↗
                  </a>
                </div>

                {/* 2. Gmail */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-danger" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Official Communications
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>Gmail</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Manage official zonal correspondence, club communications, and institutional notifications.
                    </p>
                  </div>
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>✉️</span> Launch Gmail ↗
                  </a>
                </div>

                {/* 3. Google Meet */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-success" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Online Training &amp; Meetings
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>Google Meet</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Conduct 1-on-1 remote assistance, screen sharing, and online club onboarding sessions.
                    </p>
                  </div>
                  <a
                    href="https://meet.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>📹</span> Launch Google Meet ↗
                  </a>
                </div>

                {/* 4. Google Drive */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-warning" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Database &amp; Storage Mirror
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>Google Drive</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Direct cloud repository access for synchronized CSV databases, institutional MoUs, and club logos.
                    </p>
                  </div>
                  <a
                    href="https://drive.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>📁</span> Launch Google Drive ↗
                  </a>
                </div>

                {/* 5. Google Docs */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill" style={{ background: '#E2F0FB', color: '#1E5F8C', fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Documentation &amp; Minutes
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>Google Docs</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Draft meeting minutes, event summaries, official correspondence, and administrative circulars.
                    </p>
                  </div>
                  <a
                    href="https://docs.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>📄</span> Launch Google Docs ↗
                  </a>
                </div>

                {/* 6. Google Sheets */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-success" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Data Analysis &amp; Roster
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>Google Sheets</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Open spreadsheets to inspect regional club rosters, participant attendance lists, and metrics.
                    </p>
                  </div>
                  <a
                    href="https://sheets.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>📊</span> Launch Google Sheets ↗
                  </a>
                </div>

                {/* 7. YouTube */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-danger" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      Video Tutorials &amp; Live Stream
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>YouTube</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Official NDLI Club YouTube channel for tutorial recordings, webinar archives, and training sessions.
                    </p>
                  </div>
                  <a
                    href="https://www.youtube.com/@ndli_club"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>▶️</span> NDLI YouTube Channel ↗
                  </a>
                </div>

                {/* 8. NDLI Main Site */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pill pill-primary" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                      National Knowledge Asset
                    </span>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0.2rem 0' }}>NDLI Main Portal</h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      Direct link to the National Digital Library of India official national repository.
                    </p>
                  </div>
                  <a
                    href="https://ndl.iitkgp.ac.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <span>🏛️</span> Visit NDLI Portal ↗
                  </a>
                </div>
              </div>

              {/* PI Digital Signature & Affiliation Settings */}
              <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
                <div className="card-header">
                  <div>
                    <h3 className="card-title">✍️ Project Investigator (PI) Digital Signature &amp; Affiliation</h3>
                    <p className="card-subtitle">
                      Configure the official digital signature and affiliation rendered on registration certificates and renewal letters.
                    </p>
                  </div>
                  <span className="pill pill-warning">Official Credential</span>
                </div>

                <form onSubmit={handleSavePISettings} style={{ maxWidth: '640px' }}>
                  <div className="form-group">
                    <label htmlFor="pi-affiliation-input" className="label-required">
                      Project Investigator Affiliation &amp; Designation
                    </label>
                    <input
                      type="text"
                      id="pi-affiliation-input"
                      required
                      placeholder="e.g. Professor, Computer Science & Engineering, IIT Kharagpur"
                      value={piAffiliation}
                      onChange={(e) => setPiAffiliation(e.target.value)}
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem', display: 'block' }}>
                      Appears beneath the PI digital signature on minted certificates.
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pi-sig-file">Upload Digital Signature (PNG format recommended)</label>
                    <input
                      type="file"
                      id="pi-sig-file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSignatureFile(file);
                        if (file) {
                          setSignaturePreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </div>

                  {signaturePreview && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#ffffff', border: '1px dashed var(--border)', borderRadius: '8px', display: 'inline-block' }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                        Active Signature Preview:
                      </span>
                      <img
                        src={signaturePreview}
                        alt="PI Digital Signature"
                        style={{ maxHeight: '70px', maxWidth: '240px', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={piBusy || !piAffiliation.trim()}
                    >
                      {piBusy ? <span>Saving Settings…</span> : <span>Save Signature &amp; Affiliation</span>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: ZONAL GRIEVANCE DESK */}
          {activeTab === 'grievances' && (
            <div className="tab-panel active" id="tab-grievances">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Zonal Grievance Redressal &amp; Tracking Desk</h3>
                    <p className="card-subtitle">
                      Manage, track and resolve institutional issue tickets submitted across your assigned states.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <button
                      className={`btn btn-sm ${grievanceFilter === 'open' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setGrievanceFilter('open')}
                    >
                      Open Only
                    </button>
                    <button
                      className={`btn btn-sm ${grievanceFilter === 'resolved' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setGrievanceFilter('resolved')}
                    >
                      Resolved
                    </button>
                    <button
                      className={`btn btn-sm ${grievanceFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setGrievanceFilter('all')}
                    >
                      All Tickets
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={loadGrievances}>
                      ↻ Refresh
                    </button>
                  </div>
                </div>

                <div className="table-responsive table-scroll-container" style={{ maxHeight: '440px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>Club / Institution</th>
                        <th>Subject</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grievancesLoading ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading grievance tickets...
                          </td>
                        </tr>
                      ) : filteredGrievances.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            No grievance tickets in this view.
                          </td>
                        </tr>
                      ) : (
                        filteredGrievances.map((g) => (
                          <tr key={g.id}>
                            <td>
                              <code>{g.id.slice(0, 8)}</code>
                            </td>
                            <td>
                              <strong style={{ color: 'var(--primary)' }}>{g.club_id}</strong>
                            </td>
                            <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {g.subject}
                            </td>
                            <td>{formatDate(g.created_at)}</td>
                            <td>
                              <span
                                className="pill"
                                style={{
                                  background: g.status === 'resolved' ? 'var(--c-green-soft)' : 'var(--c-amber-soft)',
                                  color: g.status === 'resolved' ? 'var(--c-green-deep)' : 'var(--c-amber-ink)',
                                }}
                              >
                                {g.status}
                              </span>
                            </td>
                            <td>
                              {g.status !== 'resolved' ? (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  disabled={grievanceBusy === g.id}
                                  onClick={() => handleResolveGrievance(g.id)}
                                  style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                                >
                                  Resolve
                                </button>
                              ) : (
                                <span style={{ color: 'var(--success)', fontSize: '0.78rem', fontWeight: 600 }}>Closed</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: ZONAL CLUB APPROVALS */}
          {activeTab === 'approvals' && (
            <div className="tab-panel active" id="tab-approvals">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Zonal Institutional Charter Sanction Gate</h3>
                    <p className="card-subtitle">
                      Review submitted charter applications, inspect institutional MoUs and appoint authority assignments. Sanctioning triggers automatic club materialisation and mints the official NDLI Club Registration Certificate.
                    </p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={loadCharters}>
                    ↻ Refresh Queue
                  </button>
                </div>

                <div className="table-responsive table-scroll-container" style={{ maxHeight: '440px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Application ID</th>
                        <th>Institution Name</th>
                        <th>Club Name</th>
                        <th>State / Zone</th>
                        <th>Submitted At</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartersLoading ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading charter applications queue...
                          </td>
                        </tr>
                      ) : charters.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            No pending charter applications in your assigned zonal queue.
                          </td>
                        </tr>
                      ) : (
                        charters.map((c) => (
                          <React.Fragment key={c.id}>
                            <tr>
                              <td>
                                <code>{c.id.slice(0, 8)}</code>
                              </td>
                              <td>
                                <strong style={{ color: 'var(--c-ink-2)' }}>{c.institution_name}</strong>
                              </td>
                              <td>{c.club_name}</td>
                              <td>
                                {c.state_code} / <span className="pill pill-success">{c.zone_code}</span>
                              </td>
                              <td>{formatDate(c.submitted_at)}</td>
                              <td>
                                <span
                                  className="pill"
                                  style={{
                                    background:
                                      c.status === 'sanctioned'
                                        ? 'var(--c-green-soft)'
                                        : c.status === 'rejected'
                                        ? 'var(--c-red-soft)'
                                        : 'var(--c-amber-soft)',
                                    color:
                                      c.status === 'sanctioned'
                                        ? 'var(--c-green-deep)'
                                        : c.status === 'rejected'
                                        ? 'var(--c-red-ink)'
                                        : 'var(--c-amber-ink)',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {c.status}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => toggleCharterDetails(c.id)}
                                  style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                                >
                                  {expandedCharter === c.id ? 'Hide Details' : 'Review Charter'}
                                </button>
                              </td>
                            </tr>

                            {expandedCharter === c.id && (
                              <tr>
                                <td colSpan={7} style={{ background: '#f8faf9', padding: '1rem 1.5rem', borderLeft: '4px solid var(--primary)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                                      Charter Review: {c.institution_name} — {c.club_name}
                                    </h4>

                                    {charterDetails[c.id] ? (
                                      <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                          <div>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Assigned Authorities:</span>
                                            {charterDetails[c.id].authorities.map((a) => (
                                              <div key={a.role} style={{ fontSize: '0.82rem' }}>
                                                <strong>{a.role}:</strong> {a.full_name} ({a.email})
                                              </div>
                                            ))}
                                          </div>
                                          <div>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Uploaded Documents:</span>
                                            {charterDetails[c.id].uploads.map((u) => (
                                              <div key={u.original_name} style={{ fontSize: '0.82rem' }}>
                                                📄 {u.original_name} ({Math.round(u.size_bytes / 1024)} KB)
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        {c.status === 'queued' || c.status === 'under_review' ? (
                                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                            <button
                                              type="button"
                                              className="btn btn-primary btn-sm"
                                              disabled={charterBusy === c.id}
                                              onClick={() => handleDecideCharter(c.id, 'sanction')}
                                            >
                                              ⚡ Sanction Charter &amp; Mint Registration Certificate
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-outline btn-sm"
                                              disabled={charterBusy === c.id}
                                              onClick={() => handleDecideCharter(c.id, 'reject')}
                                              style={{ color: '#be123c', borderColor: '#fecaca' }}
                                            >
                                              ✕ Reject Charter
                                            </button>
                                          </div>
                                        ) : (
                                          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                            Charter was reviewed on {formatDate(c.reviewed_at)} ({c.status}).
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div>Loading charter credentials…</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
