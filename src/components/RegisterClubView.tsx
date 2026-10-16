import React, { useState } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  UserCheck, 
  KeyRound, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft,
  Sparkles,
  Download,
  AlertCircle
} from 'lucide-react';
import { InstituteClub } from '../types';
import { downloadOfficialCharterDoc } from '../utils/charterGenerator';

interface RegisterClubViewProps {
  onClubRegistered: (newClub: InstituteClub) => void;
  onExploreClubs: () => void;
}

export const RegisterClubView: React.FC<RegisterClubViewProps> = ({
  onClubRegistered,
  onExploreClubs
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formError, setFormError] = useState<string>('');

  // Form State
  const [aisheCode, setAisheCode] = useState('');
  const [instituteName, setInstituteName] = useState('');
  const [state, setState] = useState('West Bengal');
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState<'University' | 'College' | 'Autonomous Institute' | 'School'>('College');

  // 4 Authorities State
  const [patronName, setPatronName] = useState('');
  const [patronEmail, setPatronEmail] = useState('');
  const [patronPhone, setPatronPhone] = useState('');

  const [presidentName, setPresidentName] = useState('');
  const [presidentEmail, setPresidentEmail] = useState('');
  const [presidentPhone, setPresidentPhone] = useState('');

  const [secretaryName, setSecretaryName] = useState('');
  const [secretaryEmail, setSecretaryEmail] = useState('');
  const [secretaryPhone, setSecretaryPhone] = useState('');

  const [executiveName, setExecutiveName] = useState('');
  const [executiveEmail, setExecutiveEmail] = useState('');
  const [executivePhone, setExecutivePhone] = useState('');

  // Generated Result
  const [generatedClub, setGeneratedClub] = useState<InstituteClub | null>(null);
  const [isDownloadingCharter, setIsDownloadingCharter] = useState(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState(false);

  // Auto-fill demo helper using RFC 2606 safe example domains
  const handleAutoFillDemo = () => {
    setFormError('');
    setAisheCode('C-41295');
    setInstituteName('National Demonstration Institute, Kolkata');
    setState('West Bengal');
    setDistrict('Kolkata');
    setCategory('University');

    setPatronName('Prof. A. K. Banerjee');
    setPatronEmail('patron@demo-institute.example.edu');
    setPatronPhone('+91 9800000001');

    setPresidentName('Dr. S. K. Das');
    setPresidentEmail('president@demo-institute.example.edu');
    setPresidentPhone('+91 9800000002');

    setSecretaryName('Dr. M. Chakraborty');
    setSecretaryEmail('secretary@demo-institute.example.edu');
    setSecretaryPhone('+91 9800000003');

    setExecutiveName('Ritwika Roy');
    setExecutiveEmail('student.rep@demo-institute.example.edu');
    setExecutivePhone('+91 9800000004');
  };

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!aisheCode || !instituteName || !district) {
      setFormError('Please fill in all mandatory institutional fields.');
      return;
    }
    setStep(2);
  };


  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!patronName || !presidentName || !secretaryName || !executiveName) {
      setFormError('Please complete details for all 4 institutional authorities.');
      return;
    }


    // Generate unique Passkey and Registration ID
    const cleanPrefix = instituteName
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 4)
      .toUpperCase();
    const randomPin = Math.floor(1000 + Math.random() * 9000);
    const passkey = `${cleanPrefix}-NDL-${randomPin}`;
    const clubId = `CLUB-${cleanPrefix}-${randomPin}`;

    const newClub: InstituteClub = {
      id: clubId,
      aisheCode,
      name: instituteName,
      state,
      district,
      zone: (['Delhi', 'Uttar Pradesh', 'Punjab', 'Haryana', 'J&K', 'Himachal Pradesh'].includes(state) ? 'North' :
             ['Maharashtra', 'Gujarat', 'Rajasthan', 'Goa'].includes(state) ? 'West' :
             ['Tamil Nadu', 'Kerala', 'Puducherry', 'Karnataka', 'Telangana', 'Andhra Pradesh'].includes(state) ? 'South' :
             ['Madhya Pradesh', 'Chhattisgarh'].includes(state) ? 'Central' :
             ['Assam', 'Meghalaya', 'Manipur', 'Tripura'].includes(state) ? 'North East' : 'East') as any,
      category,
      passkey,

      status: 'Active',
      memberCount: 1, // starting count
      eventsConducted: 0,
      establishedDate: new Date().toISOString().split('T')[0],
      authorities: [
        { role: 'Patron', name: patronName, designation: 'Principal / VC', email: patronEmail, phone: patronPhone, verified: true },
        { role: 'President', name: presidentName, designation: 'Faculty / Librarian', email: presidentEmail, phone: presidentPhone, verified: true },
        { role: 'Secretary', name: secretaryName, designation: 'Faculty Coordinator', email: secretaryEmail, phone: secretaryPhone, verified: true },
        { role: 'Executive Member', name: executiveName, designation: 'Student Council Lead', email: executiveEmail, phone: executivePhone, verified: true },
      ]
    };

    setGeneratedClub(newClub);
    onClubRegistered(newClub);
    setStep(3);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Title & Process Indicator */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 bg-blue-50 border border-blue-200 text-blue-700 px-3.5 py-1 rounded-full text-xs font-bold">
          <Building2 className="h-4 w-4" />
          <span>Official Institutional Onboarding</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Register an Official NDLI Club Chapter
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
          Establish an authorized learning chapter under the National Digital Library of India framework (IIT Kharagpur & Ministry of Education).
        </p>

        {/* Stepper tracker */}
        <div className="flex items-center justify-center space-x-3 pt-4">
          <div className={`flex items-center space-x-2 text-xs font-bold ${step >= 1 ? 'text-blue-700' : 'text-slate-400'}`}>
            <span className={`h-6 w-6 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              1
            </span>
            <span>Institute Details</span>
          </div>

          <div className="h-0.5 w-10 bg-slate-200"></div>

          <div className={`flex items-center space-x-2 text-xs font-bold ${step >= 2 ? 'text-blue-700' : 'text-slate-400'}`}>
            <span className={`h-6 w-6 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              2
            </span>
            <span>4 Key Authorities</span>
          </div>

          <div className="h-0.5 w-10 bg-slate-200"></div>

          <div className={`flex items-center space-x-2 text-xs font-bold ${step === 3 ? 'text-emerald-700' : 'text-slate-400'}`}>
            <span className={`h-6 w-6 rounded-full flex items-center justify-center ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              3
            </span>
            <span>Charter & Passkey</span>
          </div>
        </div>
      </div>

      {/* Demo Autofill Banner */}
      {step < 3 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span><strong>Pitching Tip:</strong> Click autofill to populate genuine Indian university details instantly for demonstration.</span>
          </div>
          <button
            type="button"
            onClick={handleAutoFillDemo}
            className="px-3 py-1 rounded bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors shadow-xs"
          >
            Auto-fill Sample Data
          </button>
        </div>
      )}

      {/* Step 1: Institutional Details */}
      {step === 1 && (
        <form onSubmit={handleNextStep1} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <span>Step 1: Institutional Information & AISHE Verification</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">AISHE / College Code *</label>
              <input
                type="text"
                placeholder="e.g. U-0570 or C-41295"
                value={aisheCode}
                onChange={(e) => setAisheCode(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-500">Ministry of Education All India Survey on Higher Education Code</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Institution Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
              >
                <option value="University">University</option>
                <option value="College">Affiliated College</option>
                <option value="Autonomous Institute">Autonomous Institute / IIT / NIT</option>
                <option value="School">Higher Secondary School</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700">Official Full Name of the Institution *</label>
              <input
                type="text"
                placeholder="e.g. Presidency University, Kolkata"
                value={instituteName}
                onChange={(e) => setInstituteName(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">State *</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
              >
                {['West Bengal', 'Maharashtra', 'Delhi', 'Tamil Nadu', 'Karnataka', 'Telangana', 'Uttar Pradesh', 'Gujarat', 'Kerala', 'Rajasthan'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">District / City *</label>
              <input
                type="text"
                placeholder="e.g. Kolkata"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
              ⚠️ {formError}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md flex items-center space-x-2 transition-all"
            >
              <span>Continue to 4 Key Authorities</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {/* Step 2: 4 Key Authorities */}
      {step === 2 && (
        <form onSubmit={handleFinalSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <UserCheck className="h-5 w-5 text-blue-600" />
              <span>Step 2: Mandatory 4-Tier Institutional Governance Quorum</span>
            </h2>
            <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-md">
              As mandated by NDLI IIT Kharagpur
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Patron */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-blue-900">1. Patron (Principal / VC / Director)</span>
                <span className="text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-bold">Authority 1</span>
              </div>
              <input
                type="text"
                placeholder="Full Name (e.g. Prof. Anuradha Lohia)"
                value={patronName}
                onChange={(e) => setPatronName(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="email"
                placeholder="Official Email (e.g. vc@presiuniv.ac.in)"
                value={patronEmail}
                onChange={(e) => setPatronEmail(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="tel"
                placeholder="Mobile / Office Contact"
                value={patronPhone}
                onChange={(e) => setPatronPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>

            {/* 2. President */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-800">2. President (Librarian / Faculty)</span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold">Authority 2</span>
              </div>
              <input
                type="text"
                placeholder="Full Name (e.g. Dr. Subarna Kumar Das)"
                value={presidentName}
                onChange={(e) => setPresidentName(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="email"
                placeholder="Official Email (e.g. librarian@presiuniv.ac.in)"
                value={presidentEmail}
                onChange={(e) => setPresidentEmail(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="tel"
                placeholder="Mobile Contact"
                value={presidentPhone}
                onChange={(e) => setPresidentPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>

            {/* 3. Secretary */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-800">3. Secretary (Faculty / NSS)</span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold">Authority 3</span>
              </div>
              <input
                type="text"
                placeholder="Full Name (e.g. Dr. Arindam Chakraborty)"
                value={secretaryName}
                onChange={(e) => setSecretaryName(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="email"
                placeholder="Official Email"
                value={secretaryEmail}
                onChange={(e) => setSecretaryEmail(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="tel"
                placeholder="Mobile Contact"
                value={secretaryPhone}
                onChange={(e) => setSecretaryPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>

            {/* 4. Executive Member */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-800">4. Executive Member (Student Rep)</span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold">Authority 4</span>
              </div>
              <input
                type="text"
                placeholder="Full Name (e.g. Ritwika Roy)"
                value={executiveName}
                onChange={(e) => setExecutiveName(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="email"
                placeholder="Student Email (e.g. ritwika.r@presiuniv.ac.in)"
                value={executiveEmail}
                onChange={(e) => setExecutiveEmail(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="tel"
                placeholder="Mobile Contact"
                value={executivePhone}
                onChange={(e) => setExecutivePhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
              ⚠️ {formError}
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setStep(1);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Step 1</span>
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center space-x-2 transition-all"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Submit & Generate Club Passkey</span>
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Charter & Passkey Success Screen */}
      {step === 3 && generatedClub && (
        <div className="bg-white p-8 rounded-2xl border border-emerald-200 shadow-xl space-y-8 animate-in fade-in">
          <div className="text-center space-y-3">
            <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              NDLI Club Registration Successful
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Welcome to the NDLI Club Network!
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
              {generatedClub.name} is now officially chartered under IIT Kharagpur and Ministry of Education, Government of India.
            </p>
          </div>

          {/* Passkey Display Box */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-lg border border-blue-800">
            <div className="flex items-center justify-center space-x-2 text-blue-300 text-xs font-semibold">
              <KeyRound className="h-4 w-4 text-amber-400" />
              <span>OFFICIAL INSTITUTIONAL PASSKEY</span>
            </div>
            
            <div className="text-3xl sm:text-5xl font-mono font-black tracking-widest text-amber-300 bg-black/30 py-3 px-6 rounded-xl border border-amber-400/30 inline-block shadow-inner">
              {generatedClub.passkey}
            </div>

            <p className="text-xs text-blue-200 max-w-md mx-auto">
              Share this passkey with your students, faculty, and scholars. They will enter this key to instantly link their NDLI account to your campus chapter.
            </p>
          </div>

          {/* Club Details Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="text-slate-400 font-semibold uppercase">Club ID</div>
              <div className="font-mono font-bold text-slate-800">{generatedClub.id}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="text-slate-400 font-semibold uppercase">AISHE Code</div>
              <div className="font-mono font-bold text-slate-800">{generatedClub.aisheCode}</div>
            </div>
          </div>

          {downloadSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 text-xs text-emerald-900 text-center space-y-1">
              <div className="font-bold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Official Charter Downloaded Successfully to your computer!</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                A copy was saved to your Downloads folder and the Print/Save-as-PDF window was launched. 
                <span className="block font-semibold mt-0.5 text-slate-600">
                  (Safe Prototype Mode: Stored purely in browser memory — no network emails are ever transmitted)
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4 pt-4 border-t border-slate-100">
            <button
              onClick={onExploreClubs}
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all"
            >
              View in National Directory
            </button>
            <button
              disabled={isDownloadingCharter}
              onClick={async () => {
                if (!generatedClub) return;
                setIsDownloadingCharter(true);
                try {
                  await downloadOfficialCharterDoc(generatedClub);
                  setDownloadSuccessMessage(true);
                } catch (err) {
                  console.error(err);
                } finally {
                  setIsDownloadingCharter(false);
                }
              }}
              className="px-6 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center space-x-2 transition-all shadow-xs"
            >
              <Download className="h-4 w-4 text-blue-600" />
              <span>{isDownloadingCharter ? 'Generating Charter...' : 'Download Official Charter Document (PDF/HTML)'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

