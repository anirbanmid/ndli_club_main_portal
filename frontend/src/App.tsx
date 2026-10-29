import React, { useState, useEffect } from 'react';
import { fetchCanonicalClubs, subscribeToClubUpdates } from './lib/clubRepository';
import { changeLanguage } from './i18n';
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
import { signOut } from './lib/authApi';

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

  const [currentBranch, setCurrentBranch] = useState<BranchType>('landing');
  const [loginSourceBranch, setLoginSourceBranch] = useState<BranchType>('landing');
  const [loginSourceTab, setLoginSourceTab] = useState<string>('home');
  // Admin module is login-gated (owner 2026-10-26: "like the previous project").
  // The gate probes the real session: a signed-in iit_kgp_admin skips it.
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminRole, setAdminRole] = useState('');
  const handleAdminSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } finally {
      setAdminAuthed(false);
      setAdminRole('');
    }
  };
  const [adminGateError, setAdminGateError] = useState<string | null>(null);
  const probeAdminSession = () => {
    fetchSession()
      .then((s) => {
        if (s && s.category === 'iit_kgp_admin') {
          setAdminAuthed(true);
          setAdminRole(s.sub_role ?? '');
          setAdminGateError(null);
        }
      })
      .catch(() => {
        /* not signed in — the gate stays */
      });
  };
  const [currentTab, setCurrentTab] = useState<string>(initialRoute.tab);

  // Application Data States
  const [clubs, setClubs] = useState<InstituteClub[]>(INITIAL_CLUBS);

  const [activities, setActivities] = useState<ClubActivity[]>(INITIAL_ACTIVITIES);
  const [students] = useState<StudentMember[]>(INITIAL_STUDENTS);
  const [tickets, setTickets] = useState<IssueTicket[]>(INITIAL_TICKETS);
  const [authorityRequests, setAuthorityRequests] = useState<AuthorityChangeRequest[]>(INITIAL_AUTHORITY_REQUESTS);
  const [forensicRecords, setForensicRecords] = useState<ForensicQuarantineRecord[]>(INITIAL_FORENSIC_RECORDS);

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

  // Single Source of Truth (SSOT): Hydrate clubs from canonical backend API on mount
  // and maintain real-time reactive cross-module synchronization
  useEffect(() => {
    let mounted = true;
    void fetchCanonicalClubs().then((canonicalClubs) => {
      if (mounted && canonicalClubs && canonicalClubs.length > 0) {
        setClubs(canonicalClubs);
      }
    });

    const unsubscribe = subscribeToClubUpdates(({ clubId, updates }) => {
      setClubs((prev) =>
        prev.map((c) => (c.id === clubId ? { ...c, ...updates } : c))
      );
      setActiveClub((current) =>
        current.id === clubId ? { ...current, ...updates } : current
      );
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
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
                  setLoginSourceBranch('club_module');
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
                  setLoginSourceBranch('club_module');
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

        {/* BRANCH 3: IIT KHARAGPUR ADMINISTRATION MODULE — LOGIN-GATED.
            Without a real iit_kgp_admin session this branch renders the sign-in
            door (the demo flow never authenticated, which surfaced raw 401s). */}
        {currentBranch === 'admin_module' && (
          adminAuthed ? (
            adminRole === 'regional_officer' ? (
              <EmployeeModule
                onSignOut={() => void handleAdminSignOut()}
                subRole={adminRole}
                adminRole={adminRole}
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
                  if (s && s.category === 'iit_kgp_admin') {
                    setAdminAuthed(true);
                    setAdminRole(s.sub_role ?? '');
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
        clubs={clubs}
        onMemberJoined={(club) => {
          setClubs(prev => prev.map(c => c.id === club.id ? { ...c, memberCount: c.memberCount + 1 } : c));
        }}
      />
    </div>
  );
}

export default App;
