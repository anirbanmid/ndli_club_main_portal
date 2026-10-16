import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeView } from './components/HomeView';
import { PublicClubProfileView } from './components/PublicClubProfileView';
import { ClubModuleView } from './components/ClubModuleView';
import { AdminModuleView } from './components/AdminModuleView';
import { RegisterClubView } from './components/RegisterClubView';
import { VerifyCertificateView } from './components/VerifyCertificateView';
import { CertificateView } from './components/CertificateView';
import { JoinClubModal } from './components/JoinClubModal';
import { PitchDeckModal } from './components/PitchDeckModal';
import { 
  INITIAL_CLUBS, 
  INITIAL_ACTIVITIES, 
  INITIAL_STUDENTS, 
  INITIAL_TICKETS, 
  INITIAL_AUTHORITY_REQUESTS, 
  INITIAL_FORENSIC_RECORDS, 
  INITIAL_EMPLOYEES, 
  INITIAL_CERTIFICATES 
} from './mockData';
import { 
  BranchType, 
  InstituteClub, 
  ClubActivity, 
  StudentMember, 
  IssueTicket, 
  AuthorityChangeRequest, 
  ForensicQuarantineRecord, 
  EmployeeNode, 
  CertificateData 
} from './types';

export function App() {
  const [currentBranch, setCurrentBranch] = useState<BranchType>('landing');
  const [currentTab, setCurrentTab] = useState<string>('home');

  // Application Data States
  const [clubs, setClubs] = useState<InstituteClub[]>(INITIAL_CLUBS);
  const [activities, setActivities] = useState<ClubActivity[]>(INITIAL_ACTIVITIES);
  const [students, setStudents] = useState<StudentMember[]>(INITIAL_STUDENTS);
  const [tickets, setTickets] = useState<IssueTicket[]>(INITIAL_TICKETS);
  const [authorityRequests, setAuthorityRequests] = useState<AuthorityChangeRequest[]>(INITIAL_AUTHORITY_REQUESTS);
  const [forensicRecords, setForensicRecords] = useState<ForensicQuarantineRecord[]>(INITIAL_FORENSIC_RECORDS);
  const [employees, setEmployees] = useState<EmployeeNode[]>(INITIAL_EMPLOYEES);
  const [certificates, setCertificates] = useState<CertificateData[]>(INITIAL_CERTIFICATES);

  // Active selections
  const [activeClub, setActiveClub] = useState<InstituteClub>(INITIAL_CLUBS[0]);
  const [selectedClubForPublicProfile, setSelectedClubForPublicProfile] = useState<InstituteClub | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<CertificateData | null>(null);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [isPitchModalOpen, setIsPitchModalOpen] = useState(false);
  const [verifyInitialCertId, setVerifyInitialCertId] = useState('');

  // Accessibility States
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'larger'>('normal');
  const [highContrast, setHighContrast] = useState(false);

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const certIdParam = params.get('certId');

    if (tabParam === 'verify') {
      setCurrentBranch('landing');
      setCurrentTab('verify');
      if (certIdParam) {
        setVerifyInitialCertId(certIdParam);
      }
    }
  }, []);

  // --- Handlers for Club Module ---
  const handleClubRegistered = (newClub: InstituteClub) => {
    setClubs(prev => [newClub, ...prev]);
    setActiveClub(newClub);
    setCurrentBranch('club_module');
    setCurrentTab('club_dashboard');
  };

  const handleAddStudent = (newStudent: StudentMember) => {
    setStudents(prev => [newStudent, ...prev]);
    setClubs(prev => prev.map(c => c.id === newStudent.clubId ? { ...c, memberCount: c.memberCount + 1 } : c));
  };

  const handleBulkAddStudents = (newStudents: StudentMember[]) => {
    setStudents(prev => [...newStudents, ...prev]);
    if (newStudents.length > 0) {
      const targetClubId = newStudents[0].clubId;
      setClubs(prev => prev.map(c => c.id === targetClubId ? { ...c, memberCount: c.memberCount + newStudents.length } : c));
    }
  };

  const handleUpdateStudent = (updatedStudent: StudentMember) => {
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
  };

  const handleDeleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const handleCreateActivity = (newAct: ClubActivity) => {
    setActivities(prev => [newAct, ...prev]);
    setClubs(prev => prev.map(c => c.id === newAct.clubId ? { ...c, eventsConducted: c.eventsConducted + 1 } : c));
  };

  const handleRaiseTicket = (newTkt: IssueTicket) => {
    setTickets(prev => [newTkt, ...prev]);
  };

  const handleSubmitAuthorityChange = (req: AuthorityChangeRequest) => {
    setAuthorityRequests(prev => [req, ...prev]);
  };

  // --- Handlers for Admin Module ---
  const handleApproveClub = (clubId: string) => {
    const randomPin = Math.floor(1000 + Math.random() * 9000);
    setClubs(prev => prev.map(c => {
      if (c.id === clubId) {
        const cleanPrefix = c.name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
        return {
          ...c,
          status: 'Active',
          passkey: `${cleanPrefix}-NDL-${randomPin}`
        };
      }
      return c;
    }));
  };

  const handleRejectClub = (clubId: string) => {
    setClubs(prev => prev.map(c => c.id === clubId ? { ...c, status: 'Revision Required' } : c));
  };

  const handleResolveTicket = (ticketId: string, notes: string) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'Resolved', resolutionNotes: notes, resolvedAt: 'Just Now' } : t));
  };

  const handleApproveAuthorityChange = (reqId: string) => {
    const req = authorityRequests.find(r => r.id === reqId);
    if (!req) return;

    setAuthorityRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'Approved & Updated', reviewedBy: 'IIT KGP Office' } : r));

    // Update actual club authority
    setClubs(prev => prev.map(c => {
      if (c.id === req.clubId) {
        return {
          ...c,
          authorities: c.authorities.map(a => a.role === req.role ? { ...a, name: req.proposedName, email: req.proposedEmail, phone: req.proposedPhone } : a)
        };
      }
      return c;
    }));
  };

  const handleHealForensicRecord = (recordId: string) => {
    setForensicRecords(prev => prev.map(r => r.id === recordId ? { ...r, recoveryStatus: 'Auto-Healed' } : r));
  };

  // Font size class mapper
  const getFontSizeClass = () => {
    if (fontSize === 'large') return 'text-[17px]';
    if (fontSize === 'larger') return 'text-[19px]';
    return 'text-[15px]';
  };

  return (
    <div className={`min-h-screen flex flex-col ${getFontSizeClass()} ${highContrast ? 'contrast-125 bg-black text-amber-300' : 'bg-[#F4F8F6] text-[#17332A]'}`}>
      {/* Header */}
      <Header
        currentBranch={currentBranch}
        setCurrentBranch={(branch) => {
          setCurrentBranch(branch);
          if (branch === 'landing') setCurrentTab('home');
          if (branch === 'club_module') setCurrentTab('club_dashboard');
          if (branch === 'admin_module') setCurrentTab('admin_overview');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        openPasskeyModal={() => setIsPasskeyModalOpen(true)}
        openPitchModal={() => setIsPitchModalOpen(true)}
        fontSize={fontSize}
        setFontSize={setFontSize}
        highContrast={highContrast}
        setHighContrast={setHighContrast}
      />

      {/* Main Content Area */}
      <main className="grow">
        {/* BRANCH 1: COMMON PUBLIC LANDING */}
        {currentBranch === 'landing' && (
          <>
            {currentTab === 'home' && (
              <HomeView
                clubs={clubs}
                onSelectClub={(club) => {
                  setSelectedClubForPublicProfile(club);
                  setCurrentTab('public_club_profile');
                }}
                onJoinWithPasskey={() => setIsPasskeyModalOpen(true)}
                onRegisterInstitute={() => setCurrentTab('register_request')}
                onGoToClubModule={() => {
                  setCurrentBranch('club_module');
                  setCurrentTab('club_dashboard');
                }}
                onGoToAdminModule={() => {
                  setCurrentBranch('admin_module');
                  setCurrentTab('admin_overview');
                }}
                onVerifyCertificates={() => setCurrentTab('verify')}
              />
            )}

            {currentTab === 'public_club_profile' && selectedClubForPublicProfile && (
              <PublicClubProfileView
                club={selectedClubForPublicProfile}
                activities={activities}
                onBack={() => setCurrentTab('home')}
                onOpenClubDashboard={(club) => {
                  setActiveClub(club);
                  setCurrentBranch('club_module');
                  setCurrentTab('club_dashboard');
                }}
                onJoinWithPasskey={(passkey) => {
                  setIsPasskeyModalOpen(true);
                }}
              />
            )}

            {currentTab === 'register_request' && (
              <RegisterClubView
                onClubRegistered={handleClubRegistered}
                onExploreClubs={() => setCurrentTab('home')}
              />
            )}

            {currentTab === 'verify' && (
              <VerifyCertificateView
                certificates={certificates}
                initialCertId={verifyInitialCertId}
                onViewFullCertificate={(cert) => {
                  setActiveCertificate(cert);
                  setCurrentTab('view_certificate');
                }}
              />
            )}

            {currentTab === 'view_certificate' && activeCertificate && (
              <CertificateView
                certificate={activeCertificate}
                onBack={() => setCurrentTab('home')}
                onVerifyOnline={(cid) => {
                  setVerifyInitialCertId(cid);
                  setCurrentTab('verify');
                }}
              />
            )}
          </>
        )}

        {/* BRANCH 2: INSTITUTIONAL CLUB MODULE */}
        {currentBranch === 'club_module' && (
          <ClubModuleView
            activeClub={activeClub}
            students={students}
            activities={activities}
            tickets={tickets}
            authorityRequests={authorityRequests}
            onAddStudent={handleAddStudent}
            onBulkAddStudents={handleBulkAddStudents}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            onCreateActivity={handleCreateActivity}
            onRaiseTicket={handleRaiseTicket}
            onSubmitAuthorityChange={handleSubmitAuthorityChange}
            onClaimCertificate={(cert) => {
              setActiveCertificate(cert);
              setCurrentBranch('landing');
              setCurrentTab('view_certificate');
            }}
            onViewPublicProfile={(club) => {
              setSelectedClubForPublicProfile(club);
              setCurrentBranch('landing');
              setCurrentTab('public_club_profile');
            }}
          />
        )}

        {/* BRANCH 3: IIT KHARAGPUR ADMINISTRATION MODULE */}
        {currentBranch === 'admin_module' && (
          <AdminModuleView
            clubs={clubs}
            employees={employees}
            tickets={tickets}
            authorityRequests={authorityRequests}
            forensicRecords={forensicRecords}
            onApproveClub={handleApproveClub}
            onRejectClub={handleRejectClub}
            onResolveTicket={handleResolveTicket}
            onApproveAuthorityChange={handleApproveAuthorityChange}
            onHealForensicRecord={handleHealForensicRecord}
          />
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Passkey Redemption Modal */}
      <JoinClubModal
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
        clubs={clubs}
        onMemberJoined={(club) => {
          setClubs(prev => prev.map(c => c.id === club.id ? { ...c, memberCount: c.memberCount + 1 } : c));
        }}
      />

      {/* Pitch Deck Presentation Modal */}
      <PitchDeckModal
        isOpen={isPitchModalOpen}
        onClose={() => setIsPitchModalOpen(false)}
        onLaunchDemo={() => {
          setCurrentBranch('landing');
          setCurrentTab('home');
        }}
      />
    </div>
  );
}

export default App;
