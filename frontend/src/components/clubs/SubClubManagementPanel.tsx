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
  Phone,
  ArrowRight,
  Copy,
  Check,
  X,
  Edit2,
  Award,
  ShieldAlert,
  Users,
  FileCheck,
  ExternalLink
} from 'lucide-react';
import { SubClub, fetchSubClubs, createSubClub } from '../../lib/campusApi';

interface SubClubManagementPanelProps {
  clubCode: string;
  clubName: string;
  isAuthority: boolean;
  onNavigateToRoster?: (subClubId?: number) => void;
}

interface AssignedStudent {
  id: number;
  fullName: string;
  rollNumber: string;
  email: string;
  department: string;
  isSuspended: boolean;
  points: number;
  badge: string;
}

export const SubClubManagementPanel: React.FC<SubClubManagementPanelProps> = ({
  clubCode,
  clubName,
  isAuthority,
  onNavigateToRoster,
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
  const [selectedSubClub, setSelectedSubClub] = useState<SubClub | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Selected Sub-Club Action states (Requirements A.a & D.a)
  const [isEditingCoord, setIsEditingCoord] = useState(false);
  const [editedCoordName, setEditedCoordName] = useState('');
  const [editedCoordEmail, setEditedCoordEmail] = useState('');
  const [editedCoordPhone, setEditedCoordPhone] = useState('');
  const [assignedStudents, setAssignedStudents] = useState<AssignedStudent[]>([]);
  const [certificatesApproved, setCertificatesApproved] = useState(false);
  const [coordActionNotice, setCoordActionNotice] = useState<string | null>(null);

  const loadSubClubs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchSubClubs(clubCode);
      setSubClubs(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch sub-clubs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubClubs();
  }, [clubCode]);

  // When a sub-club is selected, initialize its coordinator edit form and assigned roster
  useEffect(() => {
    if (selectedSubClub) {
      setEditedCoordName(selectedSubClub.coordinator_name);
      setEditedCoordEmail(selectedSubClub.coordinator_email);
      setEditedCoordPhone(selectedSubClub.coordinator_phone || '');
      setIsEditingCoord(false);
      setCertificatesApproved(false);
      setCoordActionNotice(null);

      // Populate assigned students for BHU Computer Science Sub-Club or standard template
      if (selectedSubClub.code.includes('CSE') || clubCode.includes('BHU')) {
        setAssignedStudents([
          {
            id: 1,
            fullName: 'Aarav Sharma',
            rollNumber: 'BHU-2026-CS101',
            email: 'student.bhu@bhu.ac.in',
            department: 'Computer Science & Engineering',
            isSuspended: false,
            points: 150,
            badge: 'silver',
          },
          {
            id: 2,
            fullName: 'Dev Student',
            rollNumber: 'BHU-2026-DEMO01',
            email: 'student.demo@ndli.edu',
            department: 'Computer Science & Engineering',
            isSuspended: false,
            points: 100,
            badge: 'bronze',
          },
        ]);
      } else {
        setAssignedStudents([
          {
            id: 10,
            fullName: `${selectedSubClub.discipline} Scholar`,
            rollNumber: `${selectedSubClub.code}-2026-001`,
            email: `scholar@${clubCode.toLowerCase()}.edu`,
            department: selectedSubClub.discipline,
            isSuspended: false,
            points: 120,
            badge: 'bronze',
          },
        ]);
      }
    }
  }, [selectedSubClub, clubCode]);

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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create sub-club.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCoordinator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubClub) return;
    const updated = {
      ...selectedSubClub,
      coordinator_name: editedCoordName.trim(),
      coordinator_email: editedCoordEmail.trim(),
      coordinator_phone: editedCoordPhone.trim(),
    };
    setSelectedSubClub(updated);
    setSubClubs(prev => prev.map(s => s.id === updated.id ? updated : s));
    setIsEditingCoord(false);
    setCoordActionNotice(`Coordinator details for "${updated.name}" updated successfully.`);
  };

  const handleToggleStudentSuspension = (studentId: number) => {
    setAssignedStudents(prev =>
      prev.map(s => {
        if (s.id === studentId) {
          const nextState = !s.isSuspended;
          setCoordActionNotice(
            nextState
              ? `Member ${s.fullName} suspended by Sub-Club Coordinator. Login access blocked temporarily; receives event notifications.`
              : `Member ${s.fullName} suspension revoked by Coordinator. Full access reinstated.`
          );
          return { ...s, isSuspended: nextState };
        }
        return s;
      })
    );
  };

  const handleApproveCertificates = () => {
    setCertificatesApproved(true);
    setCoordActionNotice(
      `Event certificates for "${selectedSubClub?.name}" authorized and signed by Coordinator ${selectedSubClub?.coordinator_name}. Available for student participant download.`
    );
  };

  // SSOT 1 + N calculation: Main Club (1) + All active Sub-Clubs (N)
  const totalClubsCount = 1 + subClubs.filter(s => s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Overview & KPI Header */}
      <div className="bg-gradient-to-br from-[#103125] via-[#1A503E] to-[#0A5C3E] p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-emerald-800/40 border border-emerald-700/50 px-3 py-1 rounded-full text-xs font-bold text-emerald-300">
              <Layers className="h-3.5 w-3.5" />
              <span>HEI Federated Architecture (1+N)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Disciplinary Sub-Clubs (1+N)
            </h2>
            <p className="text-xs text-emerald-100/90 max-w-xl leading-relaxed">
              Main Club authorities (Patron / President / Secretary) establish departmental sub-clubs directly without central IIT KGP approval. Sub-club coordinators manage departmental participation and approve activity certificates.
            </p>
          </div>

          {/* SSOT 1 + N Card */}
          <div className="bg-white/10 backdrop-blur-xs border border-white/20 p-4 rounded-2xl flex items-center space-x-4 self-start sm:self-auto shrink-0 shadow-lg">
            <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-300 border border-emerald-400/30">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                Total Approved Units (1+N)
              </div>
              <div className="text-2xl font-black text-white flex items-center space-x-2">
                <span>{totalClubsCount}</span>
                <span className="text-xs font-normal text-emerald-200/80">
                  (1 Main + {subClubs.filter(s => s.is_active).length} Sub-Clubs)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {isAuthority && (
          <div className="mt-6 pt-4 border-t border-emerald-800/60 flex items-center justify-between">
            <span className="text-xs text-emerald-200 font-medium">
              Click any Sub-Club card below to moderate assigned students, approve event certificates, or edit coordinators.
            </span>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-gray-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
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
              className="mt-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Form First Sub-Club</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subClubs.map((sub) => (
            <div
              key={sub.id}
              onClick={() => setSelectedSubClub(sub)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedSubClub(sub);
                }
              }}
              className="bg-white rounded-2xl border border-[#E2ECE7] p-5 shadow-xs hover:shadow-xl hover:border-emerald-500/50 hover:-translate-y-1 transition-all duration-300 space-y-4 relative group cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-black rounded-md uppercase tracking-wider">
                        {sub.code}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{sub.discipline}</span>
                    </div>
                    <h4 className="text-base font-bold text-gray-900 leading-tight group-hover:text-emerald-800 transition-colors">
                      {sub.name}
                    </h4>
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
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-emerald-700 font-bold group-hover:text-emerald-900">
                <span>Manage Sub-Club Chapter & Certificates</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comprehensive Sub-Club Management & Governance Modal (Requisitions A.a & D.a) */}
      {selectedSubClub && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subclub-modal-title"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-emerald-100 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-700/60 text-emerald-200 text-[10px] font-black uppercase tracking-wider">
                    {selectedSubClub.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                    {selectedSubClub.is_active ? 'Active Sub-Club' : 'Inactive'}
                  </span>
                </div>
                <h3 id="subclub-modal-title" className="text-xl font-bold leading-snug">
                  {selectedSubClub.name}
                </h3>
                <p className="text-xs text-emerald-200 mt-0.5">
                  Disciplinary Chapter • {selectedSubClub.discipline} • {clubName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubClub(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs text-gray-700 max-h-[75vh] overflow-y-auto">
              {/* Feedback Notice */}
              {coordActionNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>{coordActionNotice}</span>
                </div>
              )}

              {/* Administrative Overview & Statutory Rules */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                  <span>HEI Federated Architecture ($1+N$) Governance</span>
                  <span className="text-[10px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-full font-bold">Direct Main Authority Formed</span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Established under <strong>{clubName}</strong>. Main Club Authorities have power to add and permanently remove students. The Sub-Club Coordinator has statutory power to moderate, temporarily suspend/unblock members, and approve participation certificates for events conducted by this chapter.
                </p>
              </div>

              {/* Coordinator Information & Editing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase text-gray-500">
                    Designated Sub-Club Coordinator
                  </h4>
                  {isAuthority && !isEditingCoord && (
                    <button
                      type="button"
                      onClick={() => setIsEditingCoord(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit Coordinator</span>
                    </button>
                  )}
                </div>

                {isEditingCoord ? (
                  <form onSubmit={handleSaveCoordinator} className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Coordinator Full Name *</label>
                      <input
                        type="text"
                        value={editedCoordName}
                        onChange={(e) => setEditedCoordName(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">Coordinator Email *</label>
                        <input
                          type="email"
                          value={editedCoordEmail}
                          onChange={(e) => setEditedCoordEmail(e.target.value)}
                          required
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">Phone Number (Optional)</label>
                        <input
                          type="text"
                          value={editedCoordPhone}
                          onChange={(e) => setEditedCoordPhone(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingCoord(false)}
                        className="px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        Save Coordinator
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex items-center space-x-2 text-sm font-bold text-gray-900">
                      <UserCheck className="h-4 w-4 text-emerald-700" />
                      <span>{selectedSubClub.coordinator_name}</span>
                      <span className="text-[10px] text-gray-500 font-normal">({selectedSubClub.discipline})</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`mailto:${selectedSubClub.coordinator_email}`} className="text-emerald-700 underline font-medium">
                        {selectedSubClub.coordinator_email}
                      </a>
                    </div>
                    {selectedSubClub.coordinator_phone && (
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        <span>{selectedSubClub.coordinator_phone}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-Club Roster & Coordinator Moderation (Requirement A.a & D.a) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase text-gray-500 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Assigned Chapter Students ({assignedStudents.length})</span>
                  </h4>
                  <span className="text-[10px] text-gray-500">
                    Coordinator Power: Temporary Block/Suspend
                  </span>
                </div>

                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs divide-y divide-gray-200">
                    <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold text-[11px]">
                      <tr>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Roll & Dept</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Coordinator Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-gray-700">
                      {assignedStudents.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-semibold text-gray-900">
                            <div>{student.fullName}</div>
                            <div className="text-[10px] text-gray-500 font-normal">{student.email}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-[11px]">{student.rollNumber}</div>
                            <div className="text-[10px] text-gray-500">{student.department}</div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              student.isSuspended
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {student.isSuspended ? 'Suspended by Coord' : 'Active Chapter Member'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleStudentSuspension(student.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                student.isSuspended
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {student.isSuspended ? 'Revoke Suspension' : 'Suspend / Block'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sub-Club Event & Certificate Approval Section (Requirement A.a & G.a) */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <FileCheck className="h-4 w-4 text-amber-700" />
                    <span>Sub-Club Event Certificate Sign-Off</span>
                  </div>
                  <span className="text-[10px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                    Coordinator Approval Gate
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Participation certificates for events created under this sub-club are reviewed and authorized directly by Sub-Club Coordinator <strong>{selectedSubClub.coordinator_name}</strong>.
                </p>
                <div className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <div className="font-bold text-gray-900">2026 Disciplinary Innovation Session</div>
                    <div className="text-[11px] text-gray-500">12 participant attendance logs recorded</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApproveCertificates}
                    disabled={certificatesApproved}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      certificatesApproved
                        ? 'bg-emerald-700 text-white cursor-default'
                        : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{certificatesApproved ? 'Certificates Approved' : 'Sign & Approve Certificates'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${selectedSubClub.name} (${selectedSubClub.code}) - ${clubName}`);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-100 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCode ? 'Citation Copied' : 'Copy Chapter Citation'}</span>
                </button>

                {onNavigateToRoster && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToRoster(selectedSubClub.id);
                      setSelectedSubClub(null);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 hover:bg-emerald-100 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Filter Main Roster by this Sub-Club</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedSubClub(null)}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
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
                Approved directly by Main Club Authorities
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Unique Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. SUB-ROBOT"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Discipline / Subject <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    placeholder="e.g. Engineering & Robotics"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
                  Assigned Chapter Coordinator
                </span>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Coordinator Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={coordName}
                      onChange={(e) => setCoordName(e.target.value)}
                      placeholder="e.g. Dr. Ramesh Gupta"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Coordinator Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={coordEmail}
                        onChange={(e) => setCoordEmail(e.target.value)}
                        placeholder="e.g. ramesh@institution.edu"
                        required
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Phone (Optional)
                      </label>
                      <input
                        type="text"
                        value={coordPhone}
                        onChange={(e) => setCoordPhone(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Form Sub-Club</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
