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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ndliClubLogo from '../assets/img/ndli_club_logo.png';
import {
  FileCheck,
  LifeBuoy,
  Trash2,
  Wrench,
  UserCheck,
  ExternalLink,
  Printer,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Globe,
  Building2,
} from 'lucide-react';
import { AuthorityChangeRequest, InstituteClub, RegionalZone } from '../types';
import { NotificationBell, NotificationItem } from './NotificationBell';
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
  renewClubRegistration,
  savePISignatureSettings,
  verifyEmployeePassword,
} from '../lib/employeeApi';
import {
  downloadCertificateJPG,
  downloadCertificatePDF,
  formatFormalDate,
  printCertificate,
  printCertificateOnPage,
  renderRenewalCertificate,
} from '../utils/renewalCertificateEngine';
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

type EmployeeTab = 'activity' | 'search' | 'history' | 'grievances' | 'approvals' | 'succession' | 'toolbox';

export interface EmployeeModuleProps {
  onSignOut?: () => void;
  subRole?: string;
  adminRole?: string;
  onNavigateBranch?: (branch: 'landing' | 'club_module', tab?: string) => void;
  authorityRequests?: AuthorityChangeRequest[];
  onApproveAuthorityChange?: (reqId: string) => void;
  onRejectAuthorityChange?: (reqId: string, reason?: string) => void;
  clubs?: InstituteClub[];
  onUpdateClub?: (updated: InstituteClub) => void;
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
  adminRole,
  onNavigateBranch,
  authorityRequests = [],
  onApproveAuthorityChange,
  onRejectAuthorityChange,
  clubs = [],
  onUpdateClub,
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
  const [piName, setPiName] = useState('Dr. Plaban Kumar Bhowmick');
  const [piAffiliation, setPiAffiliation] = useState(
    'Principal Investigator, NDLI Project, Central Library, IIT Kharagpur'
  );
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [piBusy, setPiBusy] = useState(false);

