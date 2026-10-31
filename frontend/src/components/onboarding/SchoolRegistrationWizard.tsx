import React, { useState } from 'react';
import { 
  School as SchoolIcon, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  KeyRound, 
  Copy, 
  Check, 
  AlertCircle, 
  Upload, 
  Loader2, 
  Mail
} from 'lucide-react';
import { 
  createDraft, 
  updateIdentity, 
  upsertAuthority, 
  uploadDocument, 
  submitDraft, 
  DraftPayload,
  AuthorityRole
} from '../../lib/onboardingApi';
import { 
  checkAuthorityEmail, 
  confirmAuthorityDeactivation,
  AuthorityEmailCheckResult 
} from '../../lib/campusApi';
import { INDIAN_STATES_AND_UTS, findStateByQuery } from '../../utils/indiaGeography';
import { saveResumeCapability } from '../../lib/onboardingResume';

interface SchoolRegistrationWizardProps {
  initialDraft?: DraftPayload | null;
  initialToken?: string | null;
  onBackToLanding: () => void;
  onSubmitSuccess: (applicationId: string) => void;
}

const SCHOOL_AUTHORITY_STEPS: { role: AuthorityRole; label: string; desc: string }[] = [
  { role: 'patron', label: 'Patron', desc: 'Head of Institution (HM / Principal)' },
  { role: 'president', label: 'President', desc: 'Any Teacher' },
  { role: 'secretary', label: 'Secretary', desc: 'Librarian / Any Teacher' },
];

