import React, { useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Search,
} from 'lucide-react';
import { t } from '../../i18n';
import { uploadHEIBulkPreapproval, PreApprovalUploadResult } from '../../lib/campusApi';

interface HEIBulkPreapprovalPanelProps {
  clubCode: string;
  clubName: string;
  isAuthority: boolean;
}

export const HEIBulkPreapprovalPanel: React.FC<HEIBulkPreapprovalPanelProps> = ({
  clubCode,
  clubName,
  isAuthority,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<PreApprovalUploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a CSV file to upload.');
      return;
    }

    setUploadBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setUploadResult(null);

    try {
      const result = await uploadHEIBulkPreapproval(clubCode, selectedFile);
      setUploadResult(result);
      setSuccessMsg(
        `Successfully pre-approved ${result.created} student${
          result.created !== 1 ? 's' : ''
        }.`,
      );
      setSelectedFile(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process HEI pre-approval CSV.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDownloadSampleCSV = () => {
    const csvContent =
      'Full Name,Email ID\n' +
      'Aarav Sharma,aarav.sharma@bhu.ac.in\n' +
      'Diya Mukherjee,diya.mukherjee@iitkgp.ac.in\n' +
      'Rohan Verma,rohan.verma@du.ac.in\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NDLI_HEI_Preapproval_Sample_${clubCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-br from-[#103125] via-[#164433] to-[#0A5C3E] p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-amber-400/20 border border-amber-300/30 px-3 py-1 rounded-full text-xs font-bold text-amber-300">
              <Users className="h-3.5 w-3.5" />
              <span>Bulk Pre-Approval</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              HEI Bulk Member Pre-Approval
            </h2>
            <p className="text-xs text-emerald-100/90 max-w-xl">
              Upload a CSV with <code className="text-amber-300 font-mono">Full Name</code> and{' '}
              <code className="text-amber-300 font-mono">Email ID</code> columns to pre-approve
              students. Pre-approved students can join via passkey without further authority
              approval or email verification.
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
          </div>
        </div>
      </div>

      {/* CSV Bulk Upload Dropzone */}
      {isAuthority && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Bulk CSV Member Pre-Approval
              </h3>
              <p className="text-xs text-gray-500">
                Upload CSV containing: <span className="font-mono text-emerald-800 font-bold">
                  Full Name, Email ID
                </span>
              </p>
            </div>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 hover:border-amber-500 rounded-2xl p-6 text-center bg-gray-50/50 transition-colors">
              <Upload className="h-8 w-8 text-amber-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-800 mb-1">
                Select or Drop Student Pre-Approval CSV
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
                id="hei-preapproval-csv-file"
              />
              <label
                htmlFor="hei-preapproval-csv-file"
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
                className="px-6 py-2.5 bg-gradient-to-r from-[#103125] to-[#1A503E] text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-950/20 disabled:opacity-50 flex items-center space-x-2"
              >
                {uploadBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Pre-Approve &amp; Enroll Students</span>
                )}
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

      {/* Upload Result */}
      {uploadResult && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-emerald-800" />
              <h3 className="text-base font-bold text-gray-900">
                Pre-Approval Result
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {uploadResult.created} pre-approved
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">
                Pre-Approved
              </div>
              <div className="text-2xl font-extrabold text-gray-900">
                {uploadResult.created}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                students ready to join via passkey
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">
                Skipped
              </div>
              <div className="text-2xl font-extrabold text-amber-800">
                {uploadResult.skipped}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                rows with missing/invalid data
              </div>
            </div>
          </div>

          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-gray-900 mb-2">
                Errors ({uploadResult.errors.length})
              </h4>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 overflow-x-auto text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-red-200">
                      <th className="px-3 py-2 text-red-800 font-bold">Row</th>
                      <th className="px-3 py-2 text-red-800 font-bold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.errors.slice(0, 10).map((err, i) => (
                      <tr key={i} className="border-b border-red-50">
                        <td className="px-3 py-2 font-mono text-red-800">
                          {err.row}
                        </td>
                        <td className="px-3 py-2 text-red-700">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
