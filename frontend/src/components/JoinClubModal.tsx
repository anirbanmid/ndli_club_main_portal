import React, { useState } from 'react';
import {
  KeyRound,
  X,
  CheckCircle2,
  Building2,
  User,
  Mail,
  ArrowRight,
  Lock,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { InstituteClub } from '../types';
import { useModalBehavior } from '../utils/useModalBehavior';
import { t } from '../i18n';
import { registerStudentMember } from '../lib/campusApi';

interface JoinClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: InstituteClub[];
  onMemberJoined: (club: InstituteClub, memberName: string) => void;
  initialPasskey?: string;
}

export const JoinClubModal: React.FC<JoinClubModalProps> = ({
  isOpen,
  onClose,
  clubs,
  onMemberJoined,
  initialPasskey = '',
}) => {
  const [passkeyInput, setPasskeyInput] = useState(initialPasskey);
  const [studentName, setStudentName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [studentEmail, setStudentEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [joinedClub, setJoinedClub] = useState<InstituteClub | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialPasskey) {
      setPasskeyInput(initialPasskey);
    }
  }, [initialPasskey]);

  const resetForm = () => {
    setPasskeyInput('');
    setStudentName('');
    setGender('male');
    setStudentEmail('');
    setPassword('');
    setDepartment('');
    setRollNumber('');
    setErrorMsg('');
    setSubmitting(false);
    setJoinedClub(null);
    setSuccessNotice(null);
    onClose();
  };

  useModalBehavior(isOpen, resetForm);

  if (!isOpen) return null;

  const handleQuickKey = (key: string) => {
    setPasskeyInput(key);
    setErrorMsg('');
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!passkeyInput.trim()) {
      setErrorMsg(t('Institutional Passkey is required.'));
      return;
    }
    if (!studentName.trim() || !studentEmail.trim()) {
      setErrorMsg(t('Full Name and Student Email are required.'));
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg(t('Password must be at least 6 characters.'));
      return;
    }
    if (!department.trim() || !rollNumber.trim()) {
      setErrorMsg(t('Department and Roll/Registration Number are required.'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerStudentMember({
        passkey: passkeyInput.trim(),
        full_name: studentName.trim(),
        gender,
        email: studentEmail.trim(),
        password,
        department: department.trim(),
        roll_number: rollNumber.trim(),
      });

      const matchedClub =
        clubs.find(
          (c) =>
            c.passkey.trim().toUpperCase() === passkeyInput.trim().toUpperCase() ||
            c.id.toLowerCase() === res.club_code.toLowerCase(),
        ) ||
        clubs[0] || {
          id: res.club_code,
          name: res.institution_name,
          aisheCode: 'AISHE-EST',
          district: 'Campus',
          state: 'National',
          zone: 'Central' as const,
          category: 'University' as const,
          passkey: passkeyInput,
          status: 'Active' as const,
          memberCount: 0,
          eventsConducted: 0,
          establishedDate: '2026-01-01',
          authorities: [],
        };

      setJoinedClub(matchedClub);
      setSuccessNotice(res.message);
      onMemberJoined(matchedClub, studentName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('Failed to submit enrollment application.');
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
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

        {!joinedClub ? (
          <form onSubmit={handleJoin} className="space-y-4">
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
                  "Enter your institution's passkey and personal details. An enrollment application will be submitted to the Club Authority.",
                )}
              </p>
            </div>

            {/* Quick Demo Test Keys */}
            <div className="bg-ink-50 border border-ink-200 rounded-xl p-2.5 text-xs">
              <span className="text-ink-600 font-semibold block mb-1">
                {t('Quick Demo Institutional Passkeys:')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickKey('IITKGP-NDL-9021')}
                  className="px-2 py-0.5 rounded bg-white border border-ink-300 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                >
                  {t('IIT Kharagpur (IITKGP-NDL-9021)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickKey('IITB-NDL-4412')}
                  className="px-2 py-0.5 rounded bg-white border border-ink-300 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                >
                  {t('IIT Bombay (IITB-NDL-4412)')}
                </button>
              </div>
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
                  <label className="font-bold text-ink-700 block mb-1">{t('Gender *')}</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="male">{t('Male')}</option>
                    <option value="female">{t('Female')}</option>
                    <option value="other">{t('Other')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-ink-700 block mb-1">
                    {t('Department / Discipline *')}
                  </label>
                  <div className="relative">
                    <GraduationCap className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                    <input
                      type="text"
                      placeholder={t('e.g. Computer Science')}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      required
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-ink-700 block mb-1">
                    {t('Roll / Reg. No. *')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('e.g. 24CS1042')}
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
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
            >
              <span>{submitting ? t('Verifying...') : t('Verify Passkey & Submit Join Application')}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <div className="text-center space-y-4 py-3">
            <div className="h-16 w-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>

            <h3 className="text-xl font-extrabold text-ink-900">
              {t('Enrollment Application Submitted!')}
            </h3>

            <div className="bg-ink-50 border border-ink-200 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center space-x-2 text-xs text-ink-600 font-semibold uppercase">
                <Building2 className="h-4 w-4 text-brand-600" />
                <span>{t('Affiliated Institutional Chapter')}</span>
              </div>
              <div className="font-bold text-sm text-ink-900">{joinedClub.name}</div>
              <div className="text-xs text-ink-600">
                {t('Applicant:')} <strong>{studentName}</strong> (Roll: {rollNumber})
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('Next Steps')}</span>
              </div>
              <p>
                {successNotice ||
                  t(
                    'A verification link has been sent to your email. Your enrollment application is currently under review by the Club Authority.',
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

