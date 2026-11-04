import React, { useState } from 'react';
import {
  KeyRound,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  User,
  Mail,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';
import { InstituteClub } from '../types';
import { useModalBehavior } from '../utils/useModalBehavior';
import { t } from '../i18n';
import { registerStudentMember, checkPreapproval, terminateMembership } from '../lib/campusApi';
import type {
  PreapprovalCheckResponse,
  StudentJoinPayload,
  TerminateMembershipResult,
} from '../lib/campusApi';

interface JoinClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: InstituteClub[];
  onMemberJoined: (club: InstituteClub, memberName: string) => void;
  initialPasskey?: string;
}

type Phase = 'check' | 'cross_institution_confirm' | 'password' | 'done';

export const JoinClubModal: React.FC<JoinClubModalProps> = ({
  isOpen,
  onClose,
  clubs,
  onMemberJoined,
  initialPasskey = '',
}) => {
  const [phase, setPhase] = useState<Phase>('check');
  const [passkeyInput, setPasskeyInput] = useState(initialPasskey);
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [joinedClub, setJoinedClub] = useState<InstituteClub | null>(null);
  const [checkResult, setCheckResult] = useState<PreapprovalCheckResponse | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [crossInstitutionBusy, setCrossInstitutionBusy] = useState(false);

  React.useEffect(() => {
    if (initialPasskey) {
      setPasskeyInput(initialPasskey);
    }
  }, [initialPasskey]);

  const resetForm = () => {
    setPhase('check');
    setPasskeyInput('');
    setStudentName('');
    setStudentEmail('');
    setPassword('');
    setSubmitting(false);
    setErrorMsg('');
    setJoinedClub(null);
    setCheckResult(null);
    setSuccessNotice(null);
    setCrossInstitutionBusy(false);
    onClose();
  };

  useModalBehavior(isOpen, resetForm);

  if (!isOpen) return null;

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!passkeyInput.trim()) {
      setErrorMsg(t('Institutional Passkey is required.'));
      return;
    }
    if (!studentName.trim()) {
      setErrorMsg(t('Full Name is required.'));
      return;
    }
    if (!studentEmail.trim()) {
      setErrorMsg(t('Student Email is required.'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await checkPreapproval({
        passkey: passkeyInput.trim(),
        email: studentEmail.trim(),
        full_name: studentName.trim(),
      });
      setCheckResult(result);

      if (result.cross_institution_match) {
        // Email already exists as a member at another institution.
        // Require explicit YES/NO before proceeding.
        setPhase('cross_institution_confirm');
      } else {
        setPhase('password');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('Pre-approval check failed.');
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!password || password.length < 6) {
      setErrorMsg(t('Password must be at least 6 characters.'));
      return;
    }

    setSubmitting(true);
    try {
      const isPreApproved = checkResult?.match === true;
      const payload: StudentJoinPayload = {
        passkey: passkeyInput.trim(),
        full_name: studentName.trim(),
        gender: 'other',
        email: studentEmail.trim(),
        password,
        department: checkResult?.roster_name || '',
        roll_number: '',
        auto_activate: isPreApproved,
      };
      const res = await registerStudentMember(payload);

      const matchedClub =
        clubs.find(
          (c) =>
            c.passkey.trim().toUpperCase() === passkeyInput.trim().toUpperCase(),
        ) || {
          id: res.club_code,
          name: res.institution_name,
          aisheCode: '',
          district: '',
          state: '',
          zone: 'Central' as const,
          category: 'Autonomous Institute' as const,
          passkey: passkeyInput,
          status: 'Active' as const,
          memberCount: 0,
          eventsConducted: 0,
          establishedDate: '',
          authorities: [],
        };

      setJoinedClub(matchedClub);
      setSuccessNotice(res.message);
      onMemberJoined(matchedClub, studentName);
      setPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('Failed to complete onboarding.');
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCrossInstitutionConfirm = async () => {
    const match = checkResult?.cross_institution_match;
    if (!match || !studentEmail.trim()) return;

    setCrossInstitutionBusy(true);
    setErrorMsg('');
    try {
      await terminateMembership(studentEmail.trim(), match.club_code);
      // Termination succeeded — proceed to password phase for new institution
      setPhase('password');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('Failed to terminate previous membership.');
      setErrorMsg(msg);
    } finally {
      setCrossInstitutionBusy(false);
    }
  };

  const handleCrossInstitutionCancel = () => {
    setErrorMsg(
      t('Onboarding cancelled. You cannot join this institution while an active membership exists elsewhere.'),
    );
    setPhase('check');
  };

  return (
    <div
      onClick={resetForm}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Join club with passkey')}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-ink-200 relative animate-in fade-in my-8"
      >
        <button
          onClick={resetForm}
          aria-label={t('Close dialog')}
          className="absolute right-5 top-5 p-1 rounded-full text-ink-600 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Phase 1: Check passkey + name + email */}
        {phase === 'check' && (
          <form onSubmit={handleCheck} className="space-y-4">
            <div className="space-y-1">
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-full">
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t('HEI Student Passkey Self-Join')}</span>
              </div>
              <h3 className="text-xl font-extrabold text-ink-900 tracking-tight">
                {t('Join Your Campus NDLI Club')}
              </h3>
              <p className="text-xs text-ink-600">
                {t(
                  'Enter your institution passkey, name, and email. Your club authority may have pre-approved your membership.',
                )}
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink-700 block mb-1">
                  {t('Institutional Passkey *')}
                </label>
                <input
                  type="text"
                  placeholder={t('e.g. IITKGP-NDL-9021')}
                  value={passkeyInput}
                  onChange={(e) => setPasskeyInput(e.target.value.toUpperCase())}
                  required
                  className="w-full px-3 py-2 text-sm font-mono font-bold tracking-wider rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500 uppercase bg-ink-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="font-bold text-ink-700 block mb-1">
                    {t('Full Name (As on Certificate) *')}
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                    <input
                      type="text"
                      placeholder={t('e.g. Ananya Sen')}
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-ink-700 block mb-1">
                    {t('Student Email *')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                    <input
                      type="email"
                      placeholder={t('e.g. ananya@college.edu')}
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      required
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <span>{submitting ? t('Checking…') : t('Check')}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Phase 1.5: Cross-Institution Termination Confirmation */}
        {phase === 'cross_institution_confirm' && (
          <div className="text-center space-y-4 py-3">
            <div className="h-16 w-16 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="h-10 w-10 text-rose-600" />
            </div>

            <h3 className="text-xl font-extrabold text-ink-900">
              {t('Existing Membership Found')}
            </h3>
            <p className="text-xs text-ink-600 max-w-sm mx-auto leading-relaxed">
              {`This email is already registered as a member at ${checkResult?.cross_institution_match?.institution_name ?? ''} (${checkResult?.cross_institution_match?.club_name ?? ''}).`}
            </p>
            <p className="text-xs text-ink-600 max-w-sm mx-auto leading-relaxed">
              {t('To join this new institution, your previous membership must be terminated first. This action cannot be undone.')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleCrossInstitutionConfirm}
                disabled={crossInstitutionBusy}
                className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                {crossInstitutionBusy ? (
                  <span className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                <span>{t('Yes, Terminate & Join')}</span>
              </button>
              <button
                onClick={handleCrossInstitutionCancel}
                className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-gray-100 hover:bg-gray-200 text-ink-700 font-bold text-xs transition-all cursor-pointer"
              >
                {t('No, Cancel Onboarding')}
              </button>
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-medium">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Phase 2: Create password */}
        {phase === 'password' && (
          <div className="text-center space-y-4 py-3">
            <div className="h-16 w-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <KeyRound className="h-10 w-10 text-brand-600" />
            </div>

            {checkResult?.match ? (
              <>
                <h3 className="text-xl font-extrabold text-ink-900">
                  {t('Membership Pre-Approved')}
                </h3>
                <p className="text-xs text-ink-600 max-w-sm mx-auto">
                  {t(
                    'Your membership has already been approved by your institution authority. Please create a password for final onboarding.',
                  )}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-extrabold text-ink-900">
                  {t('Create Your Password')}
                </h3>
                <p className="text-xs text-ink-600 max-w-sm mx-auto">
                  {t(
                    'No record found with this name and email. Please create a password and submit for final approval by your institution authority.',
                  )}
                </p>
              </>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink-700 block mb-1">
                  {t('Create Password *')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                  <input
                    type="password"
                    placeholder={t('Min. 6 chars')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
              onClick={handleComplete}
            >
              <span>{submitting ? t('Creating…') : checkResult?.match ? t('Complete Onboarding') : t('Submit for Approval')}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Phase 3: Done */}
        {phase === 'done' && (
          <div className="text-center space-y-4 py-3">
            <div className="h-16 w-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>

            <h3 className="text-xl font-extrabold text-ink-900">
              {t('Onboarding Complete!')}
            </h3>
            <div className="bg-ink-50 border border-ink-200 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center space-x-2 text-xs text-ink-600 font-semibold uppercase">
                <Building2 className="h-4 w-4 text-brand-600" />
                <span>{t('Affiliated Institutional Chapter')}</span>
              </div>
              <div className="font-bold text-sm text-ink-900">{joinedClub?.name || t('Unknown Club')}</div>
              <div className="text-xs text-ink-600">
                {t('Applicant:')} <strong>{studentName}</strong>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('Next Steps')}</span>
              </div>
              <p>
                {successNotice ||
                  t(
                    checkResult?.match
                      ? 'Your account is active. You can log in to the Club Member Module immediately.'
                      : 'Your application is under review by the club authority. You will be notified once approved.',
                  )}
              </p>
            </div>

            <button
              onClick={resetForm}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-sm hover:bg-brand-700 transition-colors cursor-pointer"
            >
              {t('Done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
