import React, { useState } from 'react';
import QRCode from 'qrcode';
import { 
  Building2, 
  Users, 
  Calendar, 
  BarChart3, 
  LifeBuoy, 
  ShieldCheck, 
  ShieldAlert,
  FileSpreadsheet, 
  UserPlus, 
  PlusCircle, 
  CheckCircle2, 
  Share2,
  Award,
  Sparkles,
  Check,
  X,
  Send,
  Lock,
  Globe2,
  ArrowLeft,
  LogIn,
  LogOut,
  KeyRound,
  Copy,
  Download,
  Printer,
  ExternalLink,
  Clock
} from 'lucide-react';
import { 
  InstituteClub, 
  StudentMember, 
  ClubActivity, 
  IssueTicket, 
  AuthorityChangeRequest,
  CertificateData 
} from '../types';
import { useModalBehavior } from '../utils/useModalBehavior';
import { t } from "../i18n";
import { SubClubManagementPanel } from './clubs/SubClubManagementPanel';
import { SchoolBulkUploadPanel } from './members/SchoolBulkUploadPanel';
import { InstitutionalBrandingPanel } from './clubs/InstitutionalBrandingPanel';
import { InstitutionalEventModal } from './activities/InstitutionalEventModal';
import { EventParticipationCard } from './activities/EventParticipationCard';
import { CuratedLibraryHub } from './sharing/CuratedLibraryHub';
import { StudentMembershipApprovalPanel } from './members/StudentMembershipApprovalPanel';
import { fetchClubEvents, ClubEvent, fetchSubClubs, SubClub, fetchStudentProfiles, fetchSchoolCards } from '../lib/campusApi';
import { Layers, BookOpen, School as SchoolIcon } from 'lucide-react';

interface ClubModuleViewProps {
  activeClub: InstituteClub;
  students: StudentMember[];
  activities: ClubActivity[];
  tickets: IssueTicket[];
  authorityRequests: AuthorityChangeRequest[];
  isAuthorityAuthenticated?: boolean;
  authenticatedAuthority?: {
    name: string;
    role: string;
    email: string;
    clubId: string;
  } | null;
  onAuthoritySignIn?: () => void;
  onAuthorityQuickSignIn?: (authority: { name: string; role: string; email: string; clubId: string }) => void;
  onAuthoritySignOut?: () => void;
  onBackToClubsList?: () => void;
  onCreateActivity: (activity: ClubActivity) => void;
  onRaiseTicket: (ticket: IssueTicket) => void;
  onSubmitAuthorityChange: (req: AuthorityChangeRequest) => void;
  onClaimCertificate: (cert: CertificateData) => void;
  onViewPublicProfile: (club: InstituteClub) => void;
  canonicalClubs?: InstituteClub[];
}

