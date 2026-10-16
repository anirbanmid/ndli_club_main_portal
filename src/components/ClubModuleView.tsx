import React, { useState } from 'react';
import QRCode from 'qrcode';
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
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  Edit2,
  Trash2,
  Share2,
  KeyRound,
  FileText,
  Award,
  Sparkles,
  Search,
  Check,
  Send,
  Lock,
  Globe2
} from 'lucide-react';
import { 
  InstituteClub, 
  StudentMember, 
  ClubActivity, 
  IssueTicket, 
  AuthorityChangeRequest,
  CertificateData 
} from '../types';

interface ClubModuleViewProps {
  activeClub: InstituteClub;
  students: StudentMember[];
  activities: ClubActivity[];
  tickets: IssueTicket[];
  authorityRequests: AuthorityChangeRequest[];
  onAddStudent: (student: StudentMember) => void;
  onBulkAddStudents: (students: StudentMember[]) => void;
  onUpdateStudent: (student: StudentMember) => void;
  onDeleteStudent: (id: string) => void;
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
  onAddStudent,
  onBulkAddStudents,
  onUpdateStudent,
  onDeleteStudent,
  onCreateActivity,
  onRaiseTicket,
  onSubmitAuthorityChange,
  onClaimCertificate,
  onViewPublicProfile,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'roster' | 'activities' | 'tickets' | 'succession' | 'shield' | 'student_dash'
  >('overview');

