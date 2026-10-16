import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Building2, 
  Calendar, 
  Award, 
  User, 
  ExternalLink 
} from 'lucide-react';
import { CertificateData } from '../types';

interface VerifyCertificateViewProps {
  certificates: CertificateData[];
  initialCertId?: string;
  onViewFullCertificate: (cert: CertificateData) => void;
}

export const VerifyCertificateView: React.FC<VerifyCertificateViewProps> = ({
  certificates,
  initialCertId = '',
  onViewFullCertificate,
}) => {
  const [searchId, setSearchId] = useState(initialCertId);
  const [searched, setSearched] = useState(Boolean(initialCertId));

  const trimmedId = searchId.trim().toUpperCase();
  const foundCert = certificates.find(c => c.certId.toUpperCase() === trimmedId);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
  };

  const handleQuickLookup = (id: string) => {
    setSearchId(id);
    setSearched(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-1 rounded-full text-xs font-bold">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <span>Public Credential Verification Portal</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Verify Official NDLI Club Certificate
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
          Every certificate issued by NDLI Club contains an immutable cryptographic ID and digital signature verified against IIT Kharagpur records.
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-md space-y-4">
        <label className="text-xs font-bold text-slate-700 block">
          Enter Certificate Identification Number (CID)
        </label>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative grow">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-600" />
            <input
              type="text"
              placeholder="e.g. NDLI-A7KQ-2M4X"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value.toUpperCase())}
              required
              className="w-full pl-11 pr-4 py-3 text-sm font-mono font-bold tracking-wider rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 uppercase bg-slate-50"
            />
          </div>

          <button
            type="submit"
            className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all shrink-0"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Verify Authenticity</span>
          </button>
        </div>

        {/* Quick sample chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="text-slate-600 font-medium">Try Sample Verified IDs:</span>
          {certificates.slice(0, 2).map(c => (
            <button
              key={c.certId}
              type="button"
              onClick={() => handleQuickLookup(c.certId)}
              className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
            >
              {c.certId}
            </button>
          ))}
        </div>
      </form>

      {/* Search Results Display */}
      {searched && (
        <div className="animate-in fade-in">
          {foundCert ? (
            <div className="bg-white rounded-2xl border-2 border-emerald-400/80 p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-100 pb-5">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Official Record Confirmed
                    </span>
                    <h3 className="text-xl font-extrabold text-slate-900">
                      Valid & Authentic Certificate
                    </h3>
                  </div>
                </div>

                <div className="text-right sm:text-right">
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    CID: {foundCert.certId}
                  </span>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center space-x-1.5 text-slate-600 font-semibold uppercase">
                    <User className="h-3.5 w-3.5 text-blue-600" />
                    <span>Recipient Name</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{foundCert.recipientName}</div>
                  {foundCert.recipientRoll && (
                    <div className="text-[11px] text-slate-600 font-mono">Roll: {foundCert.recipientRoll}</div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center space-x-1.5 text-slate-600 font-semibold uppercase">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    <span>Associated Institution</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{foundCert.instituteName}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center space-x-1.5 text-slate-600 font-semibold uppercase">
                    <Award className="h-3.5 w-3.5 text-blue-600" />
                    <span>Event & Classification</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{foundCert.eventName}</div>
                  <div className="text-[11px] text-emerald-700 font-semibold">Award Category: {foundCert.category}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center space-x-1.5 text-slate-600 font-semibold uppercase">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    <span>Issuance & Authority</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{foundCert.eventDate}</div>
                  <div className="text-[11px] text-slate-600">Issued by IIT Kharagpur & NDLI HQ</div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => onViewFullCertificate(foundCert)}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center space-x-2 transition-all"
                >
                  <span>View Printable Master Certificate</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-rose-200 p-8 text-center space-y-3 shadow-md">
              <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <XCircle className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Certificate Not Found</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                No certificate with ID <strong className="font-mono text-slate-800 font-bold">{trimmedId}</strong> was found in the central NDLI database.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