export const ClubModuleView: React.FC<ClubModuleViewProps> = ({
  activeClub,
  students,
  activities,
  tickets,
  authorityRequests,
  isAuthorityAuthenticated = false,
  authenticatedAuthority = null,
  canonicalClubs = [],
  onAuthoritySignIn,
  onAuthorityQuickSignIn,
  onAuthoritySignOut,
  onBackToClubsList,
  onCreateActivity,
  onRaiseTicket,
  onSubmitAuthorityChange,
  onClaimCertificate,
  onViewPublicProfile,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'membership_approval' | 'subclubs' | 'school_roster' | 'activities' | 'libraries' | 'tickets' | 'succession'
  >('overview');

  const isExecutive = Boolean(
    authenticatedAuthority &&
    (authenticatedAuthority.role?.toLowerCase().includes('executive') || authenticatedAuthority.role === 'club_executive')
  );
  const isMainAuthority = isAuthorityAuthenticated && !isExecutive;

  // Campus Events & Sub-Clubs state
  const [backendEvents, setBackendEvents] = useState<ClubEvent[]>([]);
  const [subClubsList, setSubClubsList] = useState<SubClub[]>([]);
  const [memberStats, setMemberStats] = useState<{ total: number; active: number; inactive: number } | null>(null);
  const [showInstitutionalEventModal, setShowInstitutionalEventModal] = useState(false);

  const loadCampusData = async () => {
    try {
      const [evts, subs, profs, schoolCards] = await Promise.all([
        fetchClubEvents(activeClub.id).catch(() => []),
        fetchSubClubs(activeClub.id).catch(() => []),
        fetchStudentProfiles({ club_code: activeClub.id }).catch(() => null),
        activeClub.category === 'School'
          ? fetchSchoolCards(activeClub.id).then(res => res.cards).catch(() => [])
          : Promise.resolve([]),
      ]);
      setBackendEvents(evts);
      setSubClubsList(subs);
      if (activeClub.category === 'School') {
        const total = schoolCards.length;
        setMemberStats({ total, active: total, inactive: 0 });
      } else if (profs && profs.results) {
        const total = profs.total ?? profs.results.length;
        const active = profs.results.filter((s) => s.status === 'active').length;
        const inactive = total - active;
        setMemberStats({ total, active, inactive });
      }
    } catch {
      // fallback
    }
  };

  React.useEffect(() => {
    loadCampusData();
  }, [activeClub.id]);

  // New Issue Ticket Form State
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<'Registration & Passkey' | 'Certificate Approval' | 'Event Logistics' | 'Technical Glitch' | 'Data Correction'>('Technical Glitch');
  const [ticketPriority, setTicketPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');

  // Authority Succession Form State
  const [showSuccessionModal, setShowSuccessionModal] = useState(false);
  const [succRole, setSuccRole] = useState<'Patron' | 'President' | 'Secretary' | 'Executive Member'>('President');
  const [succProposedName, setSuccProposedName] = useState('');
  const [succProposedEmail, setSuccProposedEmail] = useState('');
  const [succProposedPhone, setSuccProposedPhone] = useState('');
  const [succDocName, setSuccDocName] = useState('Official_Appointment_Order_2026.pdf');
  const [succReason, setSuccReason] = useState('Routine institutional rotation / superannuation.');
  const [succOtpEntered, setSuccOtpEntered] = useState('');

  // NAAC Preview
  const [showNaacPreview, setShowNaacPreview] = useState(false);

  // Campus Passkey & QR Enrollment Hub States
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedPasskey, setCopiedPasskey] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const joinUrl = `${origin}/join#passkey=${encodeURIComponent(activeClub.passkey)}`;
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#103125', light: '#ffffff' }
    }).then(setQrDataUrl).catch(() => {});
  }, [activeClub.passkey]);

  const handleCopyPasskey = () => {
    navigator.clipboard.writeText(activeClub.passkey);
    setCopiedPasskey(true);
    setTimeout(() => setCopiedPasskey(false), 2000);
  };

  const handleCopyInviteMessage = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ndli-club-main-portal.onrender.com';
    const invite = `📢 Official NDLI Club Chapter Invitation\n\nInstitution: ${activeClub.name}\nAISHE Code: ${activeClub.aisheCode}\n\nJoin our official campus reading & research club on the National Digital Library of India portal!\n\n🔑 Official Campus Passkey: ${activeClub.passkey}\n🌐 Direct Join Link: ${origin}/join\n\n(This passkey is for enrolled students and faculty of ${activeClub.name})`;
    navigator.clipboard.writeText(invite);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // S1: shared dialog behaviour for the remaining inline dialogs — backdrop
  // click and Escape close whichever dialog is open (only one at a time).
  const anyDialogOpen =
    showNewTicketModal || showSuccessionModal || showNaacPreview || showPosterModal;
  const closeAnyDialog = () => {
    setShowNewTicketModal(false);
    setShowSuccessionModal(false);
    setShowNaacPreview(false);
    setShowPosterModal(false);
  };
  useModalBehavior(anyDialogOpen, closeAnyDialog);

  // Students feed the overview / activities tabs; the ROSTER tab (M5-D4) is
  // live API data and does not read this demo collection.
  const clubStudents = students.filter(s => s.clubId === activeClub.id);

  const clubTickets = tickets.filter(t => t.clubId === activeClub.id);
  const clubAuthRequests = authorityRequests.filter(r => r.clubId === activeClub.id);

  // Handler: Submit Issue Ticket
  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle || !ticketDesc) return;

    const newTkt: IssueTicket = {
      id: `TKT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      clubId: activeClub.id,
      clubName: activeClub.name,
      zone: activeClub.zone,
      category: ticketCategory,
      priority: ticketPriority,
      title: ticketTitle,
      description: ticketDesc,
      status: 'Submitted',
      assignedTo: `Regional Desk (${t(activeClub.zone)} Zone)`,
      createdAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    };

    onRaiseTicket(newTkt);
    setTicketTitle('');
    setTicketDesc('');
    setShowNewTicketModal(false);
  };

  // Handler: Submit Authority Succession
  const handleAuthorityChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!succProposedName || !succProposedEmail) return;

    const currentAuth = activeClub.authorities.find(a => a.role === succRole)?.name || 'Incumbent Officer';

    const req: AuthorityChangeRequest = {
      id: `AUTH-REQ-${Math.floor(100 + Math.random() * 900)}`,
      clubId: activeClub.id,
      clubName: activeClub.name,
      role: succRole,
      currentName: currentAuth,
      proposedName: succProposedName,
      proposedEmail: succProposedEmail,
      proposedPhone: succProposedPhone,
      officialDocName: succDocName,
      reason: succReason,
      status: 'Pending Admin Review',
      submittedAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    };

    onSubmitAuthorityChange(req);
    setSuccProposedName('');
    setSuccProposedEmail('');
    setSuccOtpEntered('');
    setShowSuccessionModal(false);
  };

  // Point 3: The dashboard remains locked behind authority login screen
  if (!isAuthorityAuthenticated) {
    const presidentAuth = activeClub.authorities.find(a => a.role === 'President') || activeClub.authorities[0];
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6 animate-in fade-in">
        {onBackToClubsList && (
          <button
            onClick={onBackToClubsList}
            className="flex items-center space-x-2 text-xs font-bold text-[#2E4A3E] hover:text-[#103125] transition-colors cursor-pointer group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>{t("Back to National Chapters Directory")}</span>
          </button>
        )}

        <div className="bg-white rounded-3xl border border-[#E2ECE7] shadow-2xl overflow-hidden card-glow">
          {/* Top Security Banner with Ambient Mesh */}
          <div className="hero-mesh bg-gradient-to-r from-[#103125] via-[#164433] to-[#103125] text-white p-8 sm:p-10 text-center relative overflow-hidden border-b border-[#0D7751]/30">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative inline-flex p-3.5 rounded-2xl bg-amber-400/20 border border-amber-300/30 text-amber-300 mb-4 shadow-lg">
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="relative text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-snug">
              {t("Club Authority Authentication Required")}
            </h1>
            <p className="relative text-xs sm:text-sm text-brand-200 mt-2.5 max-w-xl mx-auto font-normal">
              {t("The Management Dashboard for")} <strong className="text-white font-bold">{activeClub.name}</strong> {t("is strictly locked behind authorized institutional credentials.")}
            </p>
            <div className="relative inline-flex items-center space-x-2.5 text-[11px] font-mono bg-white/10 px-3.5 py-1.5 rounded-full mt-4 text-brand-200 border border-white/15 backdrop-blur-md">
              <span className="font-semibold text-white">{t("AISHE:")} {activeClub.aisheCode}</span>
              <span className="text-white/40">•</span>
              <span>{t("Zone:")} {t(activeClub.zone)}</span>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Security Explanation */}
            <div className="bg-[#F4F8F6] p-4 sm:p-5 rounded-2xl border border-[#E2ECE7] space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#103125]">
                <ShieldCheck className="h-4 w-4 text-[#0D7751]" />
                <span className="tracking-wide uppercase text-[11px] font-extrabold">{t("Institutional Governance Protection")}</span>
              </div>
              <p className="text-xs text-[#5A7366] leading-relaxed">
                {t("This dashboard provides privileged access to student member rosters, confidential NAAC 3.3 audit documentation, certificate issuance workflows, and official succession requests. Public access is disabled in compliance with NDLI Club security protocols.")}
              </p>
            </div>

            {/* Recognized Authorities Roster */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D7751] flex items-center space-x-2">
                <span>{t("Recognized Institutional Authorities for this Chapter:")}</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 stagger-children">
                {activeClub.authorities.map(auth => (
                  <div key={auth.role} className="p-4 rounded-2xl bg-white border border-[#E2ECE7] shadow-xs hover:shadow-md hover:border-[#0D7751]/40 transition-all card-glow space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20">
                        {t(auth.role)}
                      </span>
                      <span className="text-[#0D7751] font-bold text-[11px] flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        <span>Verified</span>
                      </span>
                    </div>
                    <div className="font-bold text-xs text-[#103125] pt-0.5">{auth.name}</div>
                    <div className="text-[11px] text-[#5A7366] font-medium">{t(auth.designation)}</div>
                    <div className="text-[11px] font-mono text-[#2E4A3E]">{auth.email}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-5 border-t border-[#E2ECE7] flex flex-col sm:flex-row items-center justify-between gap-3.5">
              <button
                onClick={() => onViewPublicProfile(activeClub)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] hover:border-[#0D7751]/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Globe2 className="h-4 w-4 text-[#0D7751]" />
                <span>{t("View Chapter Public Profile")}</span>
              </button>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                {/* A-1: Demo Sign In gated to dev-only builds */}
                {(import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_PANELS === '1') && onAuthorityQuickSignIn && presidentAuth && (
                  <button
                    onClick={() => onAuthorityQuickSignIn({
                      name: presidentAuth.name,
                      role: presidentAuth.role,
                      email: presidentAuth.email,
                      clubId: activeClub.id
                    })}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E9F5EF] hover:bg-[#d5eee0] text-[#0D7751] text-xs font-extrabold border border-[#0D7751]/30 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs hover:-translate-y-0.5"
                    title={t("Development / Review Only — Remove at client handover")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{t("Demo Sign In:")} {presidentAuth.name} ({t(presidentAuth.role)})</span>
                    <span className="text-[9px] uppercase tracking-wider bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black border border-amber-300 ml-1">
                      {t("Review Only")}
                    </span>
                  </button>
                )}

                {onAuthoritySignIn && (
                  <button
                    onClick={onAuthoritySignIn}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1A503E] to-[#103125] hover:from-[#103125] hover:to-[#0A5C3E] text-white text-xs font-extrabold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <LogIn className="h-4 w-4 text-amber-300" />
                    <span>{t("Sign In with Authority Email & OTP")}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Authorized Session Ribbon */}
      <div className="bg-gradient-to-r from-[#103125] via-[#164433] to-[#103125] text-white px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs border border-[#1A503E] shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="p-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span>
            {t("Authorized Management Session:")} <strong className="text-white font-extrabold">{authenticatedAuthority?.name || 'Club Authority'}</strong> ({t(authenticatedAuthority?.role || 'President')})
          </span>
        </div>

        <div className="flex items-center space-x-3.5">
          {onBackToClubsList && (
            <button
              onClick={onBackToClubsList}
              className="text-xs text-brand-200 hover:text-white font-medium flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t("Change Chapter")}</span>
            </button>
          )}
          {onAuthoritySignOut && (
            <>
              <span className="text-brand-600">|</span>
              <button
                onClick={onAuthoritySignOut}
                className="text-xs text-amber-300 hover:text-amber-200 font-extrabold flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t("Sign Out & Lock")}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Club Module Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6 card-glow">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
              {t("Active Institutional Chapter")}
            </span>
            <span className="text-xs text-[#5A7366] font-mono font-medium">
              {t("AISHE:")} {activeClub.aisheCode} {t("• Zone:")} {t(activeClub.zone)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#103125] tracking-tight">
            {activeClub.name}
          </h1>

          <p className="text-xs text-[#5A7366]">
            {t("Club ID:")} <strong className="font-mono text-[#103125]">{activeClub.id}</strong> {t("• Enrolled Students:")} <strong>{(memberStats ? memberStats.total : clubStudents.length).toLocaleString()}</strong>
          </p>
        </div>

        {/* Header CTA Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setShowPosterModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0D7751] to-[#109364] hover:from-[#0a5c3e] hover:to-[#0D7751] text-white text-xs font-bold transition-all flex items-center space-x-2 shadow-xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          >
            <KeyRound className="h-4 w-4 text-amber-300" />
            <span>{t("Campus Passkey & QR Hub")}</span>
          </button>

          <button
            onClick={() => onViewPublicProfile(activeClub)}
            className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] hover:bg-[#F4F8F6] text-[#2E4A3E] text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer hover:border-[#0D7751]/30"
          >
            <Globe2 className="h-4 w-4 text-[#0D7751]" />
            <span>{t("Public Profile Page")}</span>
          </button>

          <button
            onClick={() => setShowNaacPreview(true)}
            className="px-4 py-2.5 rounded-xl bg-[#E9F5EF] text-[#0D7751] hover:bg-[#d5eee0] text-xs font-extrabold transition-all flex items-center space-x-1.5 border border-[#0D7751]/30 cursor-pointer hover:-translate-y-0.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{t("NAAC 3.3 Audit Report")}</span>
          </button>
        </div>
      </div>

      {/* Executive Council Member — View-Only Mode Banner */}
      {authenticatedAuthority && (authenticatedAuthority.role?.toLowerCase().includes('executive') || authenticatedAuthority.role === 'club_executive') && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start space-x-3 shadow-xs animate-in fade-in">
          <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <p className="font-black text-amber-950 uppercase tracking-wider">
              Executive Council Member — View-Only Mode
            </p>
            <p className="text-amber-800">
              You are signed in as an Executive Council Member. You have complete read-only visibility into Module 2 club administration dashboards for institutional transparency. Administrative mutations (sub-club creation, passkey resets, student approval/rejections) are reserved for Main Admins (Patron, President, Secretary).
            </p>
          </div>
        </div>
      )}

      {/* Internal Navigation Tabs (Requirements 3c.i to 3c.vii) */}
      <div className="tab-scroll flex items-center gap-1.5 overflow-x-auto p-1.5 bg-[#F4F8F6] rounded-2xl border border-[#E2ECE7] shadow-2xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>{t("360° Analytics")}</span>
        </button>

        <button
          onClick={() => setActiveTab('membership_approval')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'membership_approval'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <UserPlus className="h-4 w-4 text-emerald-400" />
          <span>{activeClub.category === 'School' ? t("School Roster & Bulk Upload") : t("Membership Approval & Roster")}</span>
        </button>

        {activeClub.category !== 'School' && (
          <button
            onClick={() => setActiveTab('subclubs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'subclubs'
                ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
                : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <Layers className="h-4 w-4 text-emerald-400" />
            <span>{t("Sub-Clubs (1+N)")}</span>
          </button>
        )}

        {activeClub.category === 'School' && (
          <button
            onClick={() => setActiveTab('school_roster')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'school_roster'
                ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
                : 'text-[#2E4A3E] hover:bg-white/80'
            }`}
          >
            <SchoolIcon className="h-4 w-4 text-amber-400" />
            <span>{t("School Roster & Cards")}</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('activities')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'activities'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <Calendar className="h-4 w-4 text-amber-300" />
          <span>{t("Activities & Events (")}{backendEvents.length})</span>
        </button>

        {activeClub.category !== 'School' && (
        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'libraries'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <BookOpen className="h-4 w-4 text-emerald-400" />
          <span>{t("3-Tier NDLI Libraries")}</span>
        </button>
        )}

        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <LifeBuoy className="h-4 w-4" />
          <span>{t("Support Desk (")}{clubTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('succession')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'succession'
              ? 'bg-[#1A503E] text-white shadow-sm shadow-[#1A503E]/30 scale-[1.02]'
              : 'text-[#2E4A3E] hover:bg-white/80'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>{t("Authority Succession")}</span>
        </button>
      </div>

      {/* TAB 1: 360° Overview & NAAC Metrics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 stagger-children">
            <div className="bg-white p-6 rounded-2xl border border-[#E2ECE7] shadow-xs hover:shadow-lg hover:border-[#0D7751]/40 hover:-translate-y-0.5 transition-all duration-300 card-glow space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Total Members Till Date")}</span>
              <div className="text-3xl font-black text-[#103125] tracking-tight">
                {memberStats
                  ? memberStats.total.toLocaleString()
                  : clubStudents.length.toLocaleString()}
              </div>
              <div className="text-xs text-[#5A7366] font-medium">
                {memberStats
                  ? `${memberStats.active.toLocaleString()} ${t("Active")} + ${memberStats.inactive.toLocaleString()} ${t("Inactive")}`
                  : `${clubStudents.filter((s) => s.status === 'Active').length.toLocaleString()} ${t("Active")} + ${clubStudents.filter((s) => s.status !== 'Active').length.toLocaleString()} ${t("Inactive")}`}
              </div>
              <div className="text-[11px] text-[#0D7751] font-semibold flex items-center gap-1 pt-1.5 border-t border-[#E2ECE7]/70 mt-1">
                <span>{t("Passkey:")} <strong className="font-mono">{activeClub.passkey}</strong></span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-[#E2ECE7] shadow-xs hover:shadow-lg hover:border-[#0D7751]/40 hover:-translate-y-0.5 transition-all duration-300 card-glow space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Annual Activities")}</span>
              <div className="text-3xl font-black text-[#103125] tracking-tight">{backendEvents.length}</div>
              <div className="text-[11px] text-[#0D7751] font-semibold">{t("Verifiable events on record")}</div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-[#E2ECE7] shadow-xs hover:shadow-lg hover:border-[#0D7751]/40 hover:-translate-y-0.5 transition-all duration-300 card-glow space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Certificates Awarded")}</span>
              <div className="text-3xl font-black text-[#103125] tracking-tight">
                {clubStudents.reduce((acc, s) => acc + s.approvedCertificateCount, 0)}
              </div>
              <div className="text-[11px] text-[#B45309] font-semibold">{t("Authorized by Club President")}</div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-[#E2ECE7] shadow-xs hover:shadow-lg hover:border-[#0D7751]/40 hover:-translate-y-0.5 transition-all duration-300 card-glow space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Open Tickets")}</span>
              <div className="text-3xl font-black text-[#103125] tracking-tight">
                {clubTickets.filter(t => t.status !== 'Resolved').length}
              </div>
              <div className="text-[11px] text-[#5A7366]">{t("Routed to IIT KGP")} {t(activeClub.zone)} {t("Zone")}</div>
            </div>
          </div>

          {/* Institutional Passkey & Campus QR Enrollment Hub */}
          <div className="bg-white rounded-3xl border border-[#E2ECE7] p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2ECE7] pb-4">
              <div>
                <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-3 py-1 rounded-full mb-1">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{t("Institutional Authority Desk • Confidential Distribution")}</span>
                </div>
                <h3 className="text-xl font-bold text-[#103125]">
                  {t("Official Campus Passkey & QR Enrollment Hub")}
                </h3>
                <p className="text-xs text-[#5A7366] mt-0.5">
                  {t("Only authorized club officers can view and distribute these credentials. Share with your enrolled students so they can link their NDLI accounts.")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPosterModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#E9F5EF] hover:bg-[#d5eee0] text-[#0D7751] text-xs font-bold transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30 cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>{t("Print Campus Notice Poster")}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Passkey Panel */}
              <div className="lg:col-span-7 bg-[#F4F8F6] p-6 rounded-2xl border-2 border-dashed border-[#0D7751]/40 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">
                    {t("Official Institutional Passkey")}
                  </span>
                  <span className="text-[11px] font-bold text-[#0D7751] bg-white px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
                    {t("Active & Verified")}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#E2ECE7] text-center shadow-xs">
                  <div className="font-mono text-3xl sm:text-4xl font-black text-[#103125] tracking-widest">
                    {activeClub.passkey}
                  </div>
                  <div className="text-[11px] text-[#5A7366] mt-1 font-medium">
                    {t("Chapter Code:")} {activeClub.aisheCode} • {activeClub.name}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={handleCopyPasskey}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-[#E9F5EF] text-[#2E4A3E] text-xs font-bold border border-[#E2ECE7] shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    {copiedPasskey ? <Check className="h-4 w-4 text-[#0D7751]" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedPasskey ? t("Passkey Copied!") : t("Copy Passkey")}</span>
                  </button>

                  <button
                    onClick={handleCopyInviteMessage}
                    className="px-4 py-2 rounded-xl bg-[#0D7751] hover:bg-[#103125] text-white text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    {copiedInvite ? <Check className="h-4 w-4 text-amber-300" /> : <Share2 className="h-4 w-4" />}
                    <span>{copiedInvite ? t("Invite Copied to Clipboard!") : t("Copy Student Invite Message")}</span>
                  </button>
                </div>

                <div className="text-[11px] text-[#5A7366] bg-white p-3 rounded-xl border border-[#E2ECE7] space-y-1">
                  <strong className="text-[#103125] block font-semibold">{t("How to distribute safely to students:")}</strong>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#5A7366]">
                    <li>{t("Share via institutional student email circular or official campus LMS (Moodle, Google Classroom).")}</li>
                    <li>{t("Post the printable QR poster on the central library notice board.")}</li>
                    <li>{t("Do not publish on unverified public social media to prevent unauthorized membership.")}</li>
                  </ul>
                </div>
              </div>

              {/* QR Code Panel */}
              <div className="lg:col-span-5 bg-[#F4F8F6] p-6 rounded-2xl border border-[#E2ECE7] flex flex-col items-center justify-center text-center space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">
                  {t("Dynamic Campus Self-Join QR")}
                </span>

                {qrDataUrl ? (
                  <div className="p-3 bg-white rounded-2xl border border-[#E2ECE7] shadow-sm">
                    <img
                      src={qrDataUrl}
                      alt={t("Club QR Code")}
                      className="h-44 w-44 rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="h-44 w-44 rounded-2xl bg-white border border-[#E2ECE7] flex items-center justify-center text-xs text-[#5A7366]">
                    {t("Generating QR…")}
                  </div>
                )}

                <div className="text-xs text-[#5A7366] max-w-xs leading-relaxed">
                  {t("Students scan with mobile camera to land on the self-join portal with this chapter's token pre-linked.")}
                </div>

                <div className="flex gap-2 pt-1">
                  {qrDataUrl && (
                    <a
                      href={qrDataUrl}
                      download={`${activeClub.aisheCode}_NDLI_Club_QR.png`}
                      className="px-3.5 py-1.5 rounded-lg bg-white border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#E9F5EF] flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t("Download QR Image")}</span>
                    </a>
                  )}

                  <button
                    onClick={() => setShowPosterModal(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1A503E] text-white text-xs font-bold hover:bg-[#103125] flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>{t("Poster Preview")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Institutional Leadership Quorum Preview */}
          <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-[#E2ECE7] pb-3">
              <h3 className="font-bold text-[#103125] text-base flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-[#0D7751]" />
                <span>{t("Designated 4-Tier Institutional Authorities")}</span>
              </h3>
              <button
                onClick={() => setActiveTab('succession')}
                className="text-xs text-[#0D7751] font-bold hover:underline"
              >
                {t("Change Authority Request →")}
                                            </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {activeClub.authorities.map(auth => (
                <div key={auth.role} className="p-4 rounded-xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0D7751]">{t(auth.role)}</span>
                  <div className="font-bold text-sm text-[#103125]">{auth.name}</div>
                  <div className="text-[#5A7366] text-[11px]">{t(auth.designation)}</div>
                  <div className="text-[#2E4A3E] text-[11px] pt-1">{auth.email}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Institutional Branding (Transparent PNG Logo & Signing Signature) */}
          <InstitutionalBrandingPanel
            clubCode={activeClub.id}
            isReadOnly={!isMainAuthority}
          />
        </div>
      )}

      {/* TAB 2: Membership Approval & Existing Roster (Campus Specification §4.A) */}
      {activeTab === 'membership_approval' && (
        activeClub.category === 'School' ? (
          <SchoolBulkUploadPanel
            clubCode={activeClub.id}
            schoolName={activeClub.name}
            isAuthority={Boolean(isMainAuthority)}
          />
        ) : (
          <StudentMembershipApprovalPanel
            clubCode={activeClub.id}
            clubName={activeClub.name}
            isMainAuthority={isMainAuthority}
          />
        )
      )}

      {/* TAB 3: Activities & Workshops */}
      {activeTab === 'activities' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-[#0D7751]" />
                <span>{t("Annual Co-Curricular Activities & Workshops")}</span>
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t("Organize online/offline activities, send notifications, and approve attendee certificates.")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isExecutive && (
                <button
                  onClick={() => setShowInstitutionalEventModal(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Calendar className="h-4 w-4 text-amber-300" />
                  <span>{activeClub.category === 'School' ? t("Schedule Event") : t("Schedule Institutional / Multi-Club Event")}</span>
                </button>
              )}
            </div>
          </div>

          {backendEvents.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-emerald-700" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                  Scheduled Events (Dynamic 30-Minute Participation Window)
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {backendEvents.map(evt => (
                  <EventParticipationCard
                    key={evt.id}
                    event={evt}
                    isAuthority={Boolean(isAuthorityAuthenticated)}
                    currentClubCode={activeClub.id}
                    isSchool={activeClub.category === 'School'}
                    onRefresh={loadCampusData}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 px-4 rounded-2xl bg-[#F4F8F6] border border-dashed border-[#E2ECE7] space-y-3">
              <Calendar className="h-10 w-10 text-[#0D7751] mx-auto opacity-60" />
              <h4 className="text-sm font-bold text-[#103125]">{t("No Scheduled Activities or Events Yet")}</h4>
              <p className="text-xs text-[#5A7366] max-w-md mx-auto">
                {activeClub.category === 'School'
                  ? t("Activities scheduled for this club appear here in real-time. Use 'Schedule Event' above to create and publish events.")
                  : t("Activities scheduled for this club appear here in real-time. Use 'Schedule Institutional / Multi-Club Event' above to create and publish verifiable events.")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Support & Grievance Redressal (Requirement 3c.iv) */}
      {activeTab === 'tickets' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <LifeBuoy className="h-5 w-5 text-[#0D7751]" />
                <span>{t("Central Grievance & Issue Redressal Desk")}</span>
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t("Raise tickets directly to IIT Kharagpur zonal administrators for swift technical and administrative resolution.")}
                                            </p>
            </div>

            <button
              onClick={() => setShowNewTicketModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <Send className="h-4 w-4 text-amber-300" />
              <span>{t("Raise Support Ticket")}</span>
            </button>
          </div>

          <div className="space-y-3">
            {clubTickets.length > 0 ? (
              clubTickets.map(tkt => (
                <div key={tkt.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-[#103125] bg-white px-2 py-0.5 rounded border border-[#E2ECE7]">
                        {tkt.id}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        tkt.priority === 'Critical' ? 'bg-rose-100 text-rose-800' :
                        tkt.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'
                      }`}>
                        {t(tkt.priority)} {t("Priority")}
                                                        </span>
                      <span className="text-xs text-[#5A7366] font-medium">{t(tkt.category)}</span>
                    </div>

                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      tkt.status === 'Resolved' ? 'bg-brand-100 text-brand-800' :
                      tkt.status === 'In Progress' ? 'bg-brand-100 text-brand-800 animate-pulse' : 'bg-amber-100 text-amber-800'
                    }`}>
                      ● {t(tkt.status)}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-[#103125]">{tkt.title}</h4>
                  <p className="text-xs text-[#5A7366]">{tkt.description}</p>

                  <div className="pt-2 border-t border-[#E2ECE7] flex justify-between items-center text-[11px] text-[#5A7366]">
                    <span>{t("Created:")} {tkt.createdAt} {t("• Assigned:")} {tkt.assignedTo}</span>
                    {tkt.resolutionNotes && (
                      <span className="text-brand-700 font-medium">{t("Notes:")} {tkt.resolutionNotes}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-[#5A7366]">
                {t("No support tickets raised currently. All systems operational.")}
                                                </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Secure Authority Succession Workflow (Requirement 3c.v) */}
      {activeTab === 'succession' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <Lock className="h-5 w-5 text-[#0D7751]" />
                <span>{t("Institutional Authority Succession & Transition")}</span>
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                {t("Secure dual-verification process to transfer Patron, President, or Secretary leadership with appointment-letter review and a full audit trail.")}
                                            </p>
            </div>

            {!isExecutive ? (
              <button
                onClick={() => setShowSuccessionModal(true)}
                className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <UserPlus className="h-4 w-4 text-amber-300" />
                <span>{t("Initiate Authority Transfer")}</span>
              </button>
            ) : (
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                {t("Authority succession can only be proposed by Main Club Admins (Patron, President, Secretary).")}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Pending & Historical Succession Requests")}</h4>
            {clubAuthRequests.length > 0 ? (
              clubAuthRequests.map(req => (
                <div key={req.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-[#103125]">{req.id} {t("• Role:")} {t(req.role)}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      req.status === 'Approved & Updated' ? 'bg-brand-100 text-brand-800' :
                      req.status === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {t(req.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-ink-700">
                    <div><strong>{t("Outgoing Officer:")}</strong> {t(req.currentName)}</div>
                    <div><strong>{t("Incoming Officer:")}</strong> {req.proposedName} ({req.proposedEmail})</div>
                  </div>
                  <div className="text-[11px] text-[#5A7366]">
                    {t("Order Doc:")} <span className="font-mono">{req.officialDocName}</span> {t("• Submitted:")} {req.submittedAt}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-[#5A7366] bg-[#F4F8F6] rounded-2xl border border-dashed border-[#E2ECE7]">
                {t("No pending authority transition requests. Quorum is active and stable.")}
                                                </div>
            )}
          </div>
        </div>
      )}


      {/* MODAL 4: Raise Support Ticket */}
      {showNewTicketModal && (
        <div onClick={closeAnyDialog} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Raise Support Ticket to IIT Kharagpur")} tabIndex={-1} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-[#103125]">{t("Raise Support Ticket to IIT Kharagpur")}</h3>
            <form onSubmit={handleCreateTicketSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Issue Category *")}</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-ink-300 bg-white"
                >
                  <option value="Registration & Passkey">{t("Registration & Passkey")}</option>
                  <option value="Certificate Approval">{t("Certificate Approval")}</option>
                  <option value="Event Logistics">{t("Event Logistics")}</option>
                  <option value="Technical Glitch">{t("Technical Glitch")}</option>
                  <option value="Data Correction">{t("Data Correction")}</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Priority Level")}</label>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-ink-300 bg-white"
                >
                  <option value="Low">{t("Low")}</option>
                  <option value="Medium">{t("Medium")}</option>
                  <option value="High">{t("High")}</option>
                  <option value="Critical">{t("Critical")}</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Subject / Summary *")}</label>
                <input
                  type="text"
                  placeholder={t("e.g. Student passkey sync error for fresh batch")}
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-ink-300"
                />
              </div>
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Detailed Description *")}</label>
                <textarea
                  rows={3}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-ink-300"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2 rounded-lg text-ink-600 font-bold"
                >
                  {t("Cancel")}
                                                  </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  {t("Submit Ticket")}
                                                  </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Authority Succession Dual Verification */}
      {showSuccessionModal && (
        <div onClick={closeAnyDialog} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Initiate Official Authority Succession")} tabIndex={-1} className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded">
                {t("Dual-Verification Security Gate")}
                                            </span>
              <h3 className="text-base font-bold text-[#103125]">{t("Initiate Official Authority Succession")}</h3>
            </div>
            <form onSubmit={handleAuthorityChangeSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-ink-700 block mb-1">{t("Authority Role")}</label>
                  <select
                    value={succRole}
                    onChange={(e) => setSuccRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-ink-300 bg-white"
                  >
                    <option value="President">{t("President")}</option>
                    <option value="Patron">{t("Patron (VC / Principal)")}</option>
                    <option value="Secretary">{t("Secretary")}</option>
                    <option value="Executive Member">{t("Executive Member")}</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-ink-700 block mb-1">{t("Proposed Full Name *")}</label>
                  <input
                    type="text"
                    placeholder={t("e.g. Dr. Subrata Roy")}
                    value={succProposedName}
                    onChange={(e) => setSuccProposedName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-ink-300"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Official Institutional Email *")}</label>
                <input
                  type="email"
                  placeholder={t("e.g. new.president@college.example.edu")}
                  value={succProposedEmail}
                  onChange={(e) => setSuccProposedEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-ink-300"
                />
              </div>

              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Official Transfer/Appointment Order File")}</label>
                <input
                  type="text"
                  value={succDocName}
                  onChange={(e) => setSuccDocName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-ink-300 font-mono text-[11px]"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <span className="font-bold text-amber-900 block text-[11px]">{t("Two-Factor Authorization Check:")}</span>
                <p className="text-[11px] text-amber-800">
                  {t("Enter 6-digit confirmation PIN (Demo code:")} <strong>948201</strong>{t(") to simulate sign-off by incumbent officer.")}
                                                  </p>
                <input
                  type="text"
                  placeholder={t("Enter 948201")}
                  value={succOtpEntered}
                  onChange={(e) => setSuccOtpEntered(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-amber-300 text-center font-mono font-bold tracking-widest text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setShowSuccessionModal(false)}
                  className="px-4 py-2 rounded-lg text-ink-600 font-bold"
                >
                  {t("Cancel")}
                                                  </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  {t("Submit for IIT KGP Approval")}
                                                  </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: NAAC Report Preview */}
      {showNaacPreview && (
        <div onClick={closeAnyDialog} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("NAAC compliance record preview")} tabIndex={-1} className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-2xl border border-[#E2ECE7] space-y-6 animate-in fade-in my-8">
            <div className="flex justify-between items-start border-b border-[#E2ECE7] pb-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#0D7751]">
                  {t("NAAC Criteria 3.3.3 & 3.3.4 Compliance Record")}
                                                  </span>
                <h3 className="text-xl font-bold text-[#103125] mt-0.5">
                  {t("Annual Co-Curricular & Extension Activity Audit")}
                                                  </h3>
                <div className="text-xs text-[#5A7366]">
                  {t("Institution:")} <strong>{activeClub.name}</strong> {t("• AISHE:")} {activeClub.aisheCode}
                </div>
              </div>
              <button
                onClick={() => setShowNaacPreview(false)}
                className="text-xs font-bold text-ink-600 hover:text-ink-900"
              >
                <X className="h-3.5 w-3.5 inline -mt-0.5" /> {t("Close")}
                                            </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-ink-200">
                <thead className="bg-[#F4F8F6] text-ink-600 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-2.5">{t("Activity Title")}</th>
                    <th className="p-2.5">{t("Date")}</th>
                    <th className="p-2.5">{t("Category")}</th>
                    <th className="p-2.5">{t("Participants")}</th>
                    <th className="p-2.5">{t("Verification")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-800">
                  {backendEvents.length > 0 ? (
                    backendEvents.map(evt => (
                      <tr key={evt.id}>
                        <td className="p-2.5 font-bold">{evt.title}</td>
                        <td className="p-2.5">{evt.start_time ? new Date(evt.start_time).toLocaleDateString() : 'N/A'}</td>
                        <td className="p-2.5">{evt.scope === 'multi_club' ? t("Multi-Club Event") : t("Institutional Event")}</td>
                        <td className="p-2.5 font-semibold">{evt.participants_count ?? 0}</td>
                        <td className="p-2.5 text-brand-700 font-bold"><Check className="h-3.5 w-3.5 inline -mt-0.5" /> {t("NDLI Verified")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-[#5A7366] italic">
                        {t("No official events recorded yet for this academic period.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-ink-100">
              <div className="text-[11px] text-ink-600">
                {t("Certified by NDLI Nodal Center, IIT Kharagpur")}
                                            </div>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125]"
              >
                {t("Print / Save Document (PDF)")}
                                            </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Printable Campus Enrollment Notice Poster */}
      {showPosterModal && (
        <div 
          onClick={() => setShowPosterModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("Campus Enrollment Notice Poster")}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-10 shadow-2xl border border-ink-200 relative animate-in fade-in space-y-6 my-8"
          >
            {/* Top Close */}
            <button
              onClick={() => setShowPosterModal(false)}
              className="absolute right-5 top-5 p-1 rounded-full text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Poster Header (Emblem & Branding) */}
            <div className="text-center space-y-2 border-b-2 border-[#103125] pb-5">
              <div className="flex items-center justify-center space-x-2 text-xs font-bold text-[#0D7751] uppercase tracking-wider">
                <span>{t("Government of India")}</span>
                <span>•</span>
                <span>{t("Ministry of Education")}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#103125] tracking-tight">
                {t("National Digital Library of India Club")}
              </h2>
              <div className="text-xs font-bold text-[#B45309]">
                {t("National Coordinating Institute: IIT Kharagpur")}
              </div>
              <div className="pt-2">
                <span className="text-xs font-extrabold px-3 py-1 bg-[#E9F5EF] text-[#0D7751] rounded-full border border-[#0D7751]/30">
                  {t("Approved Campus Club")}
                </span>
              </div>
            </div>

            {/* Poster Body */}
            <div className="text-center space-y-4">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#103125] leading-tight">
                  {activeClub.name}
                </h3>
                <div className="text-xs text-[#5A7366] font-mono mt-1">
                  {t("AISHE Code:")} {activeClub.aisheCode} • {activeClub.district}, {activeClub.state}
                </div>
              </div>

              <div className="bg-[#F4F8F6] p-6 rounded-2xl border-2 border-dashed border-[#0D7751] space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#0D7751]">
                  {t("Official Campus Enrollment Passkey")}
                </span>
                <div className="font-mono text-3xl sm:text-4xl font-black text-[#103125] tracking-widest">
                  {activeClub.passkey}
                </div>
                <p className="text-[11px] text-[#5A7366] max-w-md mx-auto">
                  {t("All enrolled undergraduate, postgraduate students, research scholars, and faculty members can join this official chapter.")}
                </p>
              </div>

              {/* Centered QR code */}
              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center space-y-2 pt-2">
                  <div className="p-3 bg-white border-2 border-[#103125] rounded-2xl shadow-md">
                    <img src={qrDataUrl} alt={t("Campus Join QR")} className="h-48 w-48 rounded-xl" />
                  </div>
                  <span className="text-xs font-bold text-[#103125] tracking-wider uppercase">
                    {t("Scan with Smartphone Camera to Join")}
                  </span>
                </div>
              )}

              {/* 3 Step Joining Instructions */}
              <div className="bg-white rounded-xl border border-[#E2ECE7] p-4 text-left grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-[#0D7751]">1. Scan or Visit</div>
                  <div className="text-[11px] text-[#5A7366]">Scan the QR above or visit the portal at ndli.club.</div>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-[#0D7751]">2. Enter Passkey</div>
                  <div className="text-[11px] text-[#5A7366]">Provide your name, campus email and passkey <strong className="font-mono">{activeClub.passkey}</strong>.</div>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-[#0D7751]">3. Access & Certificates</div>
                  <div className="text-[11px] text-[#5A7366]">Participate in webinars, quizzes and earn verifiable certificates.</div>
                </div>
              </div>
            </div>

            {/* Poster Footer & Actions */}
            <div className="pt-4 border-t border-[#E2ECE7] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-[11px] text-[#5A7366] text-center sm:text-left">
                <span>{t("Authorized by:")} <strong>{activeClub.authorities.find(a => a.role === 'President')?.name || 'Club President'}</strong></span>
                <span className="block text-[10px] text-[#5A7366]">{t("NDLI Institutional Club Committee")}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPosterModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors cursor-pointer"
                >
                  {t("Close")}
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-[#0D7751] hover:bg-[#103125] text-white text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>{t("Print Campus Poster")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Sub-Clubs Management (HEI Only) */}
      {activeTab === 'subclubs' && activeClub.category !== 'School' && (
        <SubClubManagementPanel
          clubCode={activeClub.id}
          clubName={activeClub.name}
          isAuthority={isMainAuthority}
          isExecutive={isExecutive}
          onNavigateToRoster={() => setActiveTab('membership_approval')}
        />
      )}

      {/* TAB 9: School Offline-First Roster & Tangible Identity Cards (School Only) */}
      {activeTab === 'school_roster' && activeClub.category === 'School' && (
        <SchoolBulkUploadPanel
          clubCode={activeClub.id}
          schoolName={activeClub.name}
          isAuthority={isAuthorityAuthenticated}
        />
      )}

      {/* TAB 10: 3-Tier Curated NDLI Libraries */}
      {activeTab === 'libraries' && (
        <CuratedLibraryHub
          clubId={activeClub.id}
          isAuthority={isAuthorityAuthenticated}
          isStudent={!isAuthorityAuthenticated}
        />
      )}

      {/* MODAL: Institutional & Multi-Club Event Creator */}
      {showInstitutionalEventModal && (
        <InstitutionalEventModal
          isOpen={showInstitutionalEventModal}
          onClose={() => setShowInstitutionalEventModal(false)}
          clubCode={activeClub.id}
          subClubs={subClubsList}
          canonicalClubs={canonicalClubs}
          isSchool={activeClub.category === 'School'}
          onEventCreated={() => {
            loadCampusData();
            setShowInstitutionalEventModal(false);
          }}
        />
      )}
    </div>
  );
};