export const SchoolRegistrationWizard: React.FC<SchoolRegistrationWizardProps> = ({
  initialDraft = null,
  initialToken = null,
  onBackToLanding,
  onSubmitSuccess,
}) => {
  // Current step: 0=Identity, 1=Patron, 2=President, 3=Secretary, 4=Letterhead, 5=Review
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [resumeToken, setResumeToken] = useState<string>(initialToken ?? '');
  const [draft, setDraft] = useState<DraftPayload | null>(initialDraft);
  const [copiedToken, setCopiedToken] = useState(false);

  // Identity Form State
  const [institutionName, setInstitutionName] = useState(initialDraft?.institution_name ?? '');
  const [affiliationCode, setAffiliationCode] = useState('');
  const [boardType, setBoardType] = useState('CBSE');
  const [clubName, setClubName] = useState(initialDraft?.club_name ?? '');
  const [stateCode, setStateCode] = useState(initialDraft?.state_code ?? 'WB');
  const [districtCode, setDistrictCode] = useState(initialDraft?.district_code ?? '');

  // 3-Tier Authorities (Patron, President, Secretary)
  const [authorities, setAuthorities] = useState<Record<AuthorityRole, {
    fullName: string;
    email: string;
    phone: string;
    designation: string;
    checked: boolean;
  }>>({
    patron: { fullName: '', email: '', phone: '', designation: 'Headmaster / Principal', checked: false },
    president: { fullName: '', email: '', phone: '', designation: 'Senior Teacher', checked: false },
    secretary: { fullName: '', email: '', phone: '', designation: 'Librarian / Teacher', checked: false },
    executive: { fullName: '', email: '', phone: '', designation: '', checked: true }, // Omitted for schools
  });

  // Real-time email check state
  const [emailCheckBusy, setEmailCheckBusy] = useState(false);
  const [conflictModalData, setConflictModalData] = useState<{
    role: AuthorityRole;
    email: string;
    info: AuthorityEmailCheckResult;
  } | null>(null);

  // Document state
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  // General busy & error states
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const selectedStateObj = findStateByQuery(stateCode);
  const zoneCode = selectedStateObj?.zoneCode ?? 'EZ';

  const copyTokenToClipboard = () => {
    if (!resumeToken) return;
    navigator.clipboard.writeText(resumeToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Step 0: Identity
  const handleStartIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionName.trim() || !clubName.trim() || !affiliationCode.trim()) {
      setStepError('Please complete all mandatory school identity fields.');
      return;
    }

    setBusy(true);
    setStepError(null);

    try {
      if (!draft) {
        const created = await createDraft({
          institution_name: institutionName.trim(),
          aishe_code: '', // Not required for schools
          club_name: clubName.trim(),
          state_code: stateCode,
          zone_code: zoneCode,
          district_code: districtCode.trim() || selectedStateObj?.name || 'District',
        });
        setDraft(created);
        setResumeToken(created.resume_token);
        saveResumeCapability({ token: created.resume_token, draftId: created.id });
      } else {
        const updated = await updateIdentity(draft.id, resumeToken, {
          institution_name: institutionName.trim(),
          aishe_code: '',
          club_name: clubName.trim(),
          state_code: stateCode,
          zone_code: zoneCode,
          district_code: districtCode.trim() || selectedStateObj?.name || 'District',
        });
        setDraft(updated);
      }
      setCurrentStepIndex(1); // Advance to Patron
    } catch (err: any) {
      setStepError(err.message || 'Failed to save school identity.');
    } finally {
      setBusy(false);
    }
  };

  // Check email de-duplication
  const handleCheckEmail = async (role: AuthorityRole) => {
    const authData = authorities[role];
    if (!authData.email.trim()) {
      setStepError('Please enter an email address before checking.');
      return;
    }
    setEmailCheckBusy(true);
    setStepError(null);

    try {
      const res = await checkAuthorityEmail(authData.email.trim());
      if (res.conflict) {
        setConflictModalData({ role, email: authData.email.trim(), info: res });
      } else {
        setAuthorities(prev => ({
          ...prev,
          [role]: { ...prev[role], checked: true }
        }));
      }
    } catch (err: any) {
      setStepError(err.message || 'Failed to check authority email.');
    } finally {
      setEmailCheckBusy(false);
    }
  };

  const handleConfirmDeactivation = async () => {
    if (!conflictModalData) return;
    setBusy(true);
    try {
      await confirmAuthorityDeactivation(conflictModalData.email);
      setAuthorities(prev => ({
        ...prev,
        [conflictModalData.role]: { ...prev[conflictModalData.role], checked: true }
      }));
      setConflictModalData(null);
    } catch (err: any) {
      setStepError(err.message || 'Failed to deactivate previous authority assignment.');
    } finally {
      setBusy(false);
    }
  };

  // Steps 1-3: Save Authority
  const handleSaveAuthority = async (role: AuthorityRole) => {
    const authData = authorities[role];
    if (!authData.fullName.trim() || !authData.email.trim() || !authData.designation.trim()) {
      setStepError('Full Name, Email Address, and Designation are required.');
      return;
    }

    if (!draft || !resumeToken) {
      setStepError('Session draft is missing. Please restart the wizard.');
      return;
    }

    setBusy(true);
    setStepError(null);

    try {
      const updated = await upsertAuthority(draft.id, resumeToken, role, {
        full_name: authData.fullName.trim(),
        email: authData.email.trim(),
        phone: authData.phone.trim() || '+91 9800000000',
        designation: authData.designation.trim(),
      });
      setDraft(updated);
      setCurrentStepIndex(prev => prev + 1);
    } catch (err: any) {
      setStepError(err.message || `Failed to save ${role} details.`);
    } finally {
      setBusy(false);
    }
  };

  // Step 4: Upload Document
  const handleUploadDocument = async () => {
    if (!documentFile) {
      setStepError('Please select the signed & stamped school letterhead endorsement.');
      return;
    }
    if (!draft || !resumeToken) return;

    setBusy(true);
    setStepError(null);

    try {
      const updated = await uploadDocument(draft.id, resumeToken, documentFile);
      setDraft(updated);
      setCurrentStepIndex(prev => prev + 1); // Move to review
    } catch (err: any) {
      setStepError(err.message || 'Failed to upload document.');
    } finally {
      setBusy(false);
    }
  };

  // Step 5: Final Submit
  const handleFinalSubmit = async () => {
    if (!draft || !resumeToken) return;
    setBusy(true);
    setStepError(null);

    try {
      const result = await submitDraft(draft.id, resumeToken);
      onSubmitSuccess(result.application_id);
    } catch (err: any) {
      setStepError(err.message || 'Failed to submit application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in">
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#1E3A2F] via-[#2D5A46] to-[#174332] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 bg-amber-400/20 border border-amber-300/30 px-3 py-1 rounded-full text-xs font-bold text-amber-300 mb-2">
              <SchoolIcon className="h-3.5 w-3.5" />
              <span>School Offline-First Tangible Identity Charter</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              School Club Onboarding Wizard
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1">
              3-Tier Quorum: Patron (HM/Principal) &bull; President (Teacher) &bull; Secretary (Librarian/Teacher)
            </p>
          </div>
          <button
            onClick={onBackToLanding}
            className="self-start sm:self-center px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold transition-all"
          >
            Exit to Portal
          </button>
        </div>

        {/* 7-Day Resume Token Pill */}
        {resumeToken && (
          <div className="mt-6 p-3.5 bg-black/30 border border-amber-400/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs backdrop-blur-xs">
            <div className="flex items-center space-x-2.5">
              <KeyRound className="h-4 w-4 text-amber-300 shrink-0" />
              <div>
                <span className="font-bold text-white">Your 7-Day Resume Token: </span>
                <code className="text-amber-300 font-mono font-bold tracking-wider">{resumeToken}</code>
              </div>
            </div>
            <button
              onClick={copyTokenToClipboard}
              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold transition-all cursor-pointer text-xs"
            >
              {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Stepper Progress */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between overflow-x-auto text-xs font-bold">
        {['School Identity', 'Patron', 'President', 'Secretary', 'Endorsement Letter', 'Review'].map((stepName, idx) => (
          <div key={stepName} className="flex items-center space-x-2 px-2 py-1 shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              currentStepIndex === idx
                ? 'bg-amber-600 text-white ring-4 ring-amber-100'
                : currentStepIndex > idx
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {currentStepIndex > idx ? '✓' : idx + 1}
            </div>
            <span className={currentStepIndex === idx ? 'text-amber-950 font-black' : 'text-gray-500 font-medium'}>
              {stepName}
            </span>
          </div>
        ))}
      </div>

      {/* Error Alert */}
      {stepError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5 animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{stepError}</span>
        </div>
      )}

      {/* Wizard Form Card */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm">
        {/* Step 0: Identity */}
        {currentStepIndex === 0 && (
          <form onSubmit={handleStartIdentity} className="space-y-4">
            <div className="border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Step 1: School Identity & Affiliation</h2>
              <p className="text-xs text-gray-500">Provide official school identification and affiliation data.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  School Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="e.g. Kendriya Vidyalaya IIT Kharagpur"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Affiliation Board <span className="text-rose-500">*</span>
                </label>
                <select
                  value={boardType}
                  onChange={(e) => setBoardType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="CBSE">Central Board of Secondary Education (CBSE)</option>
                  <option value="ICSE">CISCE (ICSE / ISC)</option>
                  <option value="State Board">State Secondary Education Board</option>
                  <option value="Kendriya Vidyalaya Sangathan">Kendriya Vidyalaya Sangathan (KVS)</option>
                  <option value="Navodaya Vidyalaya Samiti">Navodaya Vidyalaya Samiti (NVS)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  School Affiliation / Registration No. <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={affiliationCode}
                  onChange={(e) => setAffiliationCode(e.target.value)}
                  placeholder="e.g. CBSE-AFF-2430001"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Proposed Club Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="e.g. NDLI Reading Club KV Kharagpur"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  State / UT <span className="text-rose-500">*</span>
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  {INDIAN_STATES_AND_UTS.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  District <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={districtCode}
                  onChange={(e) => setDistrictCode(e.target.value)}
                  placeholder="e.g. Paschim Medinipur"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="py-3 px-6 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-md shadow-amber-950/20 disabled:opacity-60 flex items-center space-x-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Start the Wizard</span>}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* Steps 1-3: 3-Tier Authority Slots */}
        {currentStepIndex >= 1 && currentStepIndex <= 3 && (() => {
          const authorityConfig = SCHOOL_AUTHORITY_STEPS[currentStepIndex - 1];
          const role = authorityConfig.role;
          const authData = authorities[role];

          return (
            <div className="space-y-4">
              <div className="border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center space-x-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                  <span>Step {currentStepIndex + 1} of 6</span>
                  <span>&bull;</span>
                  <span>3-Tier Quorum</span>
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 mt-0.5">
                  Authority Post: {authorityConfig.label}
                </h2>
                <p className="text-xs text-gray-500">{authorityConfig.desc}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={authData.fullName}
                    onChange={(e) => setAuthorities(prev => ({
                      ...prev,
                      [role]: { ...prev[role], fullName: e.target.value }
                    }))}
                    placeholder="e.g. Sri Rameshwar Prasad"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Official Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        value={authData.email}
                        onChange={(e) => setAuthorities(prev => ({
                          ...prev,
                          [role]: { ...prev[role], email: e.target.value, checked: false }
                        }))}
                        placeholder="e.g. principal@kvkharagpur.edu.in"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={emailCheckBusy || !authData.email.trim()}
                      onClick={() => handleCheckEmail(role)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                        authData.checked
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-600 text-white hover:bg-amber-700'
                      }`}
                    >
                      {emailCheckBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : authData.checked ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          <span>Verified</span>
                        </>
                      ) : (
                        <span>Check Registry</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Contact Phone <span className="text-gray-400 font-normal">(10-digit Indian Mobile)</span>
                    </label>
                    <input
                      type="tel"
                      value={authData.phone}
                      onChange={(e) => setAuthorities(prev => ({
                        ...prev,
                        [role]: { ...prev[role], phone: e.target.value }
                      }))}
                      placeholder="9800000001"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Designation / Role in School <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={authData.designation}
                      onChange={(e) => setAuthorities(prev => ({
                        ...prev,
                        [role]: { ...prev[role], designation: e.target.value }
                      }))}
                      placeholder="e.g. Principal / PGT English / Librarian"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCurrentStepIndex(prev => prev - 1)}
                  className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSaveAuthority(role)}
                  className="py-2.5 px-6 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-950/20 disabled:opacity-60 flex items-center space-x-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Save & Continue</span>}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Step 4: Supporting Letterhead Document */}
        {currentStepIndex === 4 && (
          <div className="space-y-4">
            <div className="border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Step 5: Official Supporting Document</h2>
              <p className="text-xs text-gray-500">
                Upload official school letterhead pad signed and stamped by the Headmaster / Principal endorsing the club authorities.
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-gray-50/50 hover:bg-amber-50/30 hover:border-amber-400 transition-colors">
              <Upload className="h-10 w-10 text-amber-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-800 mb-1">
                Upload Signed Endorsement Letter
              </p>
              <p className="text-xs text-gray-500 mb-4">
                PDF or JPEG format &bull; Maximum size: 300 KB
              </p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setDocumentFile(e.target.files[0]);
                  }
                }}
                className="hidden"
                id="school-letterhead-upload-input"
              />
              <label
                htmlFor="school-letterhead-upload-input"
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-all"
              >
                Select File
              </label>
              {documentFile && (
                <div className="mt-4 p-2 bg-amber-100 text-amber-900 rounded-xl text-xs font-bold inline-flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-700" />
                  <span>{documentFile.name} ({(documentFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(prev => prev - 1)}
                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={busy || !documentFile}
                onClick={handleUploadDocument}
                className="py-2.5 px-6 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-950/20 disabled:opacity-60 flex items-center space-x-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Upload & Proceed to Review</span>}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {currentStepIndex === 5 && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-gray-900">Step 6: Review & Final Submission</h2>
              <p className="text-xs text-gray-500">
                Confirm school credentials before routing to the IIT Kharagpur Zonal Officer.
              </p>
            </div>

            <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200 space-y-3 text-xs">
              <div className="flex justify-between border-b border-amber-100 pb-2">
                <span className="font-bold text-amber-900">School Name:</span>
                <span className="font-medium text-gray-800">{institutionName}</span>
              </div>
              <div className="flex justify-between border-b border-amber-100 pb-2">
                <span className="font-bold text-amber-900">Board / Affiliation:</span>
                <span className="font-medium text-gray-800">{boardType} ({affiliationCode})</span>
              </div>
              <div className="flex justify-between border-b border-amber-100 pb-2">
                <span className="font-bold text-amber-900">Club Name:</span>
                <span className="font-medium text-gray-800">{clubName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-amber-900">State / Zone:</span>
                <span className="font-medium text-gray-800">{selectedStateObj?.name} (Zone: {zoneCode})</span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Configured 3-Tier Quorum</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {SCHOOL_AUTHORITY_STEPS.map(({ role, label }) => (
                  <div key={role} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="font-bold text-amber-800">{label}:</span>{' '}
                    <span className="font-medium text-gray-900">{authorities[role].fullName || 'Configured'}</span>
                    <div className="text-[11px] text-gray-500">{authorities[role].email}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStepIndex(prev => prev - 1)}
                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleFinalSubmit}
                className="py-3 px-8 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-amber-950/20 disabled:opacity-60 flex items-center space-x-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Submit Official Charter Application</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* De-Duplication Confirmation Modal */}
      {conflictModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-amber-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-5 text-white">
              <h3 className="text-base font-bold">Authority Email Conflict Detected</h3>
              <p className="text-xs text-amber-100 mt-0.5">National Club Governance & Succession Cascading</p>
            </div>
            <div className="p-6 space-y-4 text-xs text-gray-700">
              <p className="font-semibold text-gray-900 leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-200">
                {conflictModalData.info.message}
              </p>
              <p className="leading-relaxed">
                Clicking <span className="font-bold text-amber-800">"YES"</span> will safely deactivate the previous appointment, notify the remaining authorities of that institution, and mark that post for replacement.
              </p>
              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConflictModalData(null)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-all"
                >
                  NO, Enter Different Email
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmDeactivation}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-md shadow-amber-950/20"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'YES, Deactivate Old Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
