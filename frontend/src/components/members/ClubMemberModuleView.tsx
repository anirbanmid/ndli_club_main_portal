import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Flame,
  Globe,
  GraduationCap,
  KeyRound,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react';
import { t } from '../../i18n';
import {
  ClubEvent,
  StudentMeResponse,
  SubClub,
  changeStudentPassword,
  devStudentQuickLogin,
  fetchClubEvents,
  fetchStudentMe,
  fetchSubClubs,
  participateInEvent,
  updateStudentMe,
  updateStudentMeSubClubs,
} from '../../lib/campusApi';
import { CuratedLibraryHub } from '../sharing/CuratedLibraryHub';

interface ClubMemberModuleViewProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onViewPublicProfile?: () => void;
}

export const ClubMemberModuleView: React.FC<ClubMemberModuleViewProps> = ({
  onSignOut,
  onSignIn,
  onViewPublicProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'profile' | 'libraries'>('events');
  const [data, setData] = useState<StudentMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickLoginBusy, setQuickLoginBusy] = useState<string | null>(null);

  // Events state
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [participatingId, setParticipatingId] = useState<number | null>(null);
  const [participateNotice, setParticipateNotice] = useState<{ id: number; msg: string } | null>(
    null,
  );

  // Available Sub-clubs for selection
  const [availableSubClubs, setAvailableSubClubs] = useState<SubClub[]>([]);
  const [subClubsLoading, setSubClubsLoading] = useState(false);
  const [selectedSubClubIds, setSelectedSubClubIds] = useState<number[]>([]);
  const [savingSubClubs, setSavingSubClubs] = useState(false);

  // Editable Profile Form State
  const [dob, setDob] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [socialFb, setSocialFb] = useState('');
  const [socialInsta, setSocialInsta] = useState('');
  const [socialX, setSocialX] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  // Password Change State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const loadEvents = useCallback(async (clubCode: string) => {
    setEventsLoading(true);
    try {
      const evts = await fetchClubEvents(clubCode);
      setEvents(evts);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadSubClubs = useCallback(async (clubCode: string) => {
    setSubClubsLoading(true);
    try {
      const list = await fetchSubClubs(clubCode);
      setAvailableSubClubs(list);
    } catch {
      setAvailableSubClubs([]);
    } finally {
      setSubClubsLoading(false);
    }
  }, []);

  // Load Me
  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentMe();
      setData(res);
      setDob(res.profile.date_of_birth || '');
      setHobbies(res.profile.hobbies || '');
      setAddress(res.profile.address || '');
      setStateName(res.profile.state || '');
      setPincode(res.profile.pincode || '');
      setSocialFb(res.profile.social_facebook || '');
      setSocialInsta(res.profile.social_instagram || '');
      setSocialX(res.profile.social_x || '');
      setSelectedSubClubIds(res.profile.sub_clubs.map((sc) => sc.id));

      // Also load events for this club
      if (res.profile.club?.code) {
        void loadEvents(res.profile.club.code);
        void loadSubClubs(res.profile.club.code);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Failed to load student profile'));
    } finally {
      setLoading(false);
    }
  }, [loadEvents, loadSubClubs]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const handleQuickLogin = async (username: string) => {
    setQuickLoginBusy(username);
    setError(null);
    try {
      await devStudentQuickLogin(username, 'Password@123');
      await loadMe();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Quick login failed'));
    } finally {
      setQuickLoginBusy(null);
    }
  };

  const handleParticipate = async (evt: ClubEvent) => {
    setParticipatingId(evt.id);
    setParticipateNotice(null);
    try {
      const res = await participateInEvent(evt.id);
      setParticipateNotice({ id: evt.id, msg: res.message });
      // Reload profile to refresh points (+50 per event)
      void loadMe();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('Participation failed');
      setParticipateNotice({ id: evt.id, msg });
    } finally {
      setParticipatingId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg(null);
    try {
      let payload: Partial<StudentMeResponse['profile']> | FormData;
      if (avatarFile) {
        const fd = new FormData();
        fd.append('avatar', avatarFile);
        if (dob) fd.append('date_of_birth', dob);
        fd.append('hobbies', hobbies.trim());
        fd.append('address', address.trim());
        fd.append('state', stateName.trim());
        fd.append('pincode', pincode.trim());
        fd.append('social_facebook', socialFb.trim());
        fd.append('social_instagram', socialInsta.trim());
        fd.append('social_x', socialX.trim());
        payload = fd;
      } else {
        payload = {
          date_of_birth: dob || null,
          hobbies: hobbies.trim(),
          address: address.trim(),
          state: stateName.trim(),
          pincode: pincode.trim(),
          social_facebook: socialFb.trim(),
          social_instagram: socialInsta.trim(),
          social_x: socialX.trim(),
        };
      }

      const res = await updateStudentMe(payload);
      setProfileSuccessMsg(res.message);
      void loadMe();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('Failed to update profile'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSubClubs = async () => {
    setSavingSubClubs(true);
    try {
      const res = await updateStudentMeSubClubs(selectedSubClubIds);
      alert(t(`Sub-clubs updated successfully! Total Points: ${res.points}`));
      void loadMe();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('Failed to update sub-clubs'));
    } finally {
      setSavingSubClubs(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (!currentPw || !newPw) {
      setPwMsg({ text: t('Current password and new password are required.'), isError: true });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({
        text: t('New password must be at least 8 characters long.'),
        isError: true,
      });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ text: t('New passwords do not match.'), isError: true });
      return;
    }

    setSavingPw(true);
    try {
      const res = await changeStudentPassword(currentPw, newPw);
      setPwMsg({ text: res.message, isError: false });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: unknown) {
      setPwMsg({
        text: err instanceof Error ? err.message : t('Failed to change password'),
        isError: true,
      });
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#0D7751] animate-spin" />
        <div className="text-sm font-bold text-[#103125]">
          {t('Loading Club Member Portal...')}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl border border-[#E2ECE7] text-center space-y-6 shadow-sm animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-[#E9F5EF] text-[#0D7751] flex items-center justify-center mx-auto shadow-inner">
          <GraduationCap className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-[#103125]">{t('Club Member Module (STUDENT)')}</h3>
          <p className="text-xs text-[#5A7366] max-w-md mx-auto">
            {error ? error : t('No active student session detected. Use 1-click test sign-in or your institutional credentials.')}
          </p>
        </div>

        {/* Quick 1-Click Access for Evaluators & Reviewers */}
        <div className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0D7751] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              {t('Instant 1-Click Test Sign-In')}
            </span>
            <span className="text-[11px] font-mono text-[#5A7366]">Password: Password@123</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => void handleQuickLogin('student.bhu')}
              disabled={Boolean(quickLoginBusy)}
              className="p-3.5 rounded-xl bg-white border border-[#0D7751]/30 hover:border-[#0D7751] hover:bg-[#E9F5EF] text-left transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#103125]">Banaras Hindu University</span>
                {quickLoginBusy === 'student.bhu' ? (
                  <Loader2 className="w-4 h-4 text-[#0D7751] animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="text-[11px] text-[#5A7366] font-mono mt-0.5">student.bhu • CLUB-BHU-008</div>
              <div className="text-[10px] text-[#0D7751] font-semibold mt-1">Active seeded member (Passkey: BHU-LIB-2026-X89)</div>
            </button>

            <button
              onClick={() => void handleQuickLogin('student.iitkgp')}
              disabled={Boolean(quickLoginBusy)}
              className="p-3.5 rounded-xl bg-white border border-[#0D7751]/30 hover:border-[#0D7751] hover:bg-[#E9F5EF] text-left transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#103125]">IIT Kharagpur</span>
                {quickLoginBusy === 'student.iitkgp' ? (
                  <Loader2 className="w-4 h-4 text-[#0D7751] animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="text-[11px] text-[#5A7366] font-mono mt-0.5">student.iitkgp • CLUB-IITKGP-001</div>
              <div className="text-[10px] text-[#0D7751] font-semibold mt-1">Active seeded member (Passkey: KGP-LIB-2026-A12)</div>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onSignIn && (
            <button
              onClick={onSignIn}
              className="px-5 py-2.5 rounded-xl bg-[#0D7751] text-white text-xs font-bold cursor-pointer hover:bg-[#103125] transition-colors shadow-xs flex items-center space-x-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>{t('Sign In with Custom Credentials')}</span>
            </button>
          )}
          <a
            href="/join"
            className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] bg-white text-[#2E4A3E] text-xs font-bold cursor-pointer hover:bg-[#F4F8F6] transition-colors flex items-center space-x-1.5"
          >
            <User className="w-4 h-4 text-[#0D7751]" />
            <span>{t('Join with Club Passkey')}</span>
          </a>
          <button
            onClick={() => void loadMe()}
            className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] bg-white text-[#2E4A3E] text-xs font-bold cursor-pointer hover:bg-[#F4F8F6] transition-colors flex items-center space-x-1.5"
          >
            <RefreshCw className="w-4 h-4 text-[#5A7366]" />
            <span>{t('Retry')}</span>
          </button>
        </div>
      </div>
    );
  }

  const { profile, stats } = data;
  const isSuspended = Boolean(profile.is_suspended);
  const isExpired = Boolean(
    profile.valid_until && new Date(`${profile.valid_until}T23:59:59`) < new Date()
  );

  const badgeColor = {
    platinum: 'from-purple-600 to-indigo-700 text-white shadow-purple-200',
    gold: 'from-amber-500 to-yellow-600 text-white shadow-amber-200',
    silver: 'from-slate-400 to-slate-600 text-white shadow-slate-200',
    copper: 'from-amber-700 to-yellow-800 text-white shadow-amber-200',
  }[stats.badge as 'platinum' | 'gold' | 'silver' | 'copper'] || 'from-amber-700 to-yellow-800 text-white';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in">
      {/* SUSPENSION / EXPIRATION ALERT BANNERS */}
      {isSuspended && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 flex items-center gap-3 shadow-xs">
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">{t('Account Suspended:')} </span>
            {t(
              'Your membership account has been suspended by your sub-club coordinator or club authority. You cannot participate in events or modify your profile while suspended.',
            )}
          </div>
        </div>
      )}

      {isExpired && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-3 shadow-xs">
          <Clock className="w-6 h-6 text-amber-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">{t('Membership Validity Expired:')} </span>
            {t(
              `Your student club membership validity expired on ${profile.valid_until}. Please contact your club authority to renew your membership validity.`,
            )}
          </div>
        </div>
      )}

      {/* 1. TOP STUDENT IDENTITY BANNER */}
      <div className="bg-[#103125] text-white p-6 sm:p-8 rounded-3xl border border-[#1A503E] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center space-x-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white/10 border border-white/20 p-1 flex items-center justify-center shadow-inner shrink-0 overflow-hidden">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-amber-300" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-amber-300 bg-white/10 px-2.5 py-0.5 rounded-full border border-amber-300/30 uppercase tracking-wide">
                  {t('HEI Enrolled Student Member')}
                </span>
                <span className="text-xs text-brand-200 font-mono">
                  {t('Roll:')} {profile.roll_number}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {profile.full_name}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-200">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-300" />
                  <span>{profile.department}</span>
                </span>
                <span>•</span>
                <span>{profile.club.institution_name}</span>
                <span>•</span>
                <span className="text-amber-300 font-mono">
                  {t('Passkey:')} {profile.club.passkey}
                </span>
              </div>

              {profile.sub_clubs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-brand-300 font-medium">
                    {t('My Sub-Clubs:')}
                  </span>
                  {profile.sub_clubs.map((sc) => (
                    <span
                      key={sc.id}
                      className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold"
                    >
                      {sc.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Action & Sign Out */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {onViewPublicProfile && (
              <button
                onClick={onViewPublicProfile}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Globe className="w-4 h-4 text-emerald-300" />
                <span>{t('View Public Club Profile')}</span>
              </button>
            )}

            {onSignOut && (
              <button
                onClick={onSignOut}
                className="px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold border border-rose-400/30 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-300" />
                <span>{t('Sign Out & Lock')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. ACTIVITY TELEMETRICS & GAMIFICATION CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Points & Badge Tier */}
        <div
          className={`bg-gradient-to-br ${badgeColor} p-5 rounded-3xl shadow-md flex flex-col justify-between space-y-3 relative overflow-hidden`}
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-xs">
              <Trophy className="w-6 h-6 text-amber-200" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
              {stats.badge_label} Tier
            </span>
          </div>

          <div>
            <div className="text-3xl font-extrabold tracking-tight">{stats.points} pts</div>
            <div className="text-xs text-white/90 font-medium mt-1">
              {stats.points < 500
                ? t(`Next Tier: ${stats.next_tier_points} pts`)
                : t('Top Platinum Master')}
            </div>
            {/* Progress bar */}
            <div className="w-full bg-black/20 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-white h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (stats.points / stats.next_tier_points) * 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Card 2: Profile Completeness */}
        <div className="bg-white p-5 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-sky-100 text-sky-800">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
              +50 pts bonus
            </span>
          </div>

          <div>
            <div className="text-3xl font-extrabold text-[#103125]">
              {stats.profile_completeness}%
            </div>
            <div className="text-xs font-bold text-[#2E4A3E] mt-0.5">
              {t('Profile Completeness')}
            </div>
            {/* Completeness Bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-[#0D7751] h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.profile_completeness}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Card 3: Events & Certificates */}
        <div className="bg-white p-5 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800">
              <Award className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              +50 pts / event
            </span>
          </div>

          <div>
            <div className="text-3xl font-extrabold text-[#103125]">
              {stats.events_attended}
            </div>
            <div className="text-xs font-bold text-[#2E4A3E] mt-0.5">
              {t('Events Attended')} • {stats.certificates_earned} {t('Certificates')}
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              {t('Verifiable QR e-Certificates')}
            </div>
          </div>
        </div>

        {/* Card 4: Reading Streak */}
        <div className="bg-white p-5 rounded-3xl border border-[#E2ECE7] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-800">
              <Flame className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              Active Streak
            </span>
          </div>

          <div>
            <div className="text-3xl font-extrabold text-[#103125]">
              {stats.streak_days} {t('Days')}
            </div>
            <div className="text-xs font-bold text-[#2E4A3E] mt-0.5">
              {t('Reading & Learning Streak')}
            </div>
            <div className="text-[11px] text-[#5A7366] mt-1">
              {t('Daily NDLI resources interaction')}
            </div>
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-[#E2ECE7] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'events'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>
            {t('Events & Live Participation')} ({events.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <User className="w-4 h-4" />
          <span>{t('My Profile & Sub-Clubs')}</span>
          {stats.profile_completeness < 100 && (
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'libraries'
              ? 'bg-[#1A503E] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t('3-Tier Curated Libraries')}</span>
          <span className="bg-[#E9F5EF] text-[#0D7751] text-[10px] px-1.5 py-0.2 rounded font-extrabold">
            NDLI
          </span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: EVENTS & 30-MIN WINDOW PARTICIPATE
          ===================================================================== */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="bg-[#F4F8F6] p-4 rounded-2xl border border-[#E2ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#103125]">
                {t('Institutional & Inter-Club Events')}
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t(
                  'Participate during the dynamic 30-minute window (T-10m to T+20m). Earn verified certificates upon authority approval.',
                )}
              </p>
            </div>
            <button
              onClick={() => void loadEvents(profile.club.code)}
              className="p-2 rounded-xl border border-[#E2ECE7] bg-white text-[#2E4A3E] hover:bg-[#F4F8F6] cursor-pointer"
              title={t('Refresh events')}
            >
              <RefreshCw className={`w-4 h-4 ${eventsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {eventsLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2 text-xs text-[#5A7366]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0D7751]" />
              <span>{t('Loading events...')}</span>
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 bg-white rounded-3xl border border-[#E2ECE7] text-center space-y-2">
              <Calendar className="w-10 h-10 text-[#5A7366] mx-auto opacity-50" />
              <div className="text-base font-bold text-[#103125]">
                {t('No Scheduled Events Right Now')}
              </div>
              <p className="text-xs text-[#5A7366] max-w-sm mx-auto">
                {t(
                  'Your club authority has not published any events yet. Check back soon or visit the 3-Tier Curated Libraries.',
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((evt) => {
                const isWindowOpen = evt.is_window_open ?? evt.is_attendance_open;
                const isParticipating = participatingId === evt.id;
                const noticeMsg = participateNotice?.id === evt.id ? participateNotice.msg : null;

                return (
                  <div
                    key={evt.id}
                    className="bg-white rounded-3xl border border-[#E2ECE7] p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20 uppercase">
                          {evt.scope}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-[#5A7366]">
                          {evt.event_ref || `EVT-${evt.id}`}
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold text-[#103125] leading-snug">
                        {evt.title}
                      </h4>

                      <p className="text-xs text-[#5A7366] line-clamp-2">{evt.description}</p>

                      <div className="space-y-1 text-xs text-[#2E4A3E] pt-2 border-t border-[#E2ECE7]/60">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#0D7751]" />
                          <span>
                            {new Date(evt.start_time).toLocaleString()} –{' '}
                            {new Date(evt.end_time).toLocaleTimeString()}
                          </span>
                        </div>

                        {evt.conductors && evt.conductors.length > 0 && (
                          <div className="text-[11px] text-[#5A7366]">
                            {t('Conductors:')}{' '}
                            <strong>
                              {evt.conductors.map((c) => `${c.full_name} (${c.affiliation})`).join(', ')}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Window Status Banner & Actions */}
                    <div className="space-y-2 pt-2 border-t border-[#E2ECE7]">
                      {isWindowOpen ? (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                            </span>
                            <span>{t('30-Min Window LIVE')}</span>
                          </div>
                          <span className="text-[10px] text-emerald-700">
                            {t('Closes 20m after start')}
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#5A7366] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#5A7366]" />
                          <span>
                            {t('Attendance Window: T-10m to T+20m from start')}
                          </span>
                        </div>
                      )}

                      {noticeMsg && (
                        <div className="text-xs p-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 font-medium">
                          {noticeMsg}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Participate Button */}
                        <button
                          onClick={() => void handleParticipate(evt)}
                          disabled={!isWindowOpen || isParticipating || isSuspended || isExpired}
                          className="flex-1 py-2 px-3 rounded-xl bg-[#0D7751] hover:bg-[#103125] disabled:opacity-40 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>{isParticipating ? t('Recording...') : t('Participate Now')}</span>
                        </button>

                        {/* Certificates & DigiLocker Actions */}
                        <button
                          onClick={() => {
                            alert(
                              t(
                                `Certificate for ${evt.title} will download once attendance is approved by the Club Authority.`,
                              ),
                            );
                          }}
                          className="py-2 px-3 rounded-xl border border-[#E2ECE7] hover:bg-[#F4F8F6] text-[#2E4A3E] font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title={t('Download Participation Certificate')}
                        >
                          <Download className="w-3.5 h-3.5 text-[#0D7751]" />
                          <span>{t('Certificate')}</span>
                        </button>

                        <button
                          onClick={() => {
                            alert(
                              t(
                                'DigiLocker Integration: Certificate linked to your official Aadhaar DigiLocker locker upon authority approval.',
                              ),
                            );
                          }}
                          className="py-2 px-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title={t('Save to DigiLocker')}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                          <span>{t('DigiLocker')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: MY PROFILE, SUB-CLUBS & PASSWORD SETTINGS
          ===================================================================== */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Profile Form & Sub-Club Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Form 1: Personal Profile Details */}
            <form
              onSubmit={handleSaveProfile}
              className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4"
            >
              <div className="border-b border-[#E2ECE7] pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#103125]">
                    {t('Personal Profile & Demographics')}
                  </h3>
                  <p className="text-xs text-[#5A7366]">
                    {t('Complete all fields to earn your +50 Profile Completeness points.')}
                  </p>
                </div>
                {profileSuccessMsg && (
                  <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-1 rounded-full">
                    {profileSuccessMsg}
                  </span>
                )}
              </div>

              {/* Avatar Upload */}
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-[#E2ECE7] flex items-center justify-center overflow-hidden">
                  {avatarFile ? (
                    <img
                      src={URL.createObjectURL(avatarFile)}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  ) : profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#2E4A3E] block">
                    {t('Profile Photo / Avatar')}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                    className="text-xs text-[#5A7366] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#E9F5EF] file:text-[#0D7751] hover:file:bg-[#d5eee0] cursor-pointer"
                  />
                </div>
              </div>

              {/* Date of Birth & Auto Age Calculation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                    {t('Date of Birth')}
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                    {t('Calculated Age')}
                  </label>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-[#E2ECE7] text-xs font-bold text-[#103125]">
                    {profile.age ? `${profile.age} ${t('Years Old')}` : '—'}
                  </div>
                </div>
              </div>

              {/* Hobbies */}
              <div>
                <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                  {t('Hobbies & Research Interests')}
                </label>
                <textarea
                  rows={2}
                  placeholder={t('e.g. AI Research, Competitive Programming, Classical Literature')}
                  value={hobbies}
                  onChange={(e) => setHobbies(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                />
              </div>

              {/* Address, State, Pincode */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                    {t('Address')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('Hostel / Residential Address')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                      {t('State / UT')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('e.g. West Bengal, Delhi')}
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                      {t('PIN Code')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('e.g. 721302')}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                    />
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div className="space-y-2 pt-2 border-t border-[#E2ECE7]">
                <span className="text-xs font-bold text-[#2E4A3E] block">
                  {t('Social Links (Optional)')}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="url"
                    placeholder={t('Facebook URL')}
                    value={socialFb}
                    onChange={(e) => setSocialFb(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-[#E2ECE7] text-xs"
                  />
                  <input
                    type="url"
                    placeholder={t('Instagram URL')}
                    value={socialInsta}
                    onChange={(e) => setSocialInsta(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-[#E2ECE7] text-xs"
                  />
                  <input
                    type="url"
                    placeholder={t('X / Twitter URL')}
                    value={socialX}
                    onChange={(e) => setSocialX(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-[#E2ECE7] text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingProfile || isSuspended || isExpired}
                className="w-full py-2.5 rounded-xl bg-[#0D7751] hover:bg-[#103125] disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>{savingProfile ? t('Saving Profile...') : t('Save Profile Details')}</span>
              </button>
            </form>

            {/* Sub-Club Self-Selection Panel */}
            <div className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#103125]">
                    {t('Choose Your Sub-Clubs (1+N)')}
                  </h3>
                  <p className="text-xs text-[#5A7366]">
                    {t(
                      'Students can choose to participate in multiple active disciplinary sub-clubs. Earn +25 points per sub-club.',
                    )}
                  </p>
                </div>
                <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded-full">
                  +25 pts / club
                </span>
              </div>

              {subClubsLoading ? (
                <div className="py-6 flex items-center justify-center text-xs text-[#5A7366]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0D7751] mr-2" />
                  <span>{t('Loading active sub-clubs...')}</span>
                </div>
              ) : availableSubClubs.length === 0 ? (
                <p className="text-xs text-[#5A7366] py-3 text-center">
                  {t(
                    'No sub-clubs formed yet in this institution. You are automatically enrolled in the Main Club.',
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {availableSubClubs.map((sc) => {
                    const isChecked = selectedSubClubIds.includes(sc.id);
                    return (
                      <label
                        key={sc.id}
                        className={`flex items-start space-x-2.5 p-3 rounded-2xl border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#E9F5EF] border-[#0D7751]'
                            : 'bg-white border-[#E2ECE7] hover:bg-[#F4F8F6]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedSubClubIds((prev) =>
                              prev.includes(sc.id)
                                ? prev.filter((id) => id !== sc.id)
                                : [...prev, sc.id],
                            );
                          }}
                          className="rounded border-[#E2ECE7] text-[#0D7751] focus:ring-[#0D7751] mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-[#103125]">{sc.name}</div>
                          <div className="text-[11px] text-[#5A7366]">{sc.discipline}</div>
                          <div className="text-[10px] text-[#0D7751] font-mono mt-0.5">
                            {sc.code}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {availableSubClubs.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSaveSubClubs()}
                  disabled={savingSubClubs || isSuspended || isExpired}
                  className="py-2.5 px-4 rounded-xl bg-[#1A503E] hover:bg-[#103125] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-300" />
                  <span>
                    {savingSubClubs ? t('Saving Sub-Clubs...') : t('Save Sub-Club Preferences')}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Column 3: In-App Password Change & Membership Info */}
          <div className="space-y-6">
            {/* In-App Password Change */}
            <form
              onSubmit={handleChangePassword}
              className="bg-white p-6 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-3.5"
            >
              <div className="flex items-center space-x-2 border-b border-[#E2ECE7] pb-3">
                <Lock className="w-4 h-4 text-[#0D7751]" />
                <h3 className="text-base font-bold text-[#103125]">
                  {t('In-App Password Change')}
                </h3>
              </div>

              {pwMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold ${
                    pwMsg.isError
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/30'
                  }`}
                >
                  {pwMsg.text}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                  {t('Current Password')}
                </label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                  {t('New Password (Min. 8 chars)')}
                </label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#2E4A3E] block mb-1">
                  {t('Confirm New Password')}
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#E2ECE7] text-xs focus:ring-2 focus:ring-[#0D7751]"
                />
              </div>

              <button
                type="submit"
                disabled={savingPw || isSuspended || isExpired}
                className="w-full py-2.5 rounded-xl bg-[#1A503E] hover:bg-[#103125] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {savingPw ? t('Updating Password...') : t('Update Password')}
              </button>
            </form>

            {/* Membership Validity & Governance Card */}
            <div className="bg-[#F4F8F6] p-6 rounded-3xl border border-[#E2ECE7] space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#103125]">
                <ShieldCheck className="w-4 h-4 text-[#0D7751]" />
                <span>{t('Membership Governance')}</span>
              </div>

              <div className="text-xs space-y-1.5 text-[#5A7366]">
                <div className="flex justify-between">
                  <span>{t('Assigned Validity:')}</span>
                  <strong className="text-[#103125]">{profile.validity_years} Year(s)</strong>
                </div>
                <div className="flex justify-between">
                  <span>{t('Valid Until:')}</span>
                  <strong className="text-[#103125]">{profile.valid_until || '—'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>{t('Account State:')}</span>
                  <strong
                    className={profile.is_suspended ? 'text-rose-600' : 'text-[#0D7751]'}
                  >
                    {profile.is_suspended ? t('Suspended') : t('Active Member')}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-[#5A7366] pt-2 border-t border-[#E2ECE7]">
                {t(
                  'Membership validity is set by your institution. Accounts automatically lock on the expiration date.',
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: 3-TIER CURATED LIBRARIES (CLUB, PERSONAL, COMMUNITY)
          ===================================================================== */}
      {activeTab === 'libraries' && (
        <div className="space-y-4">
          <CuratedLibraryHub
            clubId={profile.club.code}
            isAuthority={false}
            isStudent={true}
          />
        </div>
      )}
    </div>
  );
};