  // Roster States
  const [rosterSearch, setRosterSearch] = useState('');
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showBulkCsvModal, setShowBulkCsvModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // New Student Form
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentDept, setNewStudentDept] = useState('Computer Science');
  const [newStudentYear, setNewStudentYear] = useState('3rd Year');

  // Bulk CSV Text
  const [csvRawText, setCsvRawText] = useState('');
  const [csvSuccessMsg, setCsvSuccessMsg] = useState('');

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

  // Filter students for active club
  const clubStudents = students.filter(s => s.clubId === activeClub.id);
  const filteredStudents = clubStudents.filter(s => 
    s.name.toLowerCase().includes(rosterSearch.toLowerCase()) ||
    s.rollNo.toLowerCase().includes(rosterSearch.toLowerCase()) ||
    s.department.toLowerCase().includes(rosterSearch.toLowerCase())
  );

  const clubActivities = activities.filter(a => a.clubId === activeClub.id || a.isInterInstitutional);
  const clubTickets = tickets.filter(t => t.clubId === activeClub.id);
  const clubAuthRequests = authorityRequests.filter(r => r.clubId === activeClub.id);

  // Handler: Add Single Student
  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentRoll) return;

    const newStudent: StudentMember = {
      id: `STU-${Date.now().toString().slice(-4)}`,
      clubId: activeClub.id,
      name: newStudentName,
      rollNo: newStudentRoll,
      email: newStudentEmail || `${newStudentRoll.toLowerCase()}@demo.example.edu`,
      department: newStudentDept,
      year: newStudentYear,
      readingPoints: 100,
      tier: 'Bronze',
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0],
      approvedCertificateCount: 0
    };

    onAddStudent(newStudent);
    setNewStudentName('');
    setNewStudentRoll('');
    setNewStudentEmail('');
    setShowAddStudentModal(false);
  };

  // Handler: Parse and Import Bulk CSV
  const handleBulkCsvImport = () => {
    if (!csvRawText.trim()) return;

    const lines = csvRawText.trim().split('\n');
    const newMembers: StudentMember[] = [];

    lines.forEach((line, idx) => {
      // skip header if contains name or roll
      if (idx === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('roll'))) {
        return;
      }
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const rollNo = parts[1];
        const department = parts[2] || 'General Studies';
        const email = parts[3] || `${rollNo.toLowerCase()}@demo.example.edu`;
        const year = parts[4] || '1st Year';

        newMembers.push({
          id: `STU-${Date.now().toString().slice(-4)}-${idx}`,
          clubId: activeClub.id,
          name,
          rollNo,
          email,
          department,
          year,
          readingPoints: 150,
          tier: 'Bronze',
          status: 'Active',
          joinedDate: new Date().toISOString().split('T')[0],
          approvedCertificateCount: 0
        });
      }
    });

    if (newMembers.length > 0) {
      onBulkAddStudents(newMembers);
      setCsvSuccessMsg(`Successfully imported ${newMembers.length} students into roster!`);
      setTimeout(() => {
        setCsvSuccessMsg('');
        setCsvRawText('');
        setShowBulkCsvModal(false);
      }, 1500);
    }
  };

  // Sample CSV Auto-filler
  const handleSampleCsv = () => {
    setCsvRawText(`Name, RollNo, Department, Email, Year
Anirudh Roy, 24CS101, Computer Science, anirudh.r@demo.example.edu, 2nd Year
Kavita Iyer, 24EC204, Electronics, kavita.i@demo.example.edu, 2nd Year
Prateek Sen, 23ME302, Mechanical, prateek.s@demo.example.edu, 3rd Year
Swati Banerjee, 24BT109, Biotechnology, swati.b@demo.example.edu, 2nd Year
Arunava Das, 22CE410, Civil Engg, arunava.d@demo.example.edu, 4th Year`);
  };

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
      assignedTo: `Regional Desk (${activeClub.zone} Zone)`,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Club Module Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
              Active Institutional Chapter
            </span>
            <span className="text-xs text-[#5F7B6E] font-mono">
              AISHE: {activeClub.aisheCode} • Zone: {activeClub.zone}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#103125] tracking-tight">
            {activeClub.name}
          </h1>

          <p className="text-xs text-[#5F7B6E]">
            Club ID: <strong className="font-mono text-[#103125]">{activeClub.id}</strong> • Enrolled Students: <strong>{clubStudents.length.toLocaleString()}</strong>
          </p>
        </div>

        {/* Header CTA Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onViewPublicProfile(activeClub)}
            className="px-4 py-2 rounded-xl border border-[#E2ECE7] hover:bg-[#F4F8F6] text-[#2E4A3E] text-xs font-bold transition-colors flex items-center space-x-1.5"
          >
            <Globe2 className="h-4 w-4 text-[#0D7751]" />
            <span>Public Profile Page</span>
          </button>

          <button
            onClick={() => setShowNaacPreview(true)}
            className="px-4 py-2 rounded-xl bg-[#E9F5EF] text-[#0D7751] hover:bg-[#d5eee0] text-xs font-bold transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>NAAC 3.3 Audit Report</span>
          </button>
        </div>
      </div>

      {/* Internal Navigation Tabs (Requirements 3c.i to 3c.vii) */}
      <div className="flex items-center space-x-1 overflow-x-auto p-1.5 bg-white rounded-2xl border border-[#E2ECE7] shadow-2xs scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>360° Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'roster'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Student Roster ({clubStudents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activities')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'activities'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Activities & Workshops ({clubActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('shield')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'shield'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Inter-Club Shield</span>
          <span className="bg-[#D97706] text-white text-[9px] px-1.5 py-0.2 rounded font-black">CROSS-CAMPUS</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'tickets'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <LifeBuoy className="h-4 w-4" />
          <span>Support Desk ({clubTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('succession')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'succession'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>Authority Succession</span>
        </button>

        <button
          onClick={() => setActiveTab('student_dash')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
            activeTab === 'student_dash'
              ? 'bg-[#D97706] text-white shadow-xs'
              : 'text-[#D97706] hover:bg-amber-50'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>Student View</span>
        </button>
      </div>

      {/* TAB 1: 360° Overview & NAAC Metrics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F7B6E]">Enrolled Members</span>
              <div className="text-3xl font-extrabold text-[#103125]">{clubStudents.length.toLocaleString()}</div>
              <div className="text-[11px] text-[#0D7751] font-semibold flex items-center gap-1">
                <span>Passkey: {activeClub.passkey}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F7B6E]">Annual Activities</span>
              <div className="text-3xl font-extrabold text-[#103125]">{clubActivities.length}</div>
              <div className="text-[11px] text-[#0D7751] font-semibold">Sample NAAC 3.3 records prepared</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F7B6E]">Certificates Awarded</span>
              <div className="text-3xl font-extrabold text-[#103125]">
                {clubStudents.reduce((acc, s) => acc + s.approvedCertificateCount, 0)}
              </div>
              <div className="text-[11px] text-[#D97706] font-semibold">Authorized by Club President</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F7B6E]">Open Tickets</span>
              <div className="text-3xl font-extrabold text-[#103125]">
                {clubTickets.filter(t => t.status !== 'Resolved').length}
              </div>
              <div className="text-[11px] text-[#5F7B6E]">Routed to IIT KGP {activeClub.zone} Zone</div>
            </div>
          </div>

          {/* Institutional Leadership Quorum Preview */}
          <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-[#E2ECE7] pb-3">
              <h3 className="font-bold text-[#103125] text-base flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-[#0D7751]" />
                <span>Designated 4-Tier Institutional Authorities</span>
              </h3>
              <button
                onClick={() => setActiveTab('succession')}
                className="text-xs text-[#0D7751] font-bold hover:underline"
              >
                Change Authority Request →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {activeClub.authorities.map(auth => (
                <div key={auth.role} className="p-4 rounded-xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0D7751]">{auth.role}</span>
                  <div className="font-bold text-sm text-[#103125]">{auth.name}</div>
                  <div className="text-[#5F7B6E] text-[11px]">{auth.designation}</div>
                  <div className="text-[#2E4A3E] font-mono text-[10px] pt-1">{auth.email}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Student Roster (Passkey + Bulk CSV + Inline Edit) */}
      {activeTab === 'roster' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <Users className="h-5 w-5 text-[#0D7751]" />
                <span>Student Member Enrollment & Roster Management</span>
              </h3>
              <p className="text-xs text-[#5F7B6E] mt-0.5">
                Onboard students via Passkey or upload bulk CSV spreadsheets. Details remain fully editable.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowBulkCsvModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#E9F5EF] hover:bg-[#d3ede0] text-[#0D7751] text-xs font-bold flex items-center space-x-1.5 transition-colors border border-[#0D7751]/30"
              >
                <Upload className="h-4 w-4" />
                <span>Bulk CSV Upload</span>
              </button>

              <button
                onClick={() => setShowAddStudentModal(true)}
                className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
              >
                <UserPlus className="h-4 w-4" />
                <span>Add Student</span>
              </button>
            </div>
          </div>

          {/* Search bar & count */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#5F7B6E]" />
              <input
                type="text"
                placeholder="Search by name, roll no, department..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751] focus:outline-hidden"
              />
            </div>

            <div className="text-xs font-semibold text-[#5F7B6E]">
              Showing <span className="font-bold text-[#103125]">{filteredStudents.length}</span> of {clubStudents.length} enrolled members
            </div>
          </div>

          {/* Student Table */}
          <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
            <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
              <thead className="bg-[#F4F8F6] text-[#5F7B6E] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Roll / Enrolment No</th>
                  <th className="py-3 px-4">APAAR ID (ABC)</th>
                  <th className="py-3 px-4">Department & Year</th>
                  <th className="py-3 px-4">Reading Score</th>
                  <th className="py-3 px-4">NAD-ABC Status</th>
                  <th className="py-3 px-4">Certificates</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                {filteredStudents.map(student => (
                  <tr key={student.id} className="hover:bg-[#F4F8F6]/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#103125]">
                      {student.name}
                      <span className="block font-normal font-mono text-[10px] text-[#5F7B6E]">{student.email}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#2E4A3E]">{student.rollNo}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {student.apaarId ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                          <span>APAAR: {student.apaarId}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">Unanchored (Roll No)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#5F7B6E]">{student.department} • {student.year}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[#D97706]">{student.readingPoints} pts</span>
                      <span className="block text-[10px] text-[#5F7B6E]">{student.tier}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        student.nadStatus === 'Deposited to NAD-ABC' ? 'bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20' :
                        student.nadStatus === 'Pending Sync' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {student.nadStatus || 'Not Linked'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0D7751]">
                      {student.approvedCertificateCount} Approved
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          const newDept = prompt('Edit Department:', student.department);
                          if (newDept) onUpdateStudent({ ...student, department: newDept });
                        }}
                        className="p-1 hover:bg-[#E9F5EF] rounded text-[#0D7751]"
                        title="Edit Student"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${student.name} from club roster?`)) {
                            onDeleteStudent(student.id);
                          }
                        }}
                        className="p-1 hover:bg-rose-50 rounded text-rose-600"
                        title="Deactivate Student"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Activities & Workshops */}
      {activeTab === 'activities' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-[#0D7751]" />
                <span>Annual Co-Curricular Activities & Workshops</span>
              </h3>
              <p className="text-xs text-[#5F7B6E] mt-0.5">
                Organize online/offline activities, send notifications, and approve attendee certificates.
              </p>
            </div>

            <button
              onClick={() => setShowNewActivityModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <PlusCircle className="h-4 w-4 text-amber-300" />
              <span>Host New Activity</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clubActivities.map(act => (
              <div key={act.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded">
                      {act.category} • {act.mode}
                    </span>
                    <span className="text-xs font-semibold text-[#5F7B6E]">{act.date}</span>
                  </div>

                  <h4 className="font-bold text-sm text-[#103125]">{act.title}</h4>
                  <p className="text-xs text-[#5F7B6E] line-clamp-2">{act.description}</p>

                  {act.isInterInstitutional && (
                    <div className="inline-flex items-center space-x-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      <ShieldCheck className="h-3 w-3 text-blue-600" />
                      <span>Co-Hosted Inter-Institutional Event</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E2ECE7] flex justify-between items-center text-xs">
                  <span className="text-[#5F7B6E]">👥 {act.participantsCount.toLocaleString()} Registered</span>
                  
                  <button
                    onClick={() => alert(`Attendance sign-off verified for ${act.title}. Approved student certificates unlocked!`)}
                    className="px-3 py-1.5 rounded-lg bg-[#E9F5EF] hover:bg-[#d2ede0] text-[#0D7751] text-xs font-bold border border-[#0D7751]/30 flex items-center space-x-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Approve Attendance</span>
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
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 mb-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Inter-Institutional Cyber Security Protocol Shield</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                Cross-Campus Collaboration & Resource Network
              </h3>
              <p className="text-xs text-[#5F7B6E] mt-0.5 max-w-2xl">
                Removing physical barriers across India: Co-host activities with partner universities and share curated research notes behind strict content moderation and cybersecurity gates.
              </p>
            </div>

            <button
              onClick={() => {
                setActIsInter(true);
                setShowNewActivityModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Share2 className="h-4 w-4" />
              <span>Co-Host Cross-Campus Event</span>
            </button>
          </div>

          {/* Security Architecture Notice */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1.5">
              <span className="font-bold text-blue-900 block">1. Sandboxed Content Gate</span>
              <p className="text-slate-600 text-[11px]">All shared documents & external webinar links pass through automated security scanners before public broadcast.</p>
            </div>
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1.5">
              <span className="font-bold text-blue-900 block">2. Federated Student Access</span>
              <p className="text-slate-600 text-[11px]">Enrolled students from co-hosting colleges join without separate account creation or data disclosure.</p>
            </div>
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1.5">
              <span className="font-bold text-blue-900 block">3. Academic Compliance</span>
              <p className="text-slate-600 text-[11px]">Monitored by IIT Kharagpur zonal coordinators with content moderation and review on every shared item.</p>
            </div>
          </div>

          {/* Cross-Campus Activities Feed */}
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-sm text-[#103125]">Active Nationwide Shared Initiatives:</h4>
            <div className="space-y-3">
              {activities.filter(a => a.isInterInstitutional).map(act => (
                <div key={act.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        Co-Hosted by: {act.clubName}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ✓ Shield Verified
                      </span>
                    </div>
                    <div className="font-bold text-sm text-[#103125]">{act.title}</div>
                    <div className="text-xs text-[#5F7B6E]">{act.date} • {act.mode} • {act.participantsCount.toLocaleString()} Participants</div>
                  </div>

                  <button
                    onClick={() => alert(`Your club (${activeClub.name}) has sent a co-hosting handshake request for ${act.title}.`)}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-[#E2ECE7] hover:bg-slate-50 text-xs font-bold text-[#103125] transition-all shadow-2xs"
                  >
                    Request Co-Host Partnership
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
                <span>Central Grievance & Issue Redressal Desk</span>
              </h3>
              <p className="text-xs text-[#5F7B6E] mt-0.5">
                Raise tickets directly to IIT Kharagpur zonal administrators for swift technical and administrative resolution.
              </p>
            </div>

            <button
              onClick={() => setShowNewTicketModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <Send className="h-4 w-4 text-amber-300" />
              <span>Raise Support Ticket</span>
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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        tkt.priority === 'Critical' ? 'bg-rose-100 text-rose-800' :
                        tkt.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {tkt.priority} Priority
                      </span>
                      <span className="text-xs text-[#5F7B6E] font-medium">{tkt.category}</span>
                    </div>

                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      tkt.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                      tkt.status === 'In Progress' ? 'bg-blue-100 text-blue-800 animate-pulse' : 'bg-amber-100 text-amber-800'
                    }`}>
                      ● {tkt.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-[#103125]">{tkt.title}</h4>
                  <p className="text-xs text-[#5F7B6E]">{tkt.description}</p>

                  <div className="pt-2 border-t border-[#E2ECE7] flex justify-between items-center text-[11px] text-[#5F7B6E]">
                    <span>Created: {tkt.createdAt} • Assigned: {tkt.assignedTo}</span>
                    {tkt.resolutionNotes && (
                      <span className="text-emerald-700 font-medium">Notes: {tkt.resolutionNotes}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-[#5F7B6E]">
                No support tickets raised currently. All systems operational.
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
                <span>Institutional Authority Succession & Transition</span>
              </h3>
              <p className="text-xs text-[#5F7B6E] mt-0.5">
                Secure dual-verification process to transfer Patron, President, or Secretary leadership with appointment-letter review and a full audit trail.
              </p>
            </div>

            <button
              onClick={() => setShowSuccessionModal(true)}
              className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <UserPlus className="h-4 w-4 text-amber-300" />
              <span>Initiate Authority Transfer</span>
            </button>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5F7B6E]">Pending & Historical Succession Requests</h4>
            {clubAuthRequests.length > 0 ? (
              clubAuthRequests.map(req => (
                <div key={req.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-[#103125]">{req.id} • Role: {req.role}</span>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                      {req.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div><strong>Outgoing Officer:</strong> {req.currentName}</div>
                    <div><strong>Incoming Officer:</strong> {req.proposedName} ({req.proposedEmail})</div>
                  </div>
                  <div className="text-[11px] text-[#5F7B6E]">
                    Order Doc: <span className="font-mono">{req.officialDocName}</span> • Submitted: {req.submittedAt}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-[#5F7B6E] bg-[#F4F8F6] rounded-2xl border border-dashed border-[#E2ECE7]">
                No pending authority transition requests. Quorum is active and stable.
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
                <span>Student Member Portal View</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                Welcome, Aarav Mukherjee (Roll: 22CS30045)
              </h3>
              <p className="text-xs text-[#5F7B6E]">
                Active Scholar at {activeClub.name} • Reading Streak: 18 Days
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-[#D97706]">850 Pts</div>
              <div className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                Diamond Scholar Tier
              </div>
            </div>
          </div>

          {/* Certificate Claim Locker */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-[#103125] flex items-center space-x-2">
              <Award className="h-4 w-4 text-[#0D7751]" />
              <span>Your Event Credentials & Verified Certificates</span>
            </h4>

            <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                  ✓ Attendance Approved by Club Coordinator
                </span>
                <h5 className="font-bold text-sm text-[#103125]">National Reading Month: Digital Research & Open Ethics Assessment</h5>
                <p className="text-xs text-[#5F7B6E]">Performance Grade: A+ (sample record) • CID: NDLI-A7KQ-2M4X</p>
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
                <span>View & Print Master Certificate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Add Single Student */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-[#103125]">Add Enrolled Student to Roster</h3>
            <form onSubmit={handleAddStudentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Student Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sweta Bhattacharya"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Roll / ID No. *</label>
                  <input
                    type="text"
                    placeholder="e.g. 24CS401"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={newStudentDept}
                    onChange={(e) => setNewStudentDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  Save to Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk CSV Upload */}
      {showBulkCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-[#103125]">Bulk Student Enrollment via CSV</h3>
              <button
                type="button"
                onClick={handleSampleCsv}
                className="text-xs text-[#0D7751] font-bold hover:underline"
              >
                Auto-fill Sample CSV Data
              </button>
            </div>
            <p className="text-xs text-[#5F7B6E]">
              Format: <code>Name, RollNo, Department, Email, Year</code> (one student per line)
            </p>
            <textarea
              rows={6}
              value={csvRawText}
              onChange={(e) => setCsvRawText(e.target.value)}
              placeholder="Name, RollNo, Department, Email, Year&#10;Aarav Mukherjee, 22CS30045, Computer Science, aarav.m@demo.example.edu, 4th Year"
              className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-[#0D7751]"
            />
            {csvSuccessMsg && (
              <div className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg font-bold">
                ✓ {csvSuccessMsg}
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setShowBulkCsvModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkCsvImport}
                className="px-5 py-2 rounded-lg bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125]"
              >
                Parse & Import Members
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create New Activity */}
      {showNewActivityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-[#103125]">Schedule & Publish Club Activity</h3>
            <form onSubmit={handleCreateActivitySubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Activity Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Workshop on Open Access Journal Publishing"
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={actCategory}
                    onChange={(e) => setActCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Workshop">Workshop</option>
                    <option value="Webinar">Webinar</option>
                    <option value="Reading Challenge">Reading Challenge</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Seminar">Seminar</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mode</label>
                  <select
                    value={actMode}
                    onChange={(e) => setActMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Offline In-Campus">Offline In-Campus</option>
                    <option value="Online">Online Webinar</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Description & Syllabus</label>
                <textarea
                  rows={3}
                  placeholder="Detailed description, keynote speaker, and NDLI repository links..."
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
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
                <label htmlFor="notifyToggle" className="text-[11px] text-[#5F7B6E] font-medium">
                  Trigger automated notification alert to all {clubStudents.length} student members
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewActivityModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  Publish Activity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Raise Support Ticket */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-[#103125]">Raise Support Ticket to IIT Kharagpur</h3>
            <form onSubmit={handleCreateTicketSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Issue Category *</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="Registration & Passkey">Registration & Passkey</option>
                  <option value="Certificate Approval">Certificate Approval</option>
                  <option value="Event Logistics">Event Logistics</option>
                  <option value="Technical Glitch">Technical Glitch</option>
                  <option value="Data Correction">Data Correction</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Priority Level</label>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Subject / Summary *</label>
                <input
                  type="text"
                  placeholder="e.g. Student passkey sync error for fresh batch"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Detailed Description *</label>
                <textarea
                  rows={3}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Authority Succession Dual Verification */}
      {showSuccessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded">
                Dual-Verification Security Gate
              </span>
              <h3 className="text-base font-bold text-[#103125]">Initiate Official Authority Succession</h3>
            </div>
            <form onSubmit={handleAuthorityChangeSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Authority Role</label>
                  <select
                    value={succRole}
                    onChange={(e) => setSuccRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="President">President</option>
                    <option value="Patron">Patron (VC / Principal)</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Executive Member">Executive Member</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Proposed Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Subrata Roy"
                    value={succProposedName}
                    onChange={(e) => setSuccProposedName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Official Institutional Email *</label>
                <input
                  type="email"
                  placeholder="e.g. new.president@college.example.edu"
                  value={succProposedEmail}
                  onChange={(e) => setSuccProposedEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Official Transfer/Appointment Order File</label>
                <input
                  type="text"
                  value={succDocName}
                  onChange={(e) => setSuccDocName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-[11px]"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <span className="font-bold text-amber-900 block text-[11px]">Two-Factor Authorization Check:</span>
                <p className="text-[10px] text-amber-800">
                  Enter 6-digit confirmation PIN (Demo code: <strong>948201</strong>) to simulate sign-off by incumbent officer.
                </p>
                <input
                  type="text"
                  placeholder="Enter 948201"
                  value={succOtpEntered}
                  onChange={(e) => setSuccOtpEntered(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-amber-300 text-center font-mono font-bold tracking-widest text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSuccessionModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#1A503E] text-white font-bold"
                >
                  Submit for IIT KGP Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: NAAC Report Preview */}
      {showNaacPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-2xl border border-[#E2ECE7] space-y-6 animate-in fade-in my-8">
            <div className="flex justify-between items-start border-b border-[#E2ECE7] pb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0D7751]">
                  NAAC Criteria 3.3.3 & 3.3.4 Compliance Record
                </span>
                <h3 className="text-xl font-bold text-[#103125] mt-0.5">
                  Annual Co-Curricular & Extension Activity Audit
                </h3>
                <div className="text-xs text-[#5F7B6E]">
                  Institution: <strong>{activeClub.name}</strong> • AISHE: {activeClub.aisheCode}
                </div>
              </div>
              <button
                onClick={() => setShowNaacPreview(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                ✕ Close
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-[#F4F8F6] text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Activity Title</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Participants</th>
                    <th className="p-2.5">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {clubActivities.map(act => (
                    <tr key={act.id}>
                      <td className="p-2.5 font-bold">{act.title}</td>
                      <td className="p-2.5">{act.date}</td>
                      <td className="p-2.5">{act.category}</td>
                      <td className="p-2.5 font-semibold">{act.participantsCount.toLocaleString()}</td>
                      <td className="p-2.5 text-emerald-700 font-bold">✓ NDLI Verified</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <div className="text-[11px] text-slate-500">
                Certified by NDLI Nodal Center, IIT Kharagpur
              </div>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125]"
              >
                Print / Save Document (PDF)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
