import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  Calendar, 
  BarChart3, 
  LifeBuoy, 
  ShieldCheck, 
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
  LogOut
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
import { RosterManager } from './roster/RosterManager';

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
}

export const ClubModuleView: React.FC<ClubModuleViewProps> = ({
  activeClub,
  students,
  activities,
  tickets,
  authorityRequests,
  isAuthorityAuthenticated = false,
  authenticatedAuthority = null,
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
    'overview' | 'roster' | 'activities' | 'tickets' | 'succession' | 'shield' | 'student_dash'
  >('overview');

  // New Activity Form State
  const [showNewActivityModal, setShowNewActivityModal] = useState(false);
  const [actTitle, setActTitle] = useState('');
  const [actCategory, setActCategory] = useState<'Quiz' | 'Webinar' | 'Reading Challenge' | 'Workshop' | 'Seminar'>('Workshop');
  const [actDate, setActDate] = useState('2026-10-25');
  const [actTime, setActTime] = useState('02:00 PM - 04:00 PM IST');
  const [actMode, setActMode] = useState<'Online' | 'Offline In-Campus' | 'Hybrid'>('Offline In-Campus');
  const [actDesc, setActDesc] = useState('');
  const [actIsInter, setActIsInter] = useState(false);
  const [actCoHost, setActCoHost] = useState('');
  const [notifyMembers, setNotifyMembers] = useState(true);

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

  // S1: shared dialog behaviour for the remaining inline dialogs — backdrop
  // click and Escape close whichever dialog is open (only one at a time).
  const anyDialogOpen =
    showNewActivityModal || showNewTicketModal || showSuccessionModal || showNaacPreview;
  const closeAnyDialog = () => {
    setShowNewActivityModal(false);
    setShowNewTicketModal(false);
    setShowSuccessionModal(false);
    setShowNaacPreview(false);
  };
  useModalBehavior(anyDialogOpen, closeAnyDialog);

  // Students feed the overview / activities tabs; the ROSTER tab (M5-D4) is
  // live API data and does not read this demo collection.
  const clubStudents = students.filter(s => s.clubId === activeClub.id);

  const clubActivities = activities.filter(a => a.clubId === activeClub.id || a.isInterInstitutional);
  const clubTickets = tickets.filter(t => t.clubId === activeClub.id);
  const clubAuthRequests = authorityRequests.filter(r => r.clubId === activeClub.id);

  // Handler: Create Activity
  const handleCreateActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle || !actDesc) return;

    const newAct: ClubActivity = {
      id: `ACT-2026-${Math.floor(100 + Math.random() * 900)}`,
      clubId: activeClub.id,
      clubName: activeClub.name,
      title: actTitle,
      category: actCategory,
      date: actDate,
      time: actTime,
      mode: actMode,
      description: actDesc,
      participantsCount: 0,
      status: 'Upcoming',
      isInterInstitutional: actIsInter,
      coHostClubs: actCoHost ? [actCoHost] : undefined,
      securityAuditStatus: 'Verified & Safe',
      hasQuiz: actCategory === 'Quiz',
      resourceAttachments: ['Event-Reading-Guidelines.pdf']
    };

    onCreateActivity(newAct);
    setActTitle('');
    setActDesc('');
    setShowNewActivityModal(false);
  };

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
      proposedPhone: succProposedPhone || '+91 9800000000',
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
            className="flex items-center space-x-1.5 text-xs font-bold text-[#2E4A3E] hover:text-[#103125] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("Back to National Chapters Directory")}</span>
          </button>
        )}

        <div className="bg-white rounded-3xl border border-[#E2ECE7] shadow-xl overflow-hidden">
          {/* Top Security Banner */}
          <div className="bg-gradient-to-r from-[#103125] via-[#1A503E] to-[#103125] text-white p-8 text-center relative">
            <div className="inline-flex p-3.5 rounded-2xl bg-amber-400/20 border border-amber-300/30 text-amber-300 mb-3">
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t("Club Authority Authentication Required")}
            </h1>
            <p className="text-xs sm:text-sm text-brand-200 mt-2 max-w-xl mx-auto">
              {t("The Management Dashboard for")} <strong className="text-white">{activeClub.name}</strong> {t("is strictly locked behind authorized institutional credentials.")}
            </p>
            <div className="inline-flex items-center space-x-2 text-[11px] font-mono bg-white/10 px-3 py-1 rounded-full mt-3 text-brand-200 border border-white/10">
              <span>{t("AISHE:")} {activeClub.aisheCode}</span>
              <span>•</span>
              <span>{t("Zone:")} {t(activeClub.zone)}</span>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Security Explanation */}
            <div className="bg-[#F4F8F6] p-4 rounded-2xl border border-[#E2ECE7] space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#103125]">
                <ShieldCheck className="h-4 w-4 text-[#0D7751]" />
                <span>{t("Institutional Governance Protection")}</span>
              </div>
              <p className="text-xs text-[#5A7366] leading-relaxed">
                {t("This dashboard provides privileged access to student member rosters, confidential NAAC 3.3 audit documentation, certificate issuance workflows, and official succession requests. Public access is disabled in compliance with NDLI Club security protocols.")}
              </p>
            </div>

            {/* Recognized Authorities Roster */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D7751]">
                {t("Recognized Institutional Authorities for this Chapter:")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeClub.authorities.map(auth => (
                  <div key={auth.role} className="p-3.5 rounded-xl bg-white border border-[#E2ECE7] shadow-2xs space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-extrabold uppercase px-2 py-0.5 rounded bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20">
                        {t(auth.role)}
                      </span>
                      <span className="text-[#0D7751] font-bold text-[11px]">✓ Verified</span>
                    </div>
                    <div className="font-bold text-xs text-[#103125] pt-0.5">{auth.name}</div>
                    <div className="text-[11px] text-[#5A7366]">{t(auth.designation)}</div>
                    <div className="text-[11px] font-mono text-[#2E4A3E]">{auth.email}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#E2ECE7] flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => onViewPublicProfile(activeClub)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Globe2 className="h-4 w-4 text-[#0D7751]" />
                <span>{t("View Chapter Public Profile")}</span>
              </button>

              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                {onAuthorityQuickSignIn && presidentAuth && (
                  <button
                    onClick={() => onAuthorityQuickSignIn({
                      name: presidentAuth.name,
                      role: presidentAuth.role,
                      email: presidentAuth.email,
                      clubId: activeClub.id
                    })}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E9F5EF] hover:bg-[#d5eee0] text-[#0D7751] text-xs font-bold border border-[#0D7751]/30 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                    title={t("Test login as verified authority for evaluation")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{t("Demo Sign In:")} {presidentAuth.name} ({t(presidentAuth.role)})</span>
                  </button>
                )}

                {onAuthoritySignIn && (
                  <button
                    onClick={onAuthoritySignIn}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
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
      <div className="bg-[#103125] text-white px-5 py-2.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs border border-[#1A503E] shadow-sm">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-4 w-4 text-amber-300 shrink-0" />
          <span>
            {t("Authorized Management Session:")} <strong className="text-white">{authenticatedAuthority?.name || 'Club Authority'}</strong> ({t(authenticatedAuthority?.role || 'President')})
          </span>
        </div>

        <div className="flex items-center space-x-3">
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
                className="text-xs text-amber-300 hover:text-amber-200 font-bold flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t("Sign Out & Lock")}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Club Module Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
              {t("Active Institutional Chapter")}
                                      </span>
            <span className="text-xs text-[#5A7366] font-mono">
              {t("AISHE:")} {activeClub.aisheCode} {t("• Zone:")} {t(activeClub.zone)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#103125] tracking-tight">
            {activeClub.name}
          </h1>

          <p className="text-xs text-[#5A7366]">
            {t("Club ID:")} <strong className="font-mono text-[#103125]">{activeClub.id}</strong> {t("• Enrolled Students:")} <strong>{clubStudents.length.toLocaleString()}</strong>
          </p>
        </div>

        {/* Header CTA Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onViewPublicProfile(activeClub)}
            className="px-4 py-2 rounded-xl border border-[#E2ECE7] hover:bg-[#F4F8F6] text-[#2E4A3E] text-xs font-bold transition-colors flex items-center space-x-1.5"
          >
            <Globe2 className="h-4 w-4 text-[#0D7751]" />
            <span>{t("Public Profile Page")}</span>
          </button>

          <button
            onClick={() => setShowNaacPreview(true)}
            className="px-4 py-2 rounded-xl bg-[#E9F5EF] text-[#0D7751] hover:bg-[#d5eee0] text-xs font-bold transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{t("NAAC 3.3 Audit Report")}</span>
          </button>
        </div>
      </div>

      {/* Internal Navigation Tabs (Requirements 3c.i to 3c.vii) */}
      <div className="tab-scroll flex items-center gap-1 overflow-x-auto p-1.5 bg-white rounded-2xl border border-[#E2ECE7] shadow-2xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>{t("360° Analytics")}</span>
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'roster'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>{t("Student Roster (")}{clubStudents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activities')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'activities'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>{t("Activities & Workshops (")}{clubActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('shield')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'shield'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-brand-400" />
          <span>{t("Inter-Club Shield")}</span>
          <span className="bg-[#B45309] text-white text-[11px] px-1.5 py-0.2 rounded font-black">{t("CROSS-CAMPUS")}</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'tickets'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <LifeBuoy className="h-4 w-4" />
          <span>{t("Support Desk (")}{clubTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('succession')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'succession'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>{t("Authority Succession")}</span>
        </button>

        <button
          onClick={() => setActiveTab('student_dash')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'student_dash'
              ? 'bg-[#B45309] text-white shadow-xs'
              : 'text-[#B45309] hover:bg-amber-50'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>{t("Student View")}</span>
        </button>
      </div>

      {/* TAB 1: 360° Overview & NAAC Metrics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Enrolled Members")}</span>
              <div className="text-3xl font-extrabold text-[#103125]">{clubStudents.length.toLocaleString()}</div>
              <div className="text-[11px] text-[#0D7751] font-semibold flex items-center gap-1">
                <span>{t("Passkey:")} {activeClub.passkey}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Annual Activities")}</span>
              <div className="text-3xl font-extrabold text-[#103125]">{clubActivities.length}</div>
              <div className="text-[11px] text-[#0D7751] font-semibold">{t("Sample NAAC 3.3 records prepared")}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Certificates Awarded")}</span>
              <div className="text-3xl font-extrabold text-[#103125]">
                {clubStudents.reduce((acc, s) => acc + s.approvedCertificateCount, 0)}
              </div>
              <div className="text-[11px] text-[#B45309] font-semibold">{t("Authorized by Club President")}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A7366]">{t("Open Tickets")}</span>
              <div className="text-3xl font-extrabold text-[#103125]">
                {clubTickets.filter(t => t.status !== 'Resolved').length}
              </div>
              <div className="text-[11px] text-[#5A7366]">{t("Routed to IIT KGP")} {t(activeClub.zone)} {t("Zone")}</div>
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
        </div>
      )}

      {/* TAB 2: Student Roster (M5-D4) — the live API-backed manager. */}
      {activeTab === 'roster' && <RosterManager />}

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

            <button
              onClick={() => setShowNewActivityModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <PlusCircle className="h-4 w-4 text-amber-300" />
              <span>{t("Host New Activity")}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clubActivities.map(act => (
              <div key={act.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded">
                      {t(act.category)} • {t(act.mode)}
                    </span>
                    <span className="text-xs font-semibold text-[#5A7366]">{act.date}</span>
                  </div>

                  <h4 className="font-bold text-sm text-[#103125]">{act.title}</h4>
                  <p className="text-xs text-[#5A7366] line-clamp-2">{act.description}</p>

                  {act.isInterInstitutional && (
                    <div className="inline-flex items-center space-x-1 text-[11px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      <ShieldCheck className="h-3 w-3 text-brand-600" />
                      <span>{t("Co-Hosted Inter-Institutional Event")}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E2ECE7] flex justify-between items-center text-xs">
                  <span className="text-[#5A7366]">👥 {act.participantsCount.toLocaleString()} {t("Registered")}</span>
                  
                  <button
                    onClick={() => alert(`Attendance sign-off verified for ${act.title}. Approved student certificates unlocked!`)}
                    className="px-3 py-1.5 rounded-lg bg-[#E9F5EF] hover:bg-[#d2ede0] text-[#0D7751] text-xs font-bold border border-[#0D7751]/30 flex items-center space-x-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{t("Approve Attendance")}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Inter-Institutional Resource & Activity Sharing Shield (Requirement 3c.vii) */}
      {activeTab === 'shield' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-800 bg-brand-50 px-3 py-1 rounded-full border border-brand-200 mb-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <span>{t("Inter-Institutional Cyber Security Protocol Shield")}</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                {t("Cross-Campus Collaboration & Resource Network")}
                                            </h3>
              <p className="text-xs text-[#5A7366] mt-0.5 max-w-2xl">
                {t("Removing physical barriers across India: Co-host activities with partner universities and share curated research notes behind strict content moderation and cybersecurity gates.")}
                                            </p>
            </div>

            <button
              onClick={() => {
                setActIsInter(true);
                setShowNewActivityModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Share2 className="h-4 w-4" />
              <span>{t("Co-Host Cross-Campus Event")}</span>
            </button>
          </div>

          {/* Security Architecture Notice */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-brand-50/50 border border-brand-100 space-y-1.5">
              <span className="font-bold text-brand-900 block">{t("1. Sandboxed Content Gate")}</span>
              <p className="text-ink-600 text-[11px]">{t("All shared documents & external webinar links pass through automated security scanners before public broadcast.")}</p>
            </div>
            <div className="p-4 rounded-2xl bg-brand-50/50 border border-brand-100 space-y-1.5">
              <span className="font-bold text-brand-900 block">{t("2. Federated Student Access")}</span>
              <p className="text-ink-600 text-[11px]">{t("Enrolled students from co-hosting colleges join without separate account creation or data disclosure.")}</p>
            </div>
            <div className="p-4 rounded-2xl bg-brand-50/50 border border-brand-100 space-y-1.5">
              <span className="font-bold text-brand-900 block">{t("3. Academic Compliance")}</span>
              <p className="text-ink-600 text-[11px]">{t("Monitored by IIT Kharagpur zonal coordinators with content moderation and review on every shared item.")}</p>
            </div>
          </div>

          {/* Cross-Campus Activities Feed */}
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-sm text-[#103125]">{t("Active Nationwide Shared Initiatives:")}</h4>
            <div className="space-y-3">
              {activities.filter(a => a.isInterInstitutional).map(act => (
                <div key={act.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold text-brand-800 bg-brand-100 px-2 py-0.5 rounded">
                        {t("Co-Hosted by:")} {act.clubName}
                      </span>
                      <span className="text-[11px] text-brand-700 font-bold bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                        {t("✓ Shield Verified")}
                                                        </span>
                    </div>
                    <div className="font-bold text-sm text-[#103125]">{act.title}</div>
                    <div className="text-xs text-[#5A7366]">{act.date} • {t(act.mode)} • {act.participantsCount.toLocaleString()} {t("Participants")}</div>
                  </div>

                  <button
                    onClick={() => alert(`Your club (${activeClub.name}) has sent a co-hosting handshake request for ${act.title}.`)}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-[#E2ECE7] hover:bg-ink-50 text-xs font-bold text-[#103125] transition-all shadow-2xs"
                  >
                    {t("Request Co-Host Partnership")}
                                            </button>
                </div>
              ))}
            </div>
          </div>
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

            <button
              onClick={() => setShowSuccessionModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <UserPlus className="h-4 w-4 text-amber-300" />
              <span>{t("Initiate Authority Transfer")}</span>
            </button>
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

      {/* TAB 7: Student Workspace & Certificate Claim (Requirement 3c.vi) */}
      {activeTab === 'student_dash' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1 rounded-full mb-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                <span>{t("Student Member Portal View")}</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                {t("Welcome, Aarav Mukherjee (Roll: 22CS30045)")}
                                            </h3>
              <p className="text-xs text-[#5A7366]">
                {t("Active Scholar at")} {activeClub.name} {t("• Reading Streak: 18 Days")}
                                            </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-[#B45309]">{t("850 Pts")}</div>
              <div className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                {t("Diamond Scholar Tier")}
                                            </div>
            </div>
          </div>

          {/* Certificate Claim Locker */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-[#103125] flex items-center space-x-2">
              <Award className="h-4 w-4 text-[#0D7751]" />
              <span>{t("Your Event Credentials & Verified Certificates")}</span>
            </h4>

            <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                  <Check className="h-3 w-3 inline -mt-0.5" /> {t("Attendance Approved by Club Coordinator")}
                                                  </span>
                <h5 className="font-bold text-sm text-[#103125]">{t("National Reading Month: Digital Research & Open Ethics Assessment")}</h5>
                <p className="text-xs text-[#5A7366]">{t("Performance Grade: A+ (sample record) • CID: NDLI-A7KQ-2M4X")}</p>
              </div>

              <button
                onClick={() => {
                  const cert: CertificateData = {
                    certId: 'NDLI-A7KQ-2M4X',
                    recipientName: 'Aarav Mukherjee',
                    recipientEmail: 'aarav.m@demo.example.edu',
                    recipientRoll: '22CS30045',
                    instituteName: activeClub.name,
                    eventName: 'National Reading Month: Digital Research & Open Ethics Assessment',
                    eventDate: '15th October 2026',
                    category: 'Merit',
                    score: '100% Score',
                    issuedAt: new Date().toISOString(),
                    qrDataUrl: '',
                    verified: true,
                    authorityApproved: true
                  };
                  onClaimCertificate(cert);
                }}
                className="px-4 py-2 rounded-xl bg-[#0D7751] hover:bg-[#0a5c3e] text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all shrink-0"
              >
                <Award className="h-4 w-4" />
                <span>{t("View & Print Master Certificate")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create New Activity */}
      {showNewActivityModal && (
        <div onClick={closeAnyDialog} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Schedule & Publish Club Activity")} tabIndex={-1} className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-[#103125]">{t("Schedule & Publish Club Activity")}</h3>
            <form onSubmit={handleCreateActivitySubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Activity Title *")}</label>
                <input
                  type="text"
                  placeholder={t("e.g. Workshop on Open Access Journal Publishing")}
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-ink-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-ink-700 block mb-1">{t("Category")}</label>
                  <select
                    value={actCategory}
                    onChange={(e) => setActCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-ink-300 bg-white"
                  >
                    <option value="Workshop">{t("Workshop")}</option>
                    <option value="Webinar">{t("Webinar")}</option>
                    <option value="Reading Challenge">{t("Reading Challenge")}</option>
                    <option value="Quiz">{t("Quiz")}</option>
                    <option value="Seminar">{t("Seminar")}</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-ink-700 block mb-1">{t("Mode")}</label>
                  <select
                    value={actMode}
                    onChange={(e) => setActMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-ink-300 bg-white"
                  >
                    <option value="Offline In-Campus">{t("Offline In-Campus")}</option>
                    <option value="Online">{t("Online Webinar")}</option>
                    <option value="Hybrid">{t("Hybrid")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-ink-700 block mb-1">{t("Description & Syllabus")}</label>
                <textarea
                  rows={3}
                  placeholder={t("Detailed description, keynote speaker, and NDLI repository links...")}
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-ink-300"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="notifyToggle"
                  checked={notifyMembers}
                  onChange={(e) => setNotifyMembers(e.target.checked)}
                  className="rounded text-[#0D7751]"
                />
                <label htmlFor="notifyToggle" className="text-[11px] text-[#5A7366] font-medium">
                  {t("Trigger automated notification alert to all")} {clubStudents.length} {t("student members")}
                                                  </label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setShowNewActivityModal(false)}
                  className="px-4 py-2 rounded-lg text-ink-600 font-bold"
                >
                  {t("Cancel")}
                                                  </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  {t("Publish Activity")}
                                                  </button>
              </div>
            </form>
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
                  {clubActivities.map(act => (
                    <tr key={act.id}>
                      <td className="p-2.5 font-bold">{act.title}</td>
                      <td className="p-2.5">{act.date}</td>
                      <td className="p-2.5">{t(act.category)}</td>
                      <td className="p-2.5 font-semibold">{act.participantsCount.toLocaleString()}</td>
                      <td className="p-2.5 text-brand-700 font-bold"><Check className="h-3.5 w-3.5 inline -mt-0.5" /> {t("NDLI Verified")}</td>
                    </tr>
                  ))}
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
    </div>
  );
};
