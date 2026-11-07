import React, { useState, useEffect } from 'react';
import { fetchCanonicalClubs, subscribeToClubUpdates } from './lib/clubRepository';
import { changeLanguage, t } from './i18n';
import { resolveRoute } from './lib/route';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeView } from './components/HomeView';
import { PublicClubProfileView } from './components/PublicClubProfileView';
import { ClubModuleView } from './components/ClubModuleView';
import { AdminModuleView } from './components/AdminModuleView';
import { EmployeeModule } from './components/EmployeeModule';
import { SuperAdminConsole } from './components/SuperAdminConsole';
import { fetchSession } from './lib/adminApi';
import { passwordLogin, signOut } from './lib/authApi';

import { VerifyCertificateView } from './components/VerifyCertificateView';
import { CertificateView } from './components/CertificateView';
import { DirectoryView } from './components/DirectoryView';
import { LoginView } from './components/auth/LoginView';
import { OnboardingWizardView } from './components/onboarding/OnboardingWizardView';
import { RegisterInstitutionalClubModal } from './components/onboarding/RegisterInstitutionalClubModal';
import { HEIRegistrationWizard } from './components/onboarding/HEIRegistrationWizard';
import { SchoolRegistrationWizard } from './components/onboarding/SchoolRegistrationWizard';
import { DraftPayload } from './lib/onboardingApi';
import { ShowcaseIndexView } from './components/clubs/ShowcaseIndexView';
import { ClubShowcaseDetailView } from './components/clubs/ClubShowcaseDetailView';
import { InstitutionalClubsLandingView } from './components/InstitutionalClubsLandingView';
import { JoinView } from './components/clubs/JoinView';
import { JoinClubModal } from './components/JoinClubModal';
import { ClubMemberModuleView } from './components/members/ClubMemberModuleView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { 
  INITIAL_CLUBS, 
  INITIAL_ACTIVITIES, 
  INITIAL_STUDENTS, 
  INITIAL_TICKETS, 
  INITIAL_AUTHORITY_REQUESTS, 
  INITIAL_FORENSIC_RECORDS, 
} from './mockData';
import { 
  BranchType, 
  InstituteClub, 
  ClubActivity, 
  StudentMember, 
  IssueTicket, 
  AuthorityChangeRequest, 
  ForensicQuarantineRecord, 
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

  const [currentBranch, setCurrentBranch] = useState<BranchType>(
    initialRoute.tab === 'employee' ? 'admin_module' : 'landing'
  );
  const [loginSourceBranch, setLoginSourceBranch] = useState<BranchType>('landing');
  const [loginSourceTab, setLoginSourceTab] = useState<string>('home');
  // Explicit sign-in clicks must show the gate even with a live session;
  // only the /login/?next= URL door (M5-D1) auto-resumes an existing session.
  const [loginResume, setLoginResume] = useState<boolean>(initialRoute.tab === 'login');
  // Admin module is login-gated (owner 2026-10-26: "like the previous project").
  // The gate probes the real session: a signed-in iit_kgp_admin skips it.
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminRole, setAdminRole] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [sessionChecking, setSessionChecking] = useState(true);
  const handleAdminSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } finally {
      setAdminAuthed(false);
      setAdminRole('');
      setAdminUsername('');
    }
  };
  const [currentTab, setCurrentTab] = useState<string>(initialRoute.tab);
  const [adminGateError, setAdminGateError] = useState<string | null>(null);
  const probeAdminSession = () => {
    fetchSession()
      .then((s) => {
        if (s && s.category === 'iit_kgp_admin') {
          setAdminAuthed(true);
          setAdminRole(s.sub_role ?? '');
          setAdminUsername(s.username ?? '');
          setAdminGateError(null);
        } else if (s && s.category === 'student_member') {
          setCurrentBranch('student_module');
          setCurrentTab('student_home');
        }
      })
      .catch(() => {
        /* not signed in — the gate stays */
      })
      .finally(() => {
        setSessionChecking(false);
      });
  };

  useEffect(() => {
    probeAdminSession();
  }, []);

  // Application Data States
  const [clubs, setClubs] = useState<InstituteClub[]>(INITIAL_CLUBS);

  const [activities, setActivities] = useState<ClubActivity[]>(INITIAL_ACTIVITIES);
  const [students] = useState<StudentMember[]>(INITIAL_STUDENTS);
  const [tickets, setTickets] = useState<IssueTicket[]>(INITIAL_TICKETS);
  const [authorityRequests, setAuthorityRequests] = useState<AuthorityChangeRequest[]>(INITIAL_AUTHORITY_REQUESTS);
  const [forensicRecords, setForensicRecords] = useState<ForensicQuarantineRecord[]>(INITIAL_FORENSIC_RECORDS);

  // Active selections
  const [activeClub, setActiveClub] = useState<InstituteClub | null>(INITIAL_CLUBS[0] ?? null);
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
  const [passkeyFromUrl, setPasskeyFromUrl] = useState<string>('');
  const [joinPasskeyFromHash, setJoinPasskeyFromHash] = useState<string>('');
  const [verifyInitialCertId, setVerifyInitialCertId] = useState(initialRoute.certId);
  // M5-D3: showcase slug for /clubs/<slug>/ (deep-linked via route.ts, or set
  // when a card is opened from the showcase index).
  const [showcaseSlug, setShowcaseSlug] = useState<string>(initialRoute.slug);
  const [isBifurcationModalOpen, setIsBifurcationModalOpen] = useState(false);
  const [resumedDraft, setResumedDraft] = useState<DraftPayload | null>(null);
  const [resumedToken, setResumedToken] = useState<string | null>(null);
  const [onboardingSuccessAppId, setOnboardingSuccessAppId] = useState<string | null>(null);

  // Single Source of Truth (SSOT): Hydrate clubs from canonical backend API on mount
  // and maintain real-time reactive cross-module synchronization
  useEffect(() => {
    let mounted = true;
    void fetchCanonicalClubs().then((canonicalClubs) => {
      if (mounted && canonicalClubs) {
        setClubs(canonicalClubs);
        if (canonicalClubs.length > 0) {
          setActiveClub(canonicalClubs[0]);
        }
      }
    });

    const unsubscribe = subscribeToClubUpdates(({ clubId, updates }) => {
      setClubs((prev) =>
        prev.map((c) => (c.id === clubId ? { ...c, ...updates } : c))
      );
      setActiveClub((current) =>
        current && current.id === clubId ? { ...current, ...updates } : current
      );
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // A-7: ?passkey= query branch REMOVED (was an XSS/open-redirect vector).
  // Only the fragment reader (#passkey=) below is used for QR code scans.

  // Read #passkey= from URL fragment (QR code scan target on /join/)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const passkey = params.get('passkey');
        if (passkey) {
          setJoinPasskeyFromHash(passkey);
          setCurrentTab('join');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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

  // --- Handlers for Admin Module (demo desks 3-4 only; desks 1-2 are
  // real API-driven since D5 slice 2) ---
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

  const handleRejectAuthorityChange = (reqId: string, reason?: string) => {
    setAuthorityRequests(prev => prev.map(r => r.id === reqId ? {
      ...r,
      status: 'Rejected',
      reason: reason || r.reason,
      reviewedBy: 'IIT KGP Office',
    } : r));
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
          if (branch === 'admin_module') {
            setCurrentTab('admin_overview');
            probeAdminSession();
          }
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
        onOpenLogin={() => {
          setLoginSourceBranch(currentBranch);
          setLoginSourceTab(currentTab === 'login' ? 'home' : currentTab);
          setLoginResume(false);
          setCurrentBranch('landing');
          setCurrentTab('login');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
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
                onJoinWithPasskey={(passkey) => {
                  setPasskeyFromUrl(passkey ?? '');
                  setIsPasskeyModalOpen(true);
                }}
                onRegisterInstitute={() => setIsBifurcationModalOpen(true)}
                onGoToClubModule={() => {
                  setCurrentBranch('club_module');
                  setCurrentTab(authenticatedClubId ? 'club_dashboard' : 'club_directory');
                }}
                onGoToAdminModule={() => {
                  setCurrentBranch('admin_module');
                  setCurrentTab('admin_overview');
                }}
                onGoToStudentModule={() => {
                  setCurrentBranch('student_module');
                  setCurrentTab('student_home');
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
                  setPasskeyFromUrl(passkey);
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
                resumeSession={loginResume}
                onDismiss={() => {
                  setCurrentBranch(loginSourceBranch);
                  setCurrentTab(loginSourceTab || 'home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onNavigate={(route) => {
                  setVerifyInitialCertId(route.certId);
                  setCurrentTab(route.tab);
                }}
                onSignedIn={(session) => {
                  if (session.category === 'student_member') {
                    setCurrentBranch('student_module');
                    setCurrentTab('student_home');
                    return;
                  }
                  if (session.category === 'iit_kgp_admin') {
                    setAdminAuthed(true);
                    setAdminRole(session.sub_role ?? '');
                    setAuthenticatedClubId(null);
                    if (loginSourceBranch === 'club_module') {
                      setCurrentBranch('club_module');
                      setCurrentTab('club_directory');
                    } else {
                      setCurrentBranch('admin_module');
                      setCurrentTab('admin_overview');
                    }
                    return;
                  }
                  const matchedClub = clubs.find(c => 
                    (session.club_code && c.id.toLowerCase().includes(session.club_code.toLowerCase())) ||
                    (session.institution_code && c.aisheCode.toLowerCase() === session.institution_code.toLowerCase())
                  );
                  if (matchedClub && session.category === 'club_admin') {
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
                  } else {
                    setAuthenticatedClubId(null);
                    setCurrentBranch('club_module');
                    setCurrentTab('club_directory');
                  }
                }}
              />
            )}

            {currentTab === 'hei_onboarding' && (
              <HEIRegistrationWizard
                initialDraft={resumedDraft}
                initialToken={resumedToken}
                onBackToLanding={() => setCurrentTab('home')}
                onSubmitSuccess={(appId) => {
                  setOnboardingSuccessAppId(appId);
                  alert(`Official Charter Application Submitted Successfully! Tracking Application ID: ${appId}`);
                  setCurrentTab('home');
                }}
              />
            )}

            {currentTab === 'school_onboarding' && (
              <SchoolRegistrationWizard
                initialDraft={resumedDraft}
                initialToken={resumedToken}
                onBackToLanding={() => setCurrentTab('home')}
                onSubmitSuccess={(appId) => {
                  setOnboardingSuccessAppId(appId);
                  alert(`Official School Charter Application Submitted Successfully! Tracking Application ID: ${appId}`);
                  setCurrentTab('home');
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
              joinPasskeyFromHash ? (
                <JoinClubModal
                  isOpen={true}
                  onClose={() => {
                    setIsPasskeyModalOpen(false);
                    setJoinPasskeyFromHash('');
                    setCurrentTab('clubs');
                  }}
                  clubs={clubs}
                  initialPasskey={joinPasskeyFromHash}
                  onMemberJoined={(_club) => {
                    setCurrentTab('clubs');
                    setJoinPasskeyFromHash('');
                  }}
                />
              ) : (
                <JoinView onBack={() => setCurrentTab('clubs')} />
              )
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
                  setLoginSourceBranch('club_module');
                  setLoginResume(false);
                  setCurrentBranch('landing');
                  setCurrentTab('login');
                }}
                onRegisterClub={() => setIsBifurcationModalOpen(true)}
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
                  setPasskeyFromUrl(passkey);
                  setIsPasskeyModalOpen(true);
                }}
              />
            )}

            {currentTab === 'club_dashboard' && (
              activeClub ? (
                <ClubModuleView
                  activeClub={activeClub}
                  students={students}
                  activities={activities}
                  tickets={tickets}
                  authorityRequests={authorityRequests}
                  canonicalClubs={clubs}
                  isAuthorityAuthenticated={authenticatedClubId === activeClub.id}
                  authenticatedAuthority={authenticatedAuthority}
                  onAuthoritySignIn={() => {
                    setLoginSourceBranch('club_module');
                    setLoginResume(false);
                    setCurrentBranch('landing');
                    setCurrentTab('login');
                  }}
                  onAuthorityQuickSignIn={async (authority) => {
                    // A-1: only send hardcoded creds in dev/test builds
                    if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_TEST_PANELS !== '1') return;
                    setAuthenticatedClubId(authority.clubId);
                    setAuthenticatedAuthority(authority);
                    try {
                      await passwordLogin(authority.email, 'Password@123', 'DEV_TEST');
                    } catch {
                      try {
                        await passwordLogin('library.bhu', 'Password@123', 'DEV_TEST');
                      } catch {
                        // ignore network error
                      }
                    }
                  }}
                  onAuthoritySignOut={async () => {
                    setAuthenticatedClubId(null);
                    setAuthenticatedAuthority(null);
                    try {
                      await signOut();
                    } catch {
                      // ignore
                    }
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
              ) : (
                <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
                  <h2 className="text-xl font-bold text-ink-900">{t('No Active Club Selected')}</h2>
                  <p className="text-sm text-ink-600">{t('Please select an institutional club from the directory to view its dashboard.')}</p>
                  <button
                    onClick={() => setCurrentTab('club_directory')}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {t('Go to Club Directory')}
                  </button>
                </div>
              )
            )}
          </>
        )}

        {/* BRANCH 4: DEDICATED STUDENT MEMBER MODULE (Campus Specification §5) */}
        {currentBranch === 'student_module' && (
          <ErrorBoundary fallbackTitle="Club Member Portal Error">
            <ClubMemberModuleView
              onSignOut={() => {
                void signOut().catch(() => null);
                setCurrentBranch('landing');
                setCurrentTab('home');
              }}
              onSignIn={() => {
                setLoginSourceBranch('student_module');
                setLoginSourceTab('student_home');
                setCurrentBranch('landing');
                setCurrentTab('login');
              }}
              onViewPublicProfile={() => {
                if (activeClub) {
                  setCurrentBranch('club_module');
                  setCurrentTab('club_dashboard');
                } else {
                  setCurrentBranch('club_module');
                  setCurrentTab('club_directory');
                }
              }}
            />
          </ErrorBoundary>
        )}

        {/* BRANCH 3: IIT KHARAGPUR ADMINISTRATION MODULE — LOGIN-GATED.
            Without a real iit_kgp_admin session this branch renders the sign-in
            door (the demo flow never authenticated, which surfaced raw 401s). */}
        {currentBranch === 'admin_module' && (
          sessionChecking ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
              <div className="w-8 h-8 border-4 border-[#0D7751] border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-semibold text-[#103125]">Verifying administrator session…</div>
            </div>
          ) : adminAuthed ? (
            initialRoute.tab === 'employee' ? (
              <EmployeeModule
                onSignOut={() => void handleAdminSignOut()}
                subRole={adminRole}
                adminRole={adminRole}
                empId={(initialRoute.slug || 'EMP01').toUpperCase()}
                viewOnly={
                  adminRole === 'central_admin' ||
                  adminRole === 'super_admin_ops' ||
                  adminUsername.toUpperCase() !== (initialRoute.slug || 'EMP01').toUpperCase()
                }
                onNavigateBranch={(branch, tab) => {
                  setCurrentBranch(branch);
                  if (tab) setCurrentTab(tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                authorityRequests={authorityRequests}
                onApproveAuthorityChange={handleApproveAuthorityChange}
                onRejectAuthorityChange={handleRejectAuthorityChange}
                clubs={clubs}
                onUpdateClub={(updated) => setClubs(prev => prev.map(c => c.id === updated.id ? updated : c))}
              />
            ) : adminRole === 'regional_officer' ? (
              <EmployeeModule
                onSignOut={() => void handleAdminSignOut()}
                subRole={adminRole}
                adminRole={adminRole}
                empId={adminUsername || 'EMP01'}
                viewOnly={false}
                onNavigateBranch={(branch, tab) => {
                  setCurrentBranch(branch);
                  if (tab) setCurrentTab(tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                authorityRequests={authorityRequests}
                onApproveAuthorityChange={handleApproveAuthorityChange}
                onRejectAuthorityChange={handleRejectAuthorityChange}
                clubs={clubs}
                onUpdateClub={(updated) => setClubs(prev => prev.map(c => c.id === updated.id ? updated : c))}
              />
            ) : adminRole === 'super_admin_ops' ? (
              <SuperAdminConsole
                onSignOut={() => void handleAdminSignOut()}
                subRole={adminRole}
              />
            ) : (
              <AdminModuleView
                authorityRequests={authorityRequests}
                forensicRecords={forensicRecords}
                onApproveAuthorityChange={handleApproveAuthorityChange}
                onHealForensicRecord={handleHealForensicRecord}
                onSignOut={() => void handleAdminSignOut()}
                subRole={adminRole}
                onLaunchEmployeeNode={(empId: string) => {
                  window.open(`/employee/${encodeURIComponent(empId)}`, '_blank');
                }}
              />
            )
          ) : (
            <LoginView
              initialNext={''}
              fullViewport={true}
              onDismiss={() => {
                setCurrentBranch('landing');
                setCurrentTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigate={(route) => {
                setVerifyInitialCertId(route.certId);
                setCurrentTab(route.tab);
              }}
              onSignedIn={async () => {
                try {
                  const s = await fetchSession();
                  if (s && s.category === 'student_member') {
                    setCurrentBranch('student_module');
                    setCurrentTab('student_home');
                    return;
                  }
                  if (s && s.category === 'iit_kgp_admin') {
                    setAdminAuthed(true);
                    setAdminRole(s.sub_role ?? '');
                    setAdminUsername(s.username ?? '');
                    setAdminGateError(null);
                    return;
                  }
                  setAdminGateError(
                    'This account is not an IIT KGP administrator. Use an EMP01–EMP07 / CENTRALADM / SUPEROPS admin login.',
                  );
                } catch {
                  setAdminGateError('Sign-in did not open an admin session. Please try again.');
                }
              }}
            />
          )
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Passkey Redemption Modal */}
      <JoinClubModal
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
        initialPasskey={passkeyFromUrl}
        clubs={clubs}
        onMemberJoined={(_club) => {
          // Application submitted for review; actual count updates upon authority approval
        }}
      />

      {/* Institutional Club Bifurcation Modal */}
      <RegisterInstitutionalClubModal
        isOpen={isBifurcationModalOpen}
        onClose={() => setIsBifurcationModalOpen(false)}
        onSelectType={(type) => {
          setIsBifurcationModalOpen(false);
          setResumedDraft(null);
          setResumedToken(null);
          if (type === 'higher_education') {
            setCurrentBranch('landing');
            setCurrentTab('hei_onboarding');
          } else {
            setCurrentBranch('landing');
            setCurrentTab('school_onboarding');
          }
        }}
        onDraftResumed={(draft, token) => {
          setIsBifurcationModalOpen(false);
          setResumedDraft(draft);
          setResumedToken(token);
          if ((draft as any).institution_type === 'school') {
            setCurrentBranch('landing');
            setCurrentTab('school_onboarding');
          } else {
            setCurrentBranch('landing');
            setCurrentTab('hei_onboarding');
          }
        }}
      />
    </div>
  );
}

export default App;
