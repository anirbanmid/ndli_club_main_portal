import React, { useState, useEffect } from 'react';
import { 
  School as SchoolIcon, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Printer, 
  Users,
  Search,
  Check,
  X as XIcon,
} from 'lucide-react';
import { 
  uploadSchoolRoster, 
  fetchSchoolCards, 
  fetchSchoolRosterPending,
  approveSchoolRoster,
  rejectSchoolRoster,
  SchoolStudentCard, 
  SchoolRosterUploadResult,
  SchoolRosterPendingEntry,
} from '../../lib/campusApi';
import { SchoolMembershipCardPrintModal } from './SchoolMembershipCardPrintModal';

interface SchoolBulkUploadPanelProps {
  clubCode: string;
  schoolName: string;
  isAuthority: boolean;
}

export const SchoolBulkUploadPanel: React.FC<SchoolBulkUploadPanelProps> = ({
  clubCode,
  schoolName,
  isAuthority,
}) => {
  const [cards, setCards] = useState<SchoolStudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<SchoolRosterUploadResult | null>(null);

  // Pending Approval State
  const [pendingEntries, setPendingEntries] = useState<SchoolRosterPendingEntry[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<number[]>([]);
  const [decisionBusy, setDecisionBusy] = useState(false);

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedGender, setSelectedGender] = useState('All');
  const [selectedBatchYear, setSelectedBatchYear] = useState('All');

  // Print Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const loadCards = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchSchoolCards(clubCode);
      setCards(data.cards || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch school student roster.');
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const data = await fetchSchoolRosterPending(clubCode);
      setPendingEntries(data.entries);
      setSelectedPendingIds([]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch pending school roster.');
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
    loadPending();
  }, [clubCode]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a CSV file to upload.');
      return;
    }

    setUploadBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await uploadSchoolRoster(clubCode, selectedFile);
      setUploadResult(result);
      setSuccessMsg(`Successfully staged ${result.created_count} students for approval.`);
      setSelectedFile(null);
      await loadCards();
      await loadPending();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process school roster CSV.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDownloadSampleCSV = () => {
    const csvContent =
      'Full Name,Gender,Class,Section,Guardian Phone\n' +
      'Aarav Sharma,Male,IX,A,9876543210\n' +
      'Ananya Sen,Female,IX,B,9876543211\n' +
      'Rohit Patel,Male,X,A,9876543212\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NDLI_School_Roster_Sample_${clubCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePendingSelection = (id: number) => {
    setSelectedPendingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAllPending = () => {
    const allIds = pendingEntries.map((e) => e.id);
    if (selectedPendingIds.length === allIds.length && allIds.length > 0) {
      setSelectedPendingIds([]);
    } else {
      setSelectedPendingIds(allIds);
    }
  };

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (selectedPendingIds.length === 0) {
      setErrorMsg('Please select at least one pending student.');
      return;
    }

    setDecisionBusy(true);
    setErrorMsg(null);

    try {
      const result =
        action === 'approve'
          ? await approveSchoolRoster(clubCode, selectedPendingIds)
          : await rejectSchoolRoster(clubCode, selectedPendingIds);
      setSuccessMsg(result.detail);
      setSelectedPendingIds([]);
      await loadCards();
      await loadPending();
    } catch (err: any) {
      setErrorMsg(err.message || `Failed to ${action} selected students.`);
    } finally {
      setDecisionBusy(false);
    }
  };

  const classes = ['All', ...Array.from(new Set(cards.map(c => c.student_class))).sort()];
  const genders = ['All', ...Array.from(new Set(cards.map(c => c.gender))).sort()];
  const batchYears = [
    'All',
    ...Array.from(new Set(cards.map(c => c.batch_year)))
      .sort((a, b) => Number(a) - Number(b)),
  ];

  const filteredCards = cards.filter(c => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.student_uid.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClass === 'All' || c.student_class === selectedClass;
    const matchesGender = selectedGender === 'All' || c.gender === selectedGender;
    const matchesBatchYear =
      selectedBatchYear === 'All' || String(c.batch_year) === selectedBatchYear;
    return matchesSearch && matchesClass && matchesGender && matchesBatchYear;
  });

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-br from-[#1E3A2F] via-[#2D5A46] to-[#174332] p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-amber-400/20 border border-amber-300/30 px-3 py-1 rounded-full text-xs font-bold text-amber-300">
              <SchoolIcon className="h-3.5 w-3.5" />
              <span>Offline-First Tangible Identity Architecture</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              School Student Membership Desk
            </h2>
            <p className="text-xs text-emerald-100/90 max-w-xl">
              Strictly DPDP Act 2023 compliant. School students do not create personal accounts or passwords. Identities are tangibly managed via deterministic UIDs (<code className="text-amber-300 font-mono">SCH-[State]-[Club]-[Class]-[Serial]</code>) and printable A4 cards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadSampleCSV}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
              <span>Sample CSV</span>
            </button>
            {cards.length > 0 && (
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print A4 Cards ({cards.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSV Bulk Upload Dropzone (For Authorities) */}
      {isAuthority && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Bulk CSV Member Ingestion</h3>
              <p className="text-xs text-gray-500">
                Upload CSV containing: <span className="font-mono text-emerald-800 font-bold">Full Name, Gender, Class, Section, Guardian Phone (optional)</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 hover:border-amber-500 rounded-2xl p-6 text-center bg-gray-50/50 transition-colors">
              <Upload className="h-8 w-8 text-amber-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-800 mb-1">
                Select or Drop Student Roster CSV
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
                className="hidden"
                id="school-csv-file"
              />
              <label
                htmlFor="school-csv-file"
                className="inline-flex items-center px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs"
              >
                Choose File
              </label>
              {selectedFile && (
                <div className="mt-3 text-xs font-bold text-emerald-800 bg-emerald-50 py-1.5 px-3 rounded-lg inline-block border border-emerald-200">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={uploadBusy || !selectedFile}
                className="px-6 py-2.5 bg-gradient-to-r from-[#1E3A2F] to-[#2D5A46] text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-950/20 disabled:opacity-50 flex items-center space-x-2"
              >
                {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Ingest & Generate Deterministic UIDs</span>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-semibold flex items-start space-x-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Pending Approval (Authority Review) */}
      {isAuthority && pendingEntries.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-3">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-amber-700" />
              <h3 className="text-base font-bold text-gray-900">
                Pending Authority Approval ({pendingEntries.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center space-x-2 text-xs font-bold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    selectedPendingIds.length === pendingEntries.length &&
                    pendingEntries.length > 0
                  }
                  onChange={toggleSelectAllPending}
                  className="w-3.5 h-3.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                />
                Select All
              </label>
              <button
                onClick={() => handleDecision('approve')}
                disabled={decisionBusy || selectedPendingIds.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center space-x-1.5"
              >
                {decisionBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Approve Selected</span>
              </button>
              <button
                onClick={() => handleDecision('reject')}
                disabled={decisionBusy || selectedPendingIds.length === 0}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center space-x-1.5"
              >
                {decisionBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XIcon className="h-3.5 w-3.5" />
                )}
                <span>Reject Selected</span>
              </button>
            </div>
          </div>

          {pendingLoading ? (
            <div className="p-10 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
              <span className="text-xs font-medium">Loading pending entries...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-50 text-amber-700 uppercase tracking-wider font-bold border-y border-amber-100">
                  <tr>
                    <th className="py-3 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedPendingIds.length === pendingEntries.length &&
                          pendingEntries.length > 0
                        }
                        onChange={toggleSelectAllPending}
                        className="w-3.5 h-3.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                      />
                    </th>
                    <th className="py-3 px-4">Deterministic UID</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Class & Section</th>
                    <th className="py-3 px-4">Gender</th>
                    <th className="py-3 px-4">Batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50 font-medium text-gray-800">
                  {pendingEntries.map((entry) => (
                    <tr
                      key={entry.student_uid}
                      className="hover:bg-amber-50/30 transition-colors"
                    >
                      <td className="py-3 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedPendingIds.includes(entry.id)}
                          onChange={() => togglePendingSelection(entry.id)}
                          className="w-3.5 h-3.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-950">
                        {entry.student_uid}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        {entry.full_name}
                      </td>
                      <td className="py-3 px-4">
                        Class {entry.student_class} - {entry.section}
                      </td>
                      <td className="py-3 px-4">{entry.gender}</td>
                      <td className="py-3 px-4 font-mono">{entry.batch_year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-amber-600 text-center">
            Staged students are NOT visible as members until explicitly approved.
            Approved students appear in Enrolled School Members and are eligible for
            printable cards.
          </p>
        </div>
      )}

      {/* Roster Table with Filters */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-emerald-800" />
            <h3 className="text-base font-bold text-gray-900">
              Enrolled School Members ({cards.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name or UID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 w-44"
              />
            </div>

            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="py-1.5 px-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none font-medium text-gray-700"
            >
              {classes.map(c => (
                <option key={c} value={c}>Class: {c}</option>
              ))}
            </select>

            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="py-1.5 px-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none font-medium text-gray-700"
            >
              {genders.map(g => (
                <option key={g} value={g}>Gender: {g}</option>
              ))}
            </select>

            <select
              value={selectedBatchYear}
              onChange={(e) => setSelectedBatchYear(e.target.value)}
              className="py-1.5 px-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none font-medium text-gray-700"
            >
              {batchYears.map(y => (
                <option key={y} value={y}>Batch: {y}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            <span className="text-xs font-medium">Loading roster...</span>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No school students found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-bold border-y border-gray-100">
                <tr>
                  <th className="py-3 px-4">Deterministic UID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Class & Section</th>
                  <th className="py-3 px-4">Gender</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredCards.map((student) => (
                  <tr key={student.student_uid} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-950">
                      {student.student_uid}
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">{student.full_name}</td>
                    <td className="py-3 px-4">
                      Class {student.student_class} - {student.section}
                    </td>
                    <td className="py-3 px-4">{student.gender}</td>
                    <td className="py-3 px-4 font-mono">{student.batch_year}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Tangible ID Issued
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Modal */}
      <SchoolMembershipCardPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        cards={cards}
        schoolName={schoolName}
      />
    </div>
  );
};
