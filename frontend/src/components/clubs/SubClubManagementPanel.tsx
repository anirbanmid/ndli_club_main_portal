import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layers, 
  UserCheck, 
  Mail, 
  Phone
} from 'lucide-react';
import { SubClub, fetchSubClubs, createSubClub } from '../../lib/campusApi';

interface SubClubManagementPanelProps {
  clubCode: string;
  clubName: string;
  isAuthority: boolean;
}

export const SubClubManagementPanel: React.FC<SubClubManagementPanelProps> = ({
  clubCode,
  clubName,
  isAuthority,
}) => {
  const [subClubs, setSubClubs] = useState<SubClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal / Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [coordName, setCoordName] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [coordPhone, setCoordPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSubClubs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchSubClubs(clubCode);
      setSubClubs(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch sub-clubs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubClubs();
  }, [clubCode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !discipline.trim() || !coordName.trim() || !coordEmail.trim()) {
      setErrorMsg('Please complete all mandatory fields.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await createSubClub(clubCode, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        discipline: discipline.trim(),
        coordinator_name: coordName.trim(),
        coordinator_email: coordEmail.trim(),
        coordinator_phone: coordPhone.trim() || undefined,
      });
      setSubClubs(prev => [created, ...prev]);
      setSuccessMsg(`Sub-Club "${created.name}" created successfully. It is active immediately without central approval.`);
      setName('');
      setCode('');
      setDiscipline('');
      setCoordName('');
      setCoordEmail('');
      setCoordPhone('');
      setIsCreateOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create sub-club.');
    } finally {
      setBusy(false);
    }
  };

  // SSOT 1 + N calculation
  const totalClubsCount = 1 + subClubs.filter(s => s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Overview & KPI Header */}
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-[#103125] p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-emerald-800/40 border border-emerald-700/50 px-3 py-1 rounded-full text-xs font-bold text-emerald-300">
              <Layers className="h-3.5 w-3.5" />
              <span>HEI Federated Architecture ($1+N$)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Disciplinary Sub-Clubs
            </h2>
            <p className="text-xs text-emerald-200/90 max-w-xl">
              Main Club authorities may establish departmental sub-clubs directly without central approval. Sub-club coordinators approve certificates and moderate their members.
            </p>
          </div>

          {/* SSOT 1 + N Card */}
          <div className="bg-white/10 backdrop-blur-xs border border-white/20 p-4 rounded-2xl flex items-center space-x-4 self-start sm:self-auto shrink-0">
            <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-300 border border-emerald-400/30">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                Total Chartered Units
              </div>
              <div className="text-2xl font-black text-white flex items-center space-x-2">
                <span>{totalClubsCount}</span>
                <span className="text-xs font-normal text-emerald-200/70">
                  (1 Main + {subClubs.filter(s => s.is_active).length} Sub-Clubs)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {isAuthority && (
          <div className="mt-6 pt-4 border-t border-emerald-800/60 flex justify-end">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Form New Sub-Club</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-semibold flex items-start space-x-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sub-Clubs Grid */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="text-xs font-medium">Loading sub-clubs...</span>
        </div>
      ) : subClubs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
            <Layers className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900">No Sub-Clubs Formed Yet</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            All active students belong to the Main Club. Main Club authorities can create departmental units like Robotics, Cultural, or Chemistry.
          </p>
          {isAuthority && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center space-x-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Form First Sub-Club</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subClubs.map((sub) => (
            <div
              key={sub.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-all space-y-3 relative group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                      {sub.code}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">{sub.discipline}</span>
                  </div>
                  <h4 className="text-base font-bold text-gray-900 leading-tight">{sub.name}</h4>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                  sub.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {sub.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Coordinator Information */}
              <div className="p-3 bg-gray-50 rounded-xl space-y-1.5 text-xs text-gray-600 border border-gray-100">
                <div className="flex items-center space-x-2 text-gray-900 font-semibold">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{sub.coordinator_name}</span>
                  <span className="text-[10px] text-gray-400 font-normal">(Coordinator)</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-gray-500">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span className="truncate">{sub.coordinator_email}</span>
                </div>
                {sub.coordinator_phone && (
                  <div className="flex items-center space-x-2 text-[11px] text-gray-500">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <span>{sub.coordinator_phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                <span>Unit of {clubName}</span>
                <span className="font-semibold text-emerald-700">No Central Approval Needed</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Sub-Club Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white">
              <h3 className="text-xl font-bold">Form Disciplinary Sub-Club</h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Chartered directly by Main Club Authorities
              </p>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Sub-Club Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Robotics & Automation Society"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Sub-Club Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ROBO"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Discipline / Field <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    placeholder="e.g. Engineering"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2">
                  Assigned Sub-Club Coordinator
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Coordinator Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={coordName}
                      onChange={(e) => setCoordName(e.target.value)}
                      placeholder="e.g. Dr. A. Sengupta"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Coordinator Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={coordEmail}
                        onChange={(e) => setCoordEmail(e.target.value)}
                        placeholder="coordinator@inst.edu"
                        required
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Phone <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={coordPhone}
                        onChange={(e) => setCoordPhone(e.target.value)}
                        placeholder="9800000000"
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Form Sub-Club</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