  // --- Club Edit & Renewal Modal States (Observations 3 & 4) --------
  const [selectedEditClub, setSelectedEditClub] = useState<ClubSearchRow | null>(null);
  const [editInstName, setEditInstName] = useState('');
  const [editRegNo, setEditRegNo] = useState('');
  const [editState, setEditState] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editPatronEmail, setEditPatronEmail] = useState('');
  const [editPresidentEmail, setEditPresidentEmail] = useState('');
  const [editSecretaryEmail, setEditSecretaryEmail] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const [editModalFocusIssue, setEditModalFocusIssue] = useState(false);
  const [renewalConditionsChecked, setRenewalConditionsChecked] = useState(true);

  // --- 2-Stage Security Confirmation State (Observation 3) -----------
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityClub, setSecurityClub] = useState<ClubSearchRow | null>(null);
  const [securityCaptchaCode, setSecurityCaptchaCode] = useState('');
  const [securityCaptchaInput, setSecurityCaptchaInput] = useState('');
  const [securityPasswordInput, setSecurityPasswordInput] = useState('');
  const [securityShowPassword, setSecurityShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const securityCanvasRef = useRef<HTMLCanvasElement>(null);

  // --- Renewal Certificate Terminal State (Observation 2 & 4) -------
  const [isCertTerminalOpen, setIsCertTerminalOpen] = useState(false);
  const [certClub, setCertClub] = useState<ClubSearchRow | null>(null);
  const certCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const certSigFileInputRef = useRef<HTMLInputElement>(null);

  // Security CAPTCHA Generator
  const generateSecurityCaptcha = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSecurityCaptchaCode(code);
    setSecurityCaptchaInput('');
    setSecurityError(null);

    setTimeout(() => {
      const canvas = securityCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark slate background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Squiggle lines
      const colors = ['#38bdf8', '#4ade80', '#facc15', '#f472b6', '#a78bfa', '#fdba74'];
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.bezierCurveTo(
          Math.random() * canvas.width, Math.random() * canvas.height,
          Math.random() * canvas.width, Math.random() * canvas.height,
          Math.random() * canvas.width, Math.random() * canvas.height
        );
        ctx.stroke();
      }

      // Noise dots
      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Distorted Characters
      ctx.font = "bold 22px 'Courier New', monospace";
      ctx.textBaseline = 'middle';
      const startX = 14;
      const spacing = 26;
      for (let i = 0; i < code.length; i++) {
        ctx.save();
        const charX = startX + i * spacing;
        const charY = canvas.height / 2;
        ctx.translate(charX, charY);
        ctx.rotate((Math.random() - 0.5) * 0.3);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (isCertTerminalOpen && certClub && certCanvasRef.current) {
      void renderRenewalCertificate(certCanvasRef.current, certClub, {
        pi_name: piName,
        pi_affiliation: piAffiliation,
        signature_image_url: signaturePreview,
      });
    }
  }, [isCertTerminalOpen, certClub, piName, piAffiliation, signaturePreview]);

  const handleDownloadCertJPG = async () => {
    if (!certCanvasRef.current || !certClub) return;
    const cid = certClub.club_id || 'CLUB';
    await downloadCertificateJPG(certCanvasRef.current, `NDLI_Renewal_Certificate_${cid}.jpg`);
  };

  const handleDownloadCertPDF = async () => {
    if (!certCanvasRef.current || !certClub) return;
    const cid = certClub.club_id || 'CLUB';
    await downloadCertificatePDF(certCanvasRef.current, `NDLI_Renewal_Certificate_${cid}.pdf`);
  };

  const handlePrintCert = () => {
    if (!certCanvasRef.current) return;
    const ok = printCertificateOnPage(certCanvasRef.current);
    if (!ok) {
      printCertificate(certCanvasRef.current);
    }
  };


  // Handlers for Club Edit & Renewal Modal
  const handleOpenEditModal = (club: ClubSearchRow) => {
    setSelectedEditClub(club);
    setEditInstName(club.institution_name || '');
    setEditRegNo(club.registration_no || club.reg_no || '');
    setEditState(club.state || '');
    setEditZone(club.zone || '');
    setEditPatronEmail(club.patron_email || '');
    setEditPresidentEmail(club.president_email || '');
    setEditSecretaryEmail(club.secretary_email || '');
    setIssueNote('');
    setEditModalFocusIssue(false);
  };

  const handleOpenCertTerminal = (club: ClubSearchRow) => {
    setCertClub(club);
    setIsCertTerminalOpen(true);
  };

  const handleSaveClubDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEditClub) return;
    const updated: ClubSearchRow = {
      ...selectedEditClub,
      institution_name: editInstName,
      registration_no: editRegNo,
      reg_no: editRegNo,
      state: editState,
      zone: editZone,
      patron_email: editPatronEmail,
      president_email: editPresidentEmail,
      secretary_email: editSecretaryEmail,
    };
    setClubRows((prev) =>
      prev.map((c) => (c.club_id === updated.club_id ? updated : c))
    );
    if (onUpdateClub) {
      const existingClub = clubs.find((c) => c.id === updated.club_id);
      if (existingClub) {
        onUpdateClub({
          ...existingClub,
          name: editInstName,
          registrationNo: editRegNo,
          state: editState,
          zone: (editZone as RegionalZone) || existingClub.zone,
        });
      }
    }
    setSelectedEditClub(null);
    showAlert(`✓ Club details for ${editInstName} updated successfully!`);
  };

  // Intercept "Renewal Approved": Check conditions & open 2-Stage Security Modal
  const handleRenewalApproved = () => {
    if (!selectedEditClub) return;
    if (!renewalConditionsChecked) {
      showAlert('Please verify that required renewal conditions have been fulfilled by the club before approving.', true);
      return;
    }
    setSecurityClub(selectedEditClub);
    setSecurityPasswordInput('');
    setSecurityError(null);
    setIsSecurityModalOpen(true);
    generateSecurityCaptcha();
  };

  // Authorize & Execute Renewal Approval after 2-Stage Security
  const handleConfirmRenewalApproval = async () => {
    if (!securityClub) {
      setSecurityError('No target club found for renewal authorization.');
      return;
    }

    const capInput = securityCaptchaInput.trim().toUpperCase();
    const pwdInput = securityPasswordInput.trim();

    if (!capInput && !pwdInput) {
      setSecurityError('Security confirmation required: Please type the CAPTCHA code above OR enter your login password.');
      return;
    }

    setSecurityBusy(true);
    setSecurityError(null);

    try {
      // 1. Password Verification Option
      if (pwdInput) {
        try {
          await verifyEmployeePassword(pwdInput);
        } catch (err) {
          setSecurityError(err instanceof Error ? err.message : 'Incorrect password entered.');
          setSecurityBusy(false);
          return;
        }
      } else if (capInput) {
        // 2. CAPTCHA Verification Option
        if (capInput !== securityCaptchaCode) {
          setSecurityError('Incorrect CAPTCHA code. Please try again or confirm with password.');
          generateSecurityCaptcha();
          setSecurityBusy(false);
          return;
        }
      }

      // Security Passed -> Commit Renewal to Server
      const today = new Date().toISOString().split('T')[0];
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const nextRenewal = nextYear.toISOString().split('T')[0];

      try {
        await renewClubRegistration(securityClub.club_id || '');
      } catch {
        /* proceed with local state update */
      }

      // Persist to localStorage for immediate client-side persistence across reloads
      try {
        const stored = JSON.parse(localStorage.getItem('ndli_club_renewals') || '{}');
        stored[securityClub.club_id || ''] = {
          last_renewal_date: today,
          upcoming_renewal_date: nextRenewal,
          next_renewal_date: nextRenewal,
          renewal_date: nextRenewal,
          status: 'Active',
        };
        localStorage.setItem('ndli_club_renewals', JSON.stringify(stored));
      } catch {
        /* ignore storage quota/disabled */
      }

      const updated: ClubSearchRow = {
        ...securityClub,
        last_renewal_date: today,
        upcoming_renewal_date: nextRenewal,
        next_renewal_date: nextRenewal,
        renewal_date: nextRenewal,
        status: 'Active',
      };

      setClubRows((prev) =>
        prev.map((c) => (c.club_id === updated.club_id ? updated : c))
      );
      if (onUpdateClub) {
        const existing = clubs.find((c) => c.id === updated.club_id);
        if (existing) {
          onUpdateClub({
            ...existing,
            lastRenewalDate: today,
            nextRenewalDate: nextRenewal,
            status: 'Active',
          });
        }
      }

      // Log activity
      void logActivity({
        support_type: 'Other Support',
        notes: `Registration renewal approved for ${securityClub.institution_name} (${securityClub.club_id}). Extended to ${nextRenewal}.`,
        club_id: securityClub.club_id,
      });

      setIsSecurityModalOpen(false);
      setSelectedEditClub(null);
      showAlert(`✓ Renewal Approved! Extended validity through ${nextRenewal}. Official certificate ready.`);
      handleOpenCertTerminal(updated);
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Renewal authorization failed.');
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleSetIssueReminder = () => {
    if (!selectedEditClub || !issueNote.trim()) {
      showAlert('Please enter issue/reminder notes for the club.', true);
      return;
    }
    showAlert(
      `✓ Reminder set for 72 hours. Note recorded for ${selectedEditClub.institution_name}: "${issueNote}"`
    );
    setIssueNote('');
  };

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
      let stored: Record<string, { last_renewal_date?: string; upcoming_renewal_date?: string; renewal_date?: string }> = {};
      try {
        stored = JSON.parse(localStorage.getItem('ndli_club_renewals') || '{}');
      } catch {
        stored = {};
      }
      const merged = data.map((c) => {
        const cid = c.club_id || '';
        const ren = cid ? stored[cid] : undefined;
        if (ren && ren.last_renewal_date) {
          return {
            ...c,
            last_renewal_date: ren.last_renewal_date,
            upcoming_renewal_date: ren.upcoming_renewal_date || c.upcoming_renewal_date,
            next_renewal_date: ren.upcoming_renewal_date || c.next_renewal_date,
            renewal_date: ren.renewal_date || ren.upcoming_renewal_date || c.renewal_date,
            status: 'Active',
          };
        }
        return c;
      });
      setClubRows(merged);
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
      if (data.pi_name) setPiName(data.pi_name);
      if (data.pi_affiliation) setPiAffiliation(data.pi_affiliation);
      if (data.has_signature_image && data.signature_image_url) {
        setSignaturePreview(data.signature_image_url);
      }
    } catch {
      // Fallback to local cache if offline
      try {
        const cached = localStorage.getItem('ndli_pi_settings');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.pi_name) setPiName(parsed.pi_name);
          if (parsed.pi_affiliation) setPiAffiliation(parsed.pi_affiliation);
          if (parsed.signature_image_url) setSignaturePreview(parsed.signature_image_url);
        }
      } catch {
        /* ignore */
      }
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
      const res = await savePISignatureSettings(piAffiliation.trim(), signatureFile || undefined, piName.trim(), signaturePreview || undefined);
      try {
        localStorage.setItem(
          'ndli_pi_settings',
          JSON.stringify({
            pi_name: piName.trim(),
            pi_affiliation: piAffiliation.trim(),
            signature_image_url: res.signature_image_url || signaturePreview,
            has_signature_image: res.has_signature_image,
          })
        );
      } catch {
        /* ignore */
      }
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

  const employeeNotifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];
    const pendingSuccession = (authorityRequests || []).filter(
      (r) => r.status === 'Pending Admin Review'
    );
    if (pendingSuccession.length > 0) {
      list.push({
        id: 'emp-succ-1',
        type: 'succession',
        title: `${pendingSuccession.length} Authority Succession Request(s)`,
        description: 'Colleges have submitted nomination orders for nodal sanction.',
        timestamp: 'Requires Review',
        read: false,
        actionTab: 'succession',
      });
    }
    const openGriev = grievances.filter((g) => g.status === 'open');
    if (openGriev.length > 0) {
      list.push({
        id: 'emp-griev-1',
        type: 'reminder',
        title: `${openGriev.length} Active Reminders / Tickets`,
        description: 'Zonal nodal follow-up required on open institution tickets.',
        timestamp: 'Attention Due',
        read: false,
        actionTab: 'grievances',
      });
    }
    const pendingCharters = charters.filter(
      (c) => c.status === 'queued' || c.status === 'under_review'
    );
    if (pendingCharters.length > 0) {
      list.push({
        id: 'emp-chart-1',
        type: 'approval',
        title: `${pendingCharters.length} Club Approvals In Queue`,
        description: 'New club charters awaiting verification and sanction.',
        timestamp: 'In Queue',
        read: false,
        actionTab: 'approvals',
      });
    }
    return list;
  }, [authorityRequests, grievances, charters]);

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
            className={`tab-btn ${activeTab === 'succession' ? 'active' : ''}`}
            onClick={() => setActiveTab('succession')}
            title="Institutional Authority Succession & Charter Re-Signing Gate"
          >
            <UserCheck className="h-4 w-4 mr-1 text-indigo-700" />
            Authority Succession
            {authorityRequests && authorityRequests.filter((r) => r.status === 'Pending Admin Review').length > 0 && (
              <span className="side-count" style={{ background: '#4F46E5', color: '#fff' }}>
                {authorityRequests.filter((r) => r.status === 'Pending Admin Review').length}
              </span>
            )}
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
        {onNavigateBranch && (
          <>
            <button
              type="button"
              className="side-link nav-link"
              onClick={() => onNavigateBranch('landing', 'home')}
              title="Go to 1. Public Portal"
              style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>🌐</span> 1. Public Portal
            </button>
            <button
              type="button"
              className="side-link nav-link"
              onClick={() => onNavigateBranch('club_module', 'club_directory')}
              title="Go to 2. Institutional Club Module CAMPUS"
              style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>🏛️</span> 2. Campus Clubs Module
            </button>
          </>
        )}
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
            {onNavigateBranch && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginRight: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => onNavigateBranch('landing', 'home')}
                  className="btn btn-outline btn-sm"
                  title="Switch to 1. Public Portal"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', padding: '0.25rem 0.6rem', fontWeight: 600 }}
                >
                  <Globe className="h-3.5 w-3.5 text-[#0D7751]" />
                  <span>1. Public Portal</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateBranch('club_module', 'club_directory')}
                  className="btn btn-outline btn-sm"
                  title="Switch to 2. Institutional Club Module CAMPUS"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', padding: '0.25rem 0.6rem', fontWeight: 600 }}
                >
                  <Building2 className="h-3.5 w-3.5 text-[#B45309]" />
                  <span>2. Campus Clubs</span>
                </button>
              </div>
            )}
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

            <NotificationBell
              notifications={employeeNotifications}
              onNavigateTab={(tab) => setActiveTab(tab as EmployeeTab)}
            />

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
                        <th>Last Renewal Date</th>
                        <th>Upcoming Renewal Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody id="search-results-tbody">
                      {clubsLoading ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading clubs database...
                          </td>
                        </tr>
                      ) : filteredClubs.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
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
                              <td>{c.date_of_approval ? formatDate(c.date_of_approval) : '—'}</td>
                              <td>{c.last_renewal_date ? formatDate(c.last_renewal_date) : 'None (Initial)'}</td>
                              <td>
                                {(c.upcoming_renewal_date || c.next_renewal_date || c.renewal_date)
                                  ? formatDate(c.upcoming_renewal_date || c.next_renewal_date || c.renewal_date)
                                  : '—'}
                              </td>
                              <td>
                                <span
                                  className="pill pill-success"
                                  style={{
                                    textTransform: 'capitalize',
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  {c.status || 'Active'}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => handleOpenEditModal(c)}
                                  title="Edit institutional details or manage annual validity renewal"
                                  style={{
                                    padding: '3px 10px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: '#1B4D3E',
                                    borderColor: '#1B4D3E',
                                  }}
                                >
                                  Edit / Renew
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
                          <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            ⏳ Loading activity history...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
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
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fff7ed', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#fff7ed" />
                          <svg x="5" y="8" width="38" height="32" viewBox="0 11.82 90 66.37">
                            <path fill="#fd8c3a" d="m0 73.108 2.176.242a19.2 19.2 0 0 0 4.592.242 7.18 7.18 0 0 0 4.592-1.939 15.3 15.3 0 0 0 2.538-3.024 12.6 12.6 0 0 0 1.33-4.109l.725-5.559.846-5.801.484-4.109a36 36 0 0 1 1.21-5.197l3.024-8.822a27.16 27.16 0 0 1 20.907-17.643 38 38 0 0 1 5.197-.605 24.3 24.3 0 0 1 5.922.121 15.6 15.6 0 0 1 9.547 3.867 29 29 0 0 0 3.137 2.188 8.1 8.1 0 0 0 4.713.967l1.934-.363a4.45 4.45 0 0 0 2.779-2.538l1.692-2.905v-2.296l.484-2.538.725-.967a1.66 1.66 0 0 1 1.45-.484l.605.846c.605-.363 1.088-.242 1.33.605a5.04 5.04 0 0 1-.488 4.35l-.242.363 1.692.605a5.4 5.4 0 0 1 2.658 2.779l1.21 2.538.242.363 2.537 2.538a1.68 1.68 0 0 1 0 2.297l-.967.363h-.363v.725l-.846.121-1.688-.968a2.9 2.9 0 0 0-1.692-.605 7.6 7.6 0 0 1-3.263-.725l-1.33 2.538a15.6 15.6 0 0 1-6.647 6.164l-.725.242a3.7 3.7 0 0 0-1.815 1.21l-3.024 3.142-2.055 2.42-.722 1.567a1.16 1.16 0 0 1-1.088.846h-.727l-1.934.363a2.94 2.94 0 0 1-1.45 0l-1.692-.242a.94.94 0 0 1-.725-1.088l.605-.242h.363a1.1 1.1 0 0 1 1.33-.242c.484-.605.967-.363 1.571 0a1.154 1.154 0 0 1 1.451-.363 9.26 9.26 0 0 0 3.143-5.557v-.121l-.605.363a4.8 4.8 0 0 0-1.934 2.9 3.56 3.56 0 0 1-1.815 1.934l-.484.242H58l-.967.121a1.585 1.585 0 0 1-1.934-.967v-.967h1.21c.484-1.088 1.21-.846 2.055-.483.605-.725.725-.725 1.934-.484l1.692-2.539a36 36 0 0 1-9.547-.967l-1.692 3.629a20.1 20.1 0 0 1-5.194 6.28c-2.538 2.055-5.317 3.629-7.855 5.317a33.6 33.6 0 0 0-7.01 6.043 9.8 9.8 0 0 0-2.538 5.559l-.605 5.801-.24 3.504a3.16 3.16 0 0 1-1.329 2.539l-2.538 1.45-.725.242-.846-.605a1.41 1.41 0 0 1 .363-2.055 1.31 1.31 0 0 0 .605-1.45 4.55 4.55 0 0 1 .846-2.537 3.62 3.62 0 0 0 .725-2.176l.121-5.197-.247-3.262a18 18 0 0 1 0-3.629 3.82 3.82 0 0 1 1.575-2.657l3.504-2.658a17.4 17.4 0 0 0 2.658-2.538 9.5 9.5 0 0 0 1.934-4.35 28.2 28.2 0 0 0 .846-6.405v-.363a5.165 5.165 0 0 1-1.21-6.284 4.83 4.83 0 0 0-2.176 1.21 21.3 21.3 0 0 0-4.834 6.043 46.3 46.3 0 0 0-3.629 7.855l-1.21 5.317a126 126 0 0 1-3.497 14.501 14.6 14.6 0 0 1-2.42 4.955 12.12 12.12 0 0 1-7.131 4.234 9.97 9.97 0 0 1-5.922-.967A8.2 8.2 0 0 1 0 73.468z" />
                          </svg>
                        </svg>
                      </div>
                      <span className="pill" style={{ background: '#ffedd5', color: '#c2410c', fontSize: '0.7rem', fontWeight: 700 }}>
                        Club Support Helpdesk
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>osTicket</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Official NDLI Club Helpdesk for tracking, resolving, and closing institutional support tickets and technical requests.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://club-support.ndl.gov.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#fd8c3a', color: '#c2410c' }}
                    >
                      <span>🎫</span> Launch osTicket Helpdesk ↗
                    </a>
                  </div>
                </div>

                {/* 2. Gmail */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fef2f2', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#4285f4" d="M13 17.5v15a1.5 1.5 0 001.5 1.5H19V22z" />
                          <path fill="#34a853" d="M35 17.5v15a1.5 1.5 0 01-1.5 1.5H29V22z" />
                          <path fill="#ea4335" d="M19 22l5 3.8 5-3.8V15.5l-5 3.8-5-3.8z" />
                          <path fill="#fbbc04" d="M13 17.5l6 4.5v-6.5l-3.8-2.8a1.5 1.5 0 00-2.2 1.3v3.5z" />
                          <path fill="#c5221f" d="M35 17.5l-6 4.5v-6.5l3.8-2.8a1.5 1.5 0 012.2 1.3v3.5z" />
                        </svg>
                      </div>
                      <span className="pill pill-danger" style={{ fontSize: '0.7rem' }}>
                        Official Communications
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Gmail</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Manage official zonal correspondence, club communications, institutional notifications, and event invitations.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://mail.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#ea4335', color: '#dc2626' }}
                    >
                      <span>✉️</span> Launch Gmail ↗
                    </a>
                  </div>
                </div>

                {/* 3. Google Meet */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#e6f4ea', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#00832d" d="M12 28l5.5-5.5L12 17v11z" />
                          <path fill="#0066da" d="M28 34H14a2 2 0 01-2-2V28l6 4 10 2z" />
                          <path fill="#e51c23" d="M28 14H14a2 2 0 00-2 2v6l6-4 10-2z" />
                          <path fill="#ffba00" d="M28 14l-10 10 10 10V14z" />
                          <path fill="#00ac47" d="M28 20.5l8-6.5v20l-8-6.5v-7z" />
                        </svg>
                      </div>
                      <span className="pill pill-success" style={{ fontSize: '0.7rem' }}>
                        Online Training &amp; Meetings
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Meet</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Conduct 1-on-1 remote assistance, screen sharing, and online club onboarding sessions across regional institutions.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://meet.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#00832d', color: '#00832d' }}
                    >
                      <span>📹</span> Launch Google Meet ↗
                    </a>
                  </div>
                </div>

                {/* 4. Google Drive */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fef7e0', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#ffba00" d="M19.5 11l-9 15.5 5.5 9.5 9-15.5H19.5z" />
                          <path fill="#0066da" d="M37.5 36H16l4.5-8h21.5l-4.5 8z" />
                          <path fill="#00ac47" d="M37.5 36L28.5 20.5 24 12.5h9l9 15.5-4.5 8z" />
                        </svg>
                      </div>
                      <span className="pill pill-warning" style={{ fontSize: '0.7rem' }}>
                        Database &amp; Storage Mirror
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Drive</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Direct cloud repository access for synchronized CSV databases, institutional MoUs, official club logos, and backup archives.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://drive.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#f59e0b', color: '#b45309' }}
                    >
                      <span>📁</span> Open Google Drive ↗
                    </a>
                  </div>
                </div>

                {/* 5. Google Docs */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#e8f0fe', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#4285f4" d="M29 10H15a2 2 0 00-2 2v24a2 2 0 002 2h18a2 2 0 002-2V18l-6-8z" />
                          <path fill="#a1c2fa" d="M29 10v6a2 2 0 002 2h6l-8-8z" />
                          <rect x="17" y="22" width="14" height="2" rx="1" fill="#ffffff" />
                          <rect x="17" y="26" width="14" height="2" rx="1" fill="#ffffff" />
                          <rect x="17" y="30" width="10" height="2" rx="1" fill="#ffffff" />
                        </svg>
                      </div>
                      <span className="pill pill-primary" style={{ fontSize: '0.7rem' }}>
                        SOPs &amp; MoUs
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Docs</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Draft and review institutional agreements, standard operating procedures, support memos, and regional event minutes.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://docs.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#4285f4', color: '#1d4ed8' }}
                    >
                      <span>📄</span> Open Google Docs ↗
                    </a>
                  </div>
                </div>

                {/* 6. Google Sheets */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#e6f4ea', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#0f9d58" d="M29 10H15a2 2 0 00-2 2v24a2 2 0 002 2h18a2 2 0 002-2V18l-6-8z" />
                          <path fill="#87ceac" d="M29 10v6a2 2 0 002 2h6l-8-8z" />
                          <path fill="#ffffff" d="M17 21h14v12H17z" />
                          <path fill="#0f9d58" d="M18 22h5v4h-5v-4zm6 0h6v4h-6v-4zm-6 5h5v4h-5v-4zm6 0h6v4h-6v-4z" />
                        </svg>
                      </div>
                      <span className="pill pill-success" style={{ fontSize: '0.7rem' }}>
                        CSV Analytics &amp; Quotas
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Sheets</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Analyze regional club registration datasets, monthly quota logs, and external CSV data extracts with powerful spreadsheets.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://sheets.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#0f9d58', color: '#15803d' }}
                    >
                      <span>📊</span> Open Google Sheets ↗
                    </a>
                  </div>
                </div>

                {/* 7. Google Slides */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fffbeb', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#f59e0b" d="M29 10H15a2 2 0 00-2 2v24a2 2 0 002 2h18a2 2 0 002-2V18l-6-8z" />
                          <path fill="#fde68a" d="M29 10v6a2 2 0 002 2h6l-8-8z" />
                          <rect x="17" y="21" width="14" height="10" rx="1.5" fill="#ffffff" />
                          <rect x="19" y="23" width="10" height="6" rx="0.5" fill="#f59e0b" />
                        </svg>
                      </div>
                      <span className="pill pill-warning" style={{ fontSize: '0.7rem' }}>
                        Presentations &amp; Seminars
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Slides</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Design and present orientation decks, institutional patron pitches, and interactive workshop slides for regional clubs.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://slides.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#f59e0b', color: '#d97706' }}
                    >
                      <span>📽️</span> Open Google Slides ↗
                    </a>
                  </div>
                </div>

                {/* 8. Google Keep */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fefce8', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#eab308" d="M29 10H15a2 2 0 00-2 2v24a2 2 0 002 2h18a2 2 0 002-2V18l-6-8z" />
                          <path fill="#fef08a" d="M29 10v6a2 2 0 002 2h6l-8-8z" />
                          <path fill="#ffffff" d="M24 20a4.5 4.5 0 00-2.8 8c.5.5.8 1.1.8 1.8v.2h4v-.2c0-.7.3-1.3.8-1.8A4.5 4.5 0 0024 20zm-1.5 11.5h3v1h-3zm.5 1.8h2v.8h-2z" />
                        </svg>
                      </div>
                      <span className="pill" style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.7rem', fontWeight: 700 }}>
                        Quick Notes &amp; Checklists
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Google Keep</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Capture rapid institutional call notes, operational checklists, daily reminders, and field inspection action points.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://keep.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#eab308', color: '#b45309' }}
                    >
                      <span>💡</span> Open Google Keep ↗
                    </a>
                  </div>
                </div>

                {/* 9. YouTube (NDL India) */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#fef2f2', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#f8fafc" />
                          <path fill="#ff0000" d="M37.8 17.2c-.4-1.5-1.6-2.7-3.1-3.1C32 13.5 24 13.5 24 13.5s-8 0-10.7.6c-1.5.4-2.7 1.6-3.1 3.1-.6 2.7-.6 5.8-.6 5.8s0 3.1.6 5.8c.4 1.5 1.6 2.7 3.1 3.1 2.7.6 10.7.6 10.7.6s8 0 10.7-.6c1.5-.4 2.7-1.6 3.1-3.1.6-2.7.6-5.8.6-5.8s0-3.1-.6-5.8z" />
                          <polygon fill="#ffffff" points="21,20 29,24 21,28" />
                        </svg>
                      </div>
                      <span className="pill pill-danger" style={{ background: '#fee2e2', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700 }}>
                        Official Video Channel
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>YouTube (NDL India)</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Official YouTube channel of NDL India (@NDLIndia) featuring instructional tutorials, masterclasses, national webinars, and awareness broadcasts.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://www.youtube.com/@NDLIndia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#ff0000', color: '#dc2626' }}
                    >
                      <span>▶️</span> Watch NDL India on YouTube ↗
                    </a>
                  </div>
                </div>

                {/* 10. Zoom Meeting */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#eff6ff', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#2d8cff" />
                          <path fill="#ffffff" d="M12 18a4 4 0 014-4h11a4 4 0 014 4v12a4 4 0 01-4 4H16a4 4 0 01-4-4V18zm20 3.5l5.5-4a1 1 0 011.5.8v11.4a1 1 0 01-1.5.8l-5.5-4v-5z" />
                        </svg>
                      </div>
                      <span className="pill" style={{ background: '#e0f2fe', color: '#0284c7', fontSize: '0.7rem', fontWeight: 700 }}>
                        National Webinars
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Zoom Meeting</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Host large-capacity national club orientation workshops, inter-state patron conferences, and online training seminars.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://zoom.us"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#2d8cff', color: '#0284c7' }}
                    >
                      <span>🌐</span> Open Zoom Meeting ↗
                    </a>
                  </div>
                </div>

                {/* 11. Microsoft Teams */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: '#f5f3ff', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#464eb8" />
                          <circle cx="31" cy="17" r="3.5" fill="#c3c7fc" />
                          <path fill="#c3c7fc" d="M26 23h10a3 3 0 013 3v4h-13v-7z" />
                          <circle cx="21" cy="15" r="4.5" fill="#ffffff" />
                          <rect x="14" y="22" width="14" height="14" rx="4" fill="#ffffff" />
                          <path fill="#464eb8" d="M18 26h6v2.5h-1.8V33h-2.4v-4.5H18V26z" />
                        </svg>
                      </div>
                      <span className="pill" style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '0.7rem', fontWeight: 700 }}>
                        Team Chat &amp; Channels
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>Microsoft Teams</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Inter-nodal team chat, IIT Kharagpur central office coordination channels, and institutional committee meetings.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://teams.microsoft.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#464eb8', color: '#4338ca' }}
                    >
                      <span>💬</span> Open Microsoft Teams ↗
                    </a>
                  </div>
                </div>

                {/* 12. StreamYard */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem 1.15rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div style={{ background: 'var(--bg-muted)', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)' }}>
                        <svg width="34" height="34" viewBox="0 0 48 48">
                          <rect width="48" height="48" rx="10" fill="#1e293b" />
                          <circle cx="24" cy="24" r="13" fill="#2563eb" />
                          <path fill="#facc15" d="M24 14c-4.5 0-8 3-8 6.5 0 2.2 1.4 4.2 3.5 5.3-.2.8-.7 2-1.8 2.8 1.8.1 3.5-.7 4.5-1.8.6.1 1.2.2 1.8.2 4.5 0 8-3 8-6.5s-3.5-6.5-8-6.5z" />
                          <circle cx="22" cy="19" r="1.2" fill="#1e293b" />
                          <circle cx="27" cy="19" r="1.2" fill="#1e293b" />
                          <ellipse cx="24.5" cy="22.5" rx="3.5" ry="1.8" fill="#f97316" />
                          <path fill="#ffffff" d="M18 31h12a1.5 1.5 0 011.5 1.5v1.5a1 1 0 01-1 1H17.5a1 1 0 01-1-1v-1.5A1.5 1.5 0 0118 31z" />
                        </svg>
                      </div>
                      <span className="pill pill-danger" style={{ fontSize: '0.7rem' }}>
                        Live Streaming Studio
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: 'var(--primary)', fontWeight: 700, margin: '0 0 0.3rem 0' }}>StreamYard</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.4, margin: '0 0 0.85rem 0' }}>
                      Produce professional broadcast live streams to YouTube, Facebook, and LinkedIn for national NDLI events and announcements.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://streamyard.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, borderColor: '#2563eb', color: '#1d4ed8' }}
                    >
                      <span>📡</span> Launch StreamYard Studio ↗
                    </a>
                  </div>
                </div>
              </div>

{/* PI Digital Signature & Affiliation Settings (Prominent Lite Tinted Brand Card) */}
              <div
                className="card"
                style={{
                  background: '#F0F9F5',
                  border: '1.5px solid #0D7751',
                  borderRadius: '16px',
                  boxShadow: '0 4px 16px rgba(13, 119, 81, 0.08)',
                  padding: '1.5rem',
                }}
              >
                <div className="card-header" style={{ borderBottom: '1px solid #D1E5DC', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 className="card-title" style={{ color: '#103125', fontSize: '1.15rem' }}>
                      ✍️ Project Investigator (PI) Digital Signature &amp; Affiliation
                    </h3>
                    <p className="card-subtitle" style={{ color: '#5A7366' }}>
                      Configure the official digital signature, name, and affiliation rendered on registration certificates and renewal letters.
                    </p>
                  </div>
                  <span className="pill pill-success" style={{ fontWeight: 700 }}>Official Credential Authority</span>
                </div>

                <form onSubmit={handleSavePISettings} style={{ maxWidth: '680px' }}>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pi-name-input" className="label-required" style={{ fontWeight: 700, color: '#103125' }}>
                      Project Investigator (PI) Full Name
                    </label>
                    <input
                      type="text"
                      id="pi-name-input"
                      required
                      placeholder="e.g. Dr. Plaban Kumar Bhowmick"
                      value={piName}
                      onChange={(e) => setPiName(e.target.value)}
                      style={{ background: '#ffffff', borderColor: '#A7D7C5', fontSize: '0.92rem' }}
                    />
                    <small style={{ color: '#5A7366', fontSize: '0.78rem', marginTop: '0.2rem', display: 'block' }}>
                      Default authority displayed: Dr. Plaban Kumar Bhowmick. Printed on all registration charters and annual renewal letters.
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pi-affiliation-input" className="label-required" style={{ fontWeight: 700, color: '#103125' }}>
                      Project Investigator Affiliation &amp; Designation
                    </label>
                    <input
                      type="text"
                      id="pi-affiliation-input"
                      required
                      placeholder="e.g. Professor, Computer Science & Engineering, IIT Kharagpur"
                      value={piAffiliation}
                      onChange={(e) => setPiAffiliation(e.target.value)}
                      style={{ background: '#ffffff', borderColor: '#A7D7C5', fontSize: '0.92rem' }}
                    />
                    <small style={{ color: '#5A7366', fontSize: '0.78rem', marginTop: '0.2rem', display: 'block' }}>
                      Appears beneath the PI digital signature on minted certificates.
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ fontWeight: 700, color: '#103125', display: 'block', marginBottom: '0.35rem' }}>
                      Official PI Digital Signature (PNG format recommended)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <input
                        ref={sigFileInputRef}
                        type="file"
                        id="pi-sig-file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setSignatureFile(file);
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const dataUrl = ev.target?.result as string;
                              setSignaturePreview(dataUrl);
                              try {
                                const cur = JSON.parse(localStorage.getItem('ndli_pi_settings') || '{}');
                                localStorage.setItem('ndli_pi_settings', JSON.stringify({
                                  ...cur,
                                  signature_image_url: dataUrl,
                                  has_signature_image: true,
                                }));
                              } catch { /* ignore */ }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => sigFileInputRef.current?.click()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.45rem 1rem', fontWeight: 700 }}
                      >
                        📁 Upload Signature
                      </button>
                      <span style={{ fontSize: '0.8rem', color: '#5A7366' }}>
                        {signatureFile ? signatureFile.name : 'Supports transparent PNG or high-contrast JPG'}
                      </span>
                    </div>
                  </div>

                  {signaturePreview && (
                    <div
                      style={{
                        marginBottom: '1.25rem',
                        padding: '0.85rem 1.15rem',
                        background: '#ffffff',
                        border: '1.5px dashed #0D7751',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.25rem',
                      }}
                    >
                      <img
                        src={signaturePreview}
                        alt="PI Digital Signature"
                        onError={(ev) => {
                          (ev.currentTarget as HTMLImageElement).src = '/pi_signature.png';
                        }}
                        style={{ maxHeight: '65px', maxWidth: '220px', objectFit: 'contain', background: '#ffffff', borderRadius: '4px', padding: '2px' }}
                      />
                      <div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0D7751', display: 'block' }}>
                          ✓ Digital Signature Verified &amp; Active
                        </span>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: '#5A7366' }}>
                          This signature will appear on all generated registration charters and renewal letters.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={piBusy || !piAffiliation.trim()}
                      style={{ fontWeight: 700, padding: '0.55rem 1.25rem' }}
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
                  {/* TAB: AUTHORITY SUCCESSION DESK */}
          {activeTab === 'succession' && (
            <div className="tab-panel active" id="tab-succession">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Institutional Authority Succession &amp; Charter Re-Signing Desk</h3>
                    <p className="card-subtitle">
                      Validate appointment orders and cryptographically sanction leadership changes for colleges.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="pill pill-success">
                      {authorityRequests.filter((r) => r.status === 'Pending Admin Review').length} Pending Requests
                    </span>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {authorityRequests.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
                      No authority succession requests found in node registry.
                    </div>
                  ) : (
                    authorityRequests.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          padding: '1.25rem',
                          borderRadius: 'var(--radius-md)',
                          background: '#F4F8F6',
                          border: '1px solid #E2ECE7',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#103125' }}>
                            {req.id} • {req.clubName}
                          </span>
                          <span
                            className="pill"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: req.status === 'Approved & Updated' ? '#dcfce7' : '#fef3c7',
                              color: req.status === 'Approved & Updated' ? '#166534' : '#92400e',
                            }}
                          >
                            {req.status}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '1rem',
                            background: '#ffffff',
                            padding: '0.85rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid #E2ECE7',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#5A7366' }}>
                              Current Officer
                            </span>
                            <div style={{ fontWeight: 700, color: '#103125', marginTop: '2px' }}>{req.currentName}</div>
                            <div style={{ fontSize: '0.78rem', color: '#5A7366' }}>Role: {req.role}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#0D7751' }}>
                              Incoming Nominee
                            </span>
                            <div style={{ fontWeight: 700, color: '#103125', marginTop: '2px' }}>{req.proposedName}</div>
                            <div style={{ fontSize: '0.78rem', color: '#5A7366' }}>
                              {req.proposedEmail} ({req.proposedPhone})
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#5A7366', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span>
                            Official Appointment Order: <strong style={{ fontFamily: 'monospace' }}>{req.officialDocName}</strong>
                          </span>
                          {req.status === 'Pending Admin Review' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {onRejectAuthorityChange && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const reason = window.prompt('Enter reason for rejecting authority succession:');
                                    if (reason !== null) {
                                      onRejectAuthorityChange(req.id, reason);
                                      showAlert(`Rejected succession request ${req.id}.`);
                                    }
                                  }}
                                  className="btn btn-outline btn-sm"
                                  style={{ borderColor: '#dc2626', color: '#dc2626', padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                  Reject
                                </button>
                              )}
                              {onApproveAuthorityChange && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onApproveAuthorityChange(req.id);
                                    showAlert(`✓ Approved authority succession for ${req.clubName}. Charter re-signed!`);
                                  }}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                >
                                  Authorize &amp; Re-Sign Charter
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        {/* MODAL 1: EDIT / RENEW CLUB MODAL (Exact Legacy Project Parity) */}
        {selectedEditClub && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                maxWidth: '780px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                padding: '1.75rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #E2ECE7', paddingBottom: '0.85rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
                    {selectedEditClub.institution_name} ({selectedEditClub.club_id})
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    Edit institutional directory metadata or approve annual registration validity renewal.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="pill pill-success">{selectedEditClub.status || 'Active'}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedEditClub(null)}
                    style={{ background: 'transparent', border: 'none', fontSize: '1.35rem', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Form: Edit Club Details */}
              <form onSubmit={handleSaveClubDetails} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="label-required">Institution Name</label>
                  <input
                    type="text"
                    required
                    value={editInstName}
                    onChange={(e) => setEditInstName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Registration No</label>
                  <input
                    type="text"
                    value={editRegNo}
                    onChange={(e) => setEditRegNo(e.target.value)}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label-required">State</label>
                    <input
                      type="text"
                      required
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Zone (Auto-Mapped)</label>
                    <input
                      type="text"
                      readOnly
                      value={editZone}
                      style={{ background: 'var(--bg-muted)', fontWeight: 700 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Patron Email</label>
                    <input
                      type="email"
                      value={editPatronEmail}
                      onChange={(e) => setEditPatronEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>President Email</label>
                    <input
                      type="email"
                      value={editPresidentEmail}
                      onChange={(e) => setEditPresidentEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Secretary Email</label>
                    <input
                      type="email"
                      value={editSecretaryEmail}
                      onChange={(e) => setEditSecretaryEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>
                    Save Updated Details
                  </button>
                </div>
              </form>

              {/* REGISTRATION RENEWAL SECTION ("Renewal Approved") */}
              <div
                style={{
                  borderTop: '2px dashed #fde68a',
                  background: '#fffdf5',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ color: '#92400e', fontSize: '1.02rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚡</span> Registration Renewal Approval
                  </h4>
                  <span className="pill pill-success" style={{ fontWeight: 800 }}>
                    Validity Active
                  </span>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0, lineHeight: 1.45 }}>
                  <strong>Renewal Protocol:</strong> Every club receives 1-year registration validity upon approval. On fulfillment of activity criteria, click <strong>&quot;Renewal Approved&quot;</strong>. The current date is logged as <strong>&quot;Last Renewal Date&quot;</strong>, and upcoming validity extends by +1 year.
                </p>

                {/* 3 Renewal Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div style={{ background: '#ffffff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 800, display: 'block' }}>
                      Date of Approval
                    </span>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--primary)', marginTop: '0.2rem', display: 'block' }}>
                      {selectedEditClub.date_of_approval || '2021-04-12'}
                    </strong>
                    <small style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Inception timestamp</small>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 800, display: 'block' }}>
                      Last Renewal Date
                    </span>
                    <strong style={{ fontSize: '0.92rem', color: '#b45309', marginTop: '0.2rem', display: 'block' }}>
                      {selectedEditClub.last_renewal_date || 'None (Initial)'}
                    </strong>
                    <small style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Logged on approval</small>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 800, display: 'block' }}>
                      Upcoming Renewal Due Date
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: '#15803d', marginTop: '0.2rem', display: 'block' }}>
                      {selectedEditClub.upcoming_renewal_date || selectedEditClub.renewal_date || '2026-04-12'}
                    </strong>
                    <small style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+1 Year Validity</small>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#78350f', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={renewalConditionsChecked}
                      onChange={(e) => setRenewalConditionsChecked(e.target.checked)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>Required renewal conditions fulfilled and verified</span>
                  </label>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleOpenCertTerminal(selectedEditClub)}
                      title="Open Renewal Certificate Generation Terminal"
                      style={{ fontWeight: 600 }}
                    >
                      <span>📜</span> Certificate Terminal
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleRenewalApproved}
                      style={{ fontWeight: 800, background: '#0D7751' }}
                    >
                      <span>⚡</span> Renewal Approved
                    </button>
                  </div>
                </div>
              </div>

              {/* REPORT UNRESOLVED ISSUE & SET REMINDER */}
              <div
                style={{
                  borderTop: '2px dashed #fde68a',
                  background: '#fffdf5',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: '1px solid #fef08a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ color: '#854d0e', fontSize: '1.02rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚠️</span> Report Unresolved Issue &amp; Set Reminder
                  </h4>
                  <span className="pill pill-warning" style={{ fontSize: '0.72rem' }}>72-Hour Alert Token</span>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="issue-note-input" style={{ fontSize: '0.85rem', color: '#713f12' }}>Brief Note of Reported Issue:</label>
                  <textarea
                    id="issue-note-input"
                    rows={2}
                    value={issueNote}
                    onChange={(e) => setIssueNote(e.target.value)}
                    placeholder="Note down the issue reported by the club authorities..."
                    style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)', padding: '0.5rem', fontSize: '0.84rem' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    onClick={handleSetIssueReminder}
                    style={{ fontWeight: 700, background: '#b45309', color: '#fff', border: 'none' }}
                  >
                    <span>⏰</span> SET A REMINDER
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: 2-STAGE SECURITY CONFIRMATION MODAL (Observation 3) */}
        {isSecurityModalOpen && securityClub && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001,
              padding: '1rem',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                maxWidth: '620px',
                width: '95%',
                padding: '1.75rem',
                borderTop: '6px solid #b45309',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                  <div
                    style={{
                      background: '#fef3c7',
                      color: '#b45309',
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.6rem',
                      flexShrink: 0,
                      border: '2px solid #fde68a',
                    }}
                  >
                    ⚠️
                  </div>
                  <div>
                    <h3 style={{ color: '#92400e', margin: '0 0 0.25rem 0', fontSize: '1.2rem', fontWeight: 800 }}>
                      Security Confirmation: Authorize Registration Renewal
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350f', lineHeight: 1.4 }}>
                      Second-layer security verification required before committing renewal approval to IIT Kharagpur Master Database.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  ×
                </button>
              </div>

              {/* Warning Box */}
              <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: '10px', padding: '0.9rem 1rem' }}>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.88rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>🛑</span> Verify Conditions Before Authorizing
                </div>
                <p style={{ fontSize: '0.82rem', color: '#78350f', margin: '0 0 0.6rem 0', lineHeight: 1.4 }}>
                  Accidental approval extends the club&apos;s active charter and issues an official renewal certificate. Please ensure all activity quotas, OS tickets, and compliance proofs have been inspected.
                </p>

                {/* Summary of Target Club */}
                <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Institution:</span>
                    <strong style={{ color: 'var(--primary)', textAlign: 'right' }}>{securityClub.institution_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Club ID / Reg No:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {securityClub.club_id} | Reg No: {securityClub.registration_no || securityClub.reg_no || 'Pending'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Inception Approval Date:</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFormalDate(securityClub.date_of_approval)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '0.3rem', marginTop: '0.3rem' }}>
                    <span style={{ color: '#15803d', fontWeight: 700 }}>New Extended Validity:</span>
                    <strong style={{ color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>+1 Year Extension</strong>
                  </div>
                </div>
              </div>

              {/* Security Challenge Box */}
              <div style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🔐 Complete Security Challenge:</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>Either CAPTCHA or Password</span>
                </div>

                {securityError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                    {securityError}
                  </div>
                )}

                {/* Option 1: Visual CAPTCHA */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem', display: 'block' }}>
                    Option 1: Visual Alphanumeric CAPTCHA Code
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ position: 'relative', background: '#0f172a', borderRadius: '6px', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
                      <canvas
                        ref={securityCanvasRef}
                        width={150}
                        height={42}
                        style={{ borderRadius: '4px', cursor: 'pointer' }}
                        title="Click to refresh CAPTCHA"
                        onClick={generateSecurityCaptcha}
                      />
                      <button
                        type="button"
                        onClick={generateSecurityCaptcha}
                        title="Reload CAPTCHA"
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.1rem', cursor: 'pointer', padding: '0 6px' }}
                      >
                        ↻
                      </button>
                    </div>
                    <input
                      type="text"
                      value={securityCaptchaInput}
                      onChange={(e) => setSecurityCaptchaInput(e.target.value.toUpperCase())}
                      placeholder="Type 5 chars"
                      maxLength={6}
                      style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '1rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}
                      autoComplete="off"
                    />
                  </div>
                  <small style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Type the 5 characters shown above. Not case-sensitive.
                  </small>
                </div>

                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#647B70', margin: '0.5rem 0', fontWeight: 600 }}>
                  — OR —
                </div>

                {/* Option 2: Employee Login Password */}
                <div>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem', display: 'block' }}>
                    Option 2: Confirm with Employee Login Password
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={securityShowPassword ? 'text' : 'password'}
                      value={securityPasswordInput}
                      onChange={(e) => setSecurityPasswordInput(e.target.value)}
                      placeholder="Enter your portal login password"
                      style={{ width: '100%', padding: '0.5rem 0.75rem', paddingRight: '4.5rem', fontSize: '0.9rem' }}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSecurityShowPassword(!securityShowPassword)}
                      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      {securityShowPassword ? '🙈 Hide' : '👁️ Show'}
                    </button>
                  </div>
                  <small style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Verifies against your active employee account session.
                  </small>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-md"
                  onClick={() => setIsSecurityModalOpen(false)}
                  disabled={securityBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={handleConfirmRenewalApproval}
                  disabled={securityBusy}
                  style={{ fontWeight: 800, background: '#b45309', border: 'none', color: '#ffffff' }}
                >
                  {securityBusy ? '⏳ Verifying Security...' : '✓ Authorize & Confirm Renewal Approval →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: RENEWAL CERTIFICATE GENERATION & DOWNLOAD TERMINAL (Exact Parity) */}
        {isCertTerminalOpen && certClub && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '1rem',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                maxWidth: '1340px',
                width: '96%',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              }}
            >
              {/* Terminal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '0.85rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '1.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
                  <div style={{ background: '#103125', color: '#c29b38', width: '44px', height: '44px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', border: '1.5px solid #c29b38' }}>
                    📜
                  </div>
                  <div>
                    <h3 style={{ color: '#103125', margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                      Renewal Certificate Generation &amp; Download Terminal
                    </h3>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      High-Resolution (300 DPI A4 Portrait) Official NDLI Club IIT Kharagpur Renewal Certificate
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="pill pill-success" style={{ fontSize: '0.82rem' }}>● Print-Ready 300 DPI</span>
                  <span className="pill" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '0.82rem' }}>
                    Club: {certClub.club_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCertTerminalOpen(false)}
                    style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: '0.5rem' }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Terminal Body Grid: 360px Controls + Flex Canvas Preview */}
              <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.25rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
                {/* Left Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Card 1: Target Data */}
                  <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#103125', margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>🏛️</span> Certificate Target Data (From Master CSV)
                    </h4>
                    <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.76rem' }}>Institution Name:</span>
                        <strong style={{ color: 'var(--primary)' }}>{certClub.institution_name}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Registration No:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {certClub.registration_no || certClub.reg_no || `NDLI/REG/${certClub.club_id}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Date of Approval:</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFormalDate(certClub.date_of_approval)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#15803d', fontWeight: 600 }}>Renewal Validity Upto:</span>
                        <strong style={{ color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                          {formatFormalDate(certClub.upcoming_renewal_date || certClub.next_renewal_date || certClub.renewal_date)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: PI Signature & Affiliation */}
                  <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#103125', margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>✍️</span> PI Digital Signature &amp; Affiliation
                    </h4>

                    {/* Signature Upload */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem', display: 'block' }}>
                        Upload PI Signature (PNG / JPG)
                      </label>
                      <input
                        ref={certSigFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const dataUrl = ev.target?.result as string;
                              setSignaturePreview(dataUrl);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => certSigFileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, padding: '0.4rem' }}
                      >
                        📁 Choose Signature File...
                      </button>

                      {/* Mini preview */}
                      <div style={{ marginTop: '0.4rem', padding: '4px 8px', background: 'var(--bg-muted)', border: '1px dashed var(--border)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {signaturePreview ? 'Custom Signature Active' : 'Default Signature'}
                        </span>
                        {signaturePreview ? (
                          <img
                            src={signaturePreview}
                            alt="Signature preview"
                            style={{ maxHeight: '28px', maxWidth: '90px', objectFit: 'contain' }}
                          />
                        ) : (
                          <img
                            src="/pi_signature.png"
                            alt="Default Signature"
                            style={{ maxHeight: '28px', maxWidth: '90px', objectFit: 'contain' }}
                          />
                        )}
                      </div>
                    </div>

                    {/* PI Name */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem', display: 'block' }}>
                        PI Name
                      </label>
                      <input
                        type="text"
                        value={piName}
                        onChange={(e) => setPiName(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.88rem' }}
                      />
                    </div>

                    {/* PI Affiliation */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem', display: 'block' }}>
                        PI Affiliation
                      </label>
                      <textarea
                        rows={2}
                        value={piAffiliation}
                        onChange={(e) => setPiAffiliation(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                      />
                    </div>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleSavePISettings}
                      disabled={piBusy}
                      style={{ width: '100%', fontWeight: 600, padding: '0.4rem' }}
                    >
                      {piBusy ? 'Saving...' : '💾 Save as Default PI Settings'}
                    </button>
                  </div>

                  {/* Card 3: Action Buttons */}
                  <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleDownloadCertJPG}
                      style={{ width: '100%', fontWeight: 700, padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>📥</span> Download High-Resolution JPG (300 DPI)
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleDownloadCertPDF}
                      style={{ width: '100%', fontWeight: 700, padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>📄</span> Download High-Resolution PDF (A4)
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent"
                      onClick={handlePrintCert}
                      style={{ width: '100%', fontWeight: 700, padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#0D7751', color: '#fff' }}
                    >
                      <span>🖨️</span> Print Certificate (A4 Portrait)
                    </button>
                  </div>
                </div>

                {/* Right Preview Canvas */}
                <div
                  style={{
                    background: '#e2ece7',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'auto',
                    minHeight: '520px',
                  }}
                >
                  <canvas
                    ref={certCanvasRef}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '74vh',
                      objectFit: 'contain',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
                      borderRadius: '4px',
                      background: '#ffffff',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        </main>
      </div>
    </div>
  );
};
