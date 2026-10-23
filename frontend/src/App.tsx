import React, { useState } from 'react';
import { changeLanguage } from './i18n';
import { resolveRoute } from './lib/route';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeView } from './components/HomeView';
import { PublicClubProfileView } from './components/PublicClubProfileView';
import { ClubModuleView } from './components/ClubModuleView';
import { AdminModuleView } from './components/AdminModuleView';

import { VerifyCertificateView } from './components/VerifyCertificateView';
import { CertificateView } from './components/CertificateView';
import { DirectoryView } from './components/DirectoryView';
import { LoginView } from './components/auth/LoginView';
import { OnboardingWizardView } from './components/onboarding/OnboardingWizardView';
import { ShowcaseIndexView } from './components/clubs/ShowcaseIndexView';
import { ClubShowcaseDetailView } from './components/clubs/ClubShowcaseDetailView';
import { InstitutionalClubsLandingView } from './components/InstitutionalClubsLandingView';
import { JoinView } from './components/clubs/JoinView';
import { JoinClubModal } from './components/JoinClubModal';
import { 
  INITIAL_CLUBS, 
  INITIAL_ACTIVITIES, 
  INITIAL_STUDENTS, 
  INITIAL_TICKETS, 
  INITIAL_AUTHORITY_REQUESTS, 
  INITIAL_FORENSIC_RECORDS, 
  INITIAL_EMPLOYEES
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

export interface AppProps {
  /** Override for the build-time prerender (M3-7); defaults to window.location. */
  ssrLocation?: { pathname: string; search: string };
}

export function App({ ssrLocation }: AppProps = {}) {
  // One source of truth for URL -> view (src/lib/route.ts). Resolved during
  // the first render so the prerendered HTML matches the client's first paint.
  const initialRoute = resolveRoute(
    ssrLocation ?? (typeof window !== 'undefined' ? window.location : { pathname: '/', search: '' }),
  );

  const [currentBranch, setCurrentBranch] = useState<BranchType>('landing');
  const [currentTab, setCurrentTab] = useState<string>(initialRoute.tab);

  // Application Data States
  const [clubs, setClubs] = useState<InstituteClub[]>(INITIAL_CLUBS);
  const [activities, setActivities] = useState<ClubActivity[]>(INITIAL_ACTIVITIES);
  const [students] = useState<StudentMember[]>(INITIAL_STUDENTS);
  const [tickets, setTickets] = useState<IssueTicket[]>(INITIAL_TICKETS);
  const [authorityRequests, setAuthorityRequests] = useState<AuthorityChangeRequest[]>(INITIAL_AUTHORITY_REQUESTS);
  const [forensicRecords, setForensicRecords] = useState<ForensicQuarantineRecord[]>(INITIAL_FORENSIC_RECORDS);
  const [employees, setEmployees] = useState<EmployeeNode[]>(INITIAL_EMPLOYEES);

  // Active selections
  const [activeClub, setActiveClub] = useState<InstituteClub>(INITIAL_CLUBS[0]);
  const [selectedClubForPublicProfile, setSelectedClubForPublicProfile] = useState<InstituteClub | null>(null);
  const [authenticatedClubId, setAuthenticatedClubId] = useState<string | null>(null);
  const [authenticatedAuthority, setAuthenticatedAuthority] = useState<{
    name: string;
    role: string;
    email: string;
    clubId: string;
  } | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<CertificateData | null>(null);
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [verifyInitialCertId, setVerifyInitialCertId] = useState(initialRoute.certId);
  // M5-D3: showcase slug for /clubs/<slug>/ (deep-linked via route.ts, or set
  // when a card is opened from the showcase index).
  const [showcaseSlug, setShowcaseSlug] = useState<string>(initialRoute.slug);

  // Accessibility States
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'larger'>('normal');
  const [highContrast, setHighContrast] = useState(false);

  // Language State (S3 i18n): the picker drives i18next + <html lang>, and
  // setState forces the whole tree to re-render with the new catalogue.
  const [language, setLanguageState] = useState('en');
  const handleSetLanguage = (code: string) => {
    // Re-render AFTER the catalogue chunk loads (M3 §4c lazy i18n).
    void changeLanguage(code).then(() => setLanguageState(code));
  };

  // Deep-link routing is resolved above via resolveRoute (M3):
  // - canonical QR target: /verify/?id=NDLI-XXXX-XXXX
  // - legacy compat:      ?tab=verify&certId=…
  // - directory:          /directory/
  // (kept as a no-op effect slot removed; see git history for the mount effect)

  // --- Handlers for Club Module ---
  // (demo RegisterClubView retired per owner DEC3 — club application lives in
  // the onboarding wizard, currentTab 'onboarding'; handleClubRegistered removed.)

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

  // Font size mapper (S2 fix: zoom scales EVERY text size incl. the px-based
  // labels — the old root font-size class was overridden by explicit text-*).
  const getFontZoom = (): number => {
    if (fontSize === 'large') return 1.125;
    if (fontSize === 'larger') return 1.25;
    return 1;
  };

  return (
    <div style={{ zoom: getFontZoom() } as React.CSSProperties} className={`min-h-screen flex flex-col ${highContrast ? 'contrast-125 bg-black text-amber-300' : 'bg-[#F4F8F6] text-[#17332A]'}`}>
      {/* Header */}
      <Header
        currentBranch={currentBranch}
        setCurrentBranch={(branch) => {
          setCurrentBranch(branch);
          if (branch === 'landing') setCurrentTab('home');
          if (branch === 'club_module') setCurrentTab(authenticatedClubId ? 'club_dashboard' : 'club_directory');
          if (branch === 'admin_module') setCurrentTab('admin_overview');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        openPasskeyModal={() => setIsPasskeyModalOpen(true)}
        fontSize={fontSize}
        setFontSize={setFontSize}
        highContrast={highContrast}
        setHighContrast={setHighContrast}
        language={language}
        setLanguage={handleSetLanguage}
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
                onRegisterInstitute={() => setCurrentTab('onboarding')}
                onGoToClubModule={() => {
                  setCurrentBranch('club_module');
                  setCurrentTab(authenticatedClubId ? 'club_dashboard' : 'club_directory');
                }}
                onGoToAdminModule={() => {
                  setCurrentBranch('admin_module');
                  setCurrentTab('admin_overview');
                }}
                onVerifyCertificates={() => setCurrentTab('verify')}
                onOpenDirectory={() => setCurrentTab('directory')}
              />
            )}

            {currentTab === 'public_club_profile' && selectedClubForPublicProfile && (
              <PublicClubProfileView
                club={selectedClubForPublicProfile}
                activities={activities}
                isAuthorityAuthenticated={authenticatedClubId === selectedClubForPublicProfile.id}
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


            {currentTab === 'verify' && (
              <VerifyCertificateView initialCertId={verifyInitialCertId} />
            )}

            {currentTab === 'directory' && (
              <DirectoryView onBack={() => setCurrentTab('home')} />
            )}

            {currentTab === 'login' && (
              <LoginView
                initialNext={initialRoute.next}
                onNavigate={(route) => {
                  setVerifyInitialCertId(route.certId);
                  setCurrentTab(route.tab);
                }}
                onSignedIn={(session) => {
                  const matchedClub = clubs.find(c => 
                    (session.club_code && c.id.toLowerCase().includes(session.club_code.toLowerCase())) ||
                    (session.institution_code && c.aisheCode.toLowerCase() === session.institution_code.toLowerCase())
                  ) || clubs[0];
                  setAuthenticatedClubId(matchedClub.id);
                  setAuthenticatedAuthority({
                    name: session.username || 'Authorized Officer',
                    role: session.sub_role || 'President',
                    email: session.email,
                    clubId: matchedClub.id
                  });
                  setActiveClub(matchedClub);
                  setCurrentBranch('club_module');
                  setCurrentTab('club_dashboard');
                }}
              />
            )}

            {/* M5-D2: the real 4-authority resumable wizard (token-gated API,
                SPA-only — kept out of the prerender set, BRIEF_M5 §4c). */}
            {currentTab === 'onboarding' && (
              <OnboardingWizardView
                onNavigate={(route) => {
                  setVerifyInitialCertId(route.certId);
                  setCurrentTab(route.tab);
                }}
              />
            )}

            {/* M5-D3: club showcase index (public, prerendered /clubs/). */}
            {currentTab === 'clubs' && (
              <ShowcaseIndexView
                onBack={() => setCurrentTab('home')}
                onOpenClub={(slug) => {
                  setShowcaseSlug(slug);
                  setCurrentTab('club_detail');
                }}
                onJoin={() => setCurrentTab('join')}
              />
            )}

            {/* M5-D3: one public showcase page per slug (SPA-only, BRIEF §4c). */}
            {currentTab === 'club_detail' && showcaseSlug && (
              <ClubShowcaseDetailView
                slug={showcaseSlug}
                onBack={() => setCurrentTab('clubs')}
                onJoin={() => setCurrentTab('join')}
              />
            )}

            {/* M5-D3: passkey/QR self-join door (public, prerendered /join/);
                the join token rides in the URL fragment and is read on mount. */}
            {currentTab === 'join' && (
              <JoinView onBack={() => setCurrentTab('clubs')} />
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
          <>
            {currentTab === 'club_directory' && (
              <InstitutionalClubsLandingView
                clubs={clubs}
                onSelectClub={(club) => {
                  setSelectedClubForPublicProfile(club);
                  setCurrentTab('public_club_profile');
                }}
                onManageClub={(club) => {
                  setActiveClub(club);
                  setCurrentTab('club_dashboard');
                }}
                onAuthoritySignIn={() => {
                  setCurrentBranch('landing');
                  setCurrentTab('login');
                }}
                onBackToLanding={() => {
                  setCurrentBranch('landing');
                  setCurrentTab('home');
                }}
              />
            )}

            {currentTab === 'public_club_profile' && selectedClubForPublicProfile && (
              <PublicClubProfileView
                club={selectedClubForPublicProfile}
                activities={activities}
                isAuthorityAuthenticated={authenticatedClubId === selectedClubForPublicProfile.id}
                onBack={() => setCurrentTab('club_directory')}
                onOpenClubDashboard={(club) => {
                  setActiveClub(club);
                  setCurrentTab('club_dashboard');
                }}
                onJoinWithPasskey={(passkey) => {
                  setIsPasskeyModalOpen(true);
                }}
              />
            )}

            {currentTab === 'club_dashboard' && (
              <ClubModuleView
                activeClub={activeClub}
                students={students}
                activities={activities}
                tickets={tickets}
                authorityRequests={authorityRequests}
                isAuthorityAuthenticated={authenticatedClubId === activeClub.id}
                authenticatedAuthority={authenticatedAuthority}
                onAuthoritySignIn={() => {
                  setCurrentBranch('landing');
                  setCurrentTab('login');
                }}
                onAuthorityQuickSignIn={(authority) => {
                  setAuthenticatedClubId(authority.clubId);
                  setAuthenticatedAuthority(authority);
                }}
                onAuthoritySignOut={() => {
                  setAuthenticatedClubId(null);
                  setAuthenticatedAuthority(null);
                }}
                onBackToClubsList={() => {
                  setCurrentTab('club_directory');
                }}
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
                  setCurrentTab('public_club_profile');
                }}
              />
            )}
          </>
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
    </div>
  );
}

export default App;
