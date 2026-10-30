import React, { useState } from 'react';
import { KeyRound, X, CheckCircle2, Building2, User, Mail, ArrowRight } from 'lucide-react';
import { InstituteClub } from '../types';
import { useModalBehavior } from '../utils/useModalBehavior';
import { t } from "../i18n";

interface JoinClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: InstituteClub[];
  onMemberJoined: (club: InstituteClub, memberName: string) => void;
}

export const JoinClubModal: React.FC<JoinClubModalProps> = ({
  isOpen,
  onClose,
  clubs,
  onMemberJoined,
}) => {
  const [passkeyInput, setPasskeyInput] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [joinedClub, setJoinedClub] = useState<InstituteClub | null>(null);

  const resetForm = () => {
    setPasskeyInput('');
    setStudentName('');
    setStudentEmail('');
    setRollNumber('');
    setErrorMsg('');
    setJoinedClub(null);
    onClose();
  };

  // S1: shared dialog behaviour (Escape / scroll-lock / focus).
  useModalBehavior(isOpen, resetForm);

  if (!isOpen) return null;

  const handleQuickKey = (key: string) => {
    setPasskeyInput(key);
    setErrorMsg('');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const matchedClub = clubs.find(
      c => c.passkey.trim().toUpperCase() === passkeyInput.trim().toUpperCase()
    );

    if (!matchedClub) {
      setErrorMsg('Invalid Institutional Passkey. Please verify with your College Library or Club President.');
      return;
    }

    if (!studentName || !studentEmail) {
      setErrorMsg('Please enter your full name and student email address.');
      return;
    }

    setJoinedClub(matchedClub);
    onMemberJoined(matchedClub, studentName);
  };

  return (
    <div onClick={resetForm} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("Join club with passkey")} tabIndex={-1} className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-ink-200 relative animate-in fade-in">
        {/* Close Button */}
        <button
          onClick={resetForm}
          aria-label={t("Close dialog")} className="absolute right-5 top-5 p-1 rounded-full text-ink-600 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {!joinedClub ? (
          <form onSubmit={handleJoin} className="space-y-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-full">
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t("Student / Scholar Passkey Access")}</span>
              </div>
              <h3 className="text-xl font-extrabold text-ink-900 tracking-tight">
                {t("Join Your Campus NDLI Club")}
                                            </h3>
              <p className="text-xs text-ink-600">
                {t("Enter the unique passkey provided by your institution's central library or club coordinator.")}
                                            </p>
            </div>

            {/* Quick Demo Test Keys */}
            <div className="bg-ink-50 border border-ink-200 rounded-xl p-3 text-xs">
              <span className="text-ink-600 font-semibold block mb-1.5">{t("Quick Demo Passkeys:")}</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickKey('IITKGP-NDL-9021')}
                  className="px-2 py-1 rounded bg-white border border-ink-300 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                >
                  {t("IIT Kharagpur (IITKGP-NDL-9021)")}
                                                  </button>
                <button
                  type="button"
                  onClick={() => handleQuickKey('IITB-NDL-4412')}
                  className="px-2 py-1 rounded bg-white border border-ink-300 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                >
                  {t("IIT Bombay (IITB-NDL-4412)")}
                                                  </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink-700 block mb-1">
                  {t("Institutional Passkey *")}
                                                  </label>
                <input
                  type="text"
                  placeholder={t("e.g. IITKGP-NDL-9021")}
                  value={passkeyInput}
                  onChange={(e) => setPasskeyInput(e.target.value.toUpperCase())}
                  required
                  className="w-full px-3.5 py-2 text-sm font-mono font-bold tracking-wider rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500 uppercase bg-ink-50"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-700 block mb-1">
                  {t("Full Name (As on Certificate) *")}
                                                  </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-ink-600" />
                  <input
                    type="text"
                    placeholder={t("e.g. Ananya Sen")}
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-ink-700 block mb-1">
                    {t("Student Email *")}
                                                        </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-ink-600" />
                    <input
                      type="email"
                      placeholder={t("e.g. student@college.edu")}
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      required
                      className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-700 block mb-1">
                    {t("Roll / Reg. No.")}
                                                        </label>
                  <input
                    type="text"
                    placeholder={t("e.g. 23CS1004")}
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-ink-300 focus:ring-2 focus:ring-brand-500"
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
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all"
            >
              <span>{t("Verify Passkey & Join Club")}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <div className="text-center space-y-4 py-3">
            <div className="h-16 w-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <h3 className="text-xl font-extrabold text-ink-900">
              {t("Welcome to the Club,")} {studentName}!
            </h3>

            <div className="bg-ink-50 border border-ink-200 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center space-x-2 text-xs text-ink-600 font-semibold uppercase">
                <Building2 className="h-4 w-4 text-brand-600" />
                <span>{t("Affiliated NDLI Chapter")}</span>
              </div>
              <div className="font-bold text-sm text-ink-900">{joinedClub.name}</div>
              <div className="text-xs text-ink-600">
                {t("District:")} {joinedClub.district}, {joinedClub.state} {t("(AISHE:")} {joinedClub.aisheCode})
              </div>
            </div>

            <p className="text-xs text-ink-600">
              {t("Your member status is active. You can now register for club competitions, access digital reading tracks, and earn verifiable e-certificates.")}
                                          </p>

            <button
              onClick={resetForm}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm shadow-sm hover:bg-brand-700 transition-colors"
            >
              {t("Done & Explore Activities")}
                                          </button>
          </div>
        )}
      </div>
    </div>
  );
};
