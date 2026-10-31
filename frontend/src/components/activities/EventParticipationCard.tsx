import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Award, 
  Lock, 
  ExternalLink, 
  ShieldCheck
} from 'lucide-react';
import { 
  ClubEvent, 
  participateInEvent, 
  approveEventCertificates,
  fetchConductorCertificate 
} from '../../lib/campusApi';

interface EventParticipationCardProps {
  event: ClubEvent;
  isAuthority: boolean;
  onRefresh: () => void;
}

export const EventParticipationCard: React.FC<EventParticipationCardProps> = ({
  event,
  isAuthority,
  onRefresh,
}) => {
  const [participateBusy, setParticipateBusy] = useState(false);
  const [participateResult, setParticipateResult] = useState<string | null>(null);
  const [participateError, setParticipateError] = useState<string | null>(null);

  // Approval Modal State
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Conductor certificate viewer state
  const [conductorCertData, setConductorCertData] = useState<any | null>(null);

  // Dynamic window calculation (10 mins before to 20 mins after start)
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startTimeMs = new Date(event.start_time).getTime();
  const endTimeMs = new Date(event.end_time).getTime();
  const windowStartMs = startTimeMs - 10 * 60 * 1000;
  const windowEndMs = startTimeMs + 20 * 60 * 1000;

  const isWindowOpen = now >= windowStartMs && now <= windowEndMs;
  const isBeforeWindow = now < windowStartMs;
  const isWindowClosed = now > windowEndMs;
  const isEventOver = now >= endTimeMs;

  const formatCountdown = (targetMs: number) => {
    const diff = Math.max(0, Math.floor((targetMs - now) / 1000));
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  const handleParticipate = async () => {
    setParticipateBusy(true);
    setParticipateResult(null);
    setParticipateError(null);

    try {
      const res = await participateInEvent(event.id);
      setParticipateResult(res.message);
      onRefresh();
    } catch (err: any) {
      setParticipateError(err.message || 'Participation window is closed or attendance failed.');
    } finally {
      setParticipateBusy(false);
    }
  };

  const handleApproveCertificates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordConfirm) {
      setApprovalError('Please enter your authority password to re-authenticate.');
      return;
    }

    setApprovalBusy(true);
    setApprovalError(null);

    try {
      const res = await approveEventCertificates(event.id, passwordConfirm);
      setApprovalSuccess(`Successfully approved certificates for ${res.approved_count} participants.`);
      setPasswordConfirm('');
      setTimeout(() => {
        setIsApprovalModalOpen(false);
        setApprovalSuccess(null);
      }, 2000);
      onRefresh();
    } catch (err: any) {
      setApprovalError(err.message || 'Certificate approval authentication failed.');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleViewConductorCert = async (conductorId: number) => {
    try {
      const data = await fetchConductorCertificate(event.id, conductorId);
      setConductorCertData(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load conductor certificate.');
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs hover:shadow-md transition-all space-y-4">
      {/* Top Meta */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              event.scope === 'multi_club'
                ? 'bg-teal-100 text-teal-900 border border-teal-200'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
            }`}>
              {event.scope === 'multi_club' ? 'Multi-Club Collaboration' : 'Institutional Event'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
              {event.status.toUpperCase()}
            </span>
          </div>
          <h3 className="text-lg font-extrabold text-gray-900 leading-snug">{event.title}</h3>
          <p className="text-xs text-gray-600 line-clamp-2">{event.description}</p>
        </div>

        {/* Dynamic Window Countdown / Status Pill */}
        <div className="shrink-0 self-start">
          {isWindowOpen ? (
            <div className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 animate-pulse shadow-md shadow-emerald-950/20">
              <Clock className="h-3.5 w-3.5" />
              <span>Window OPEN ({formatCountdown(windowEndMs)})</span>
            </div>
          ) : isBeforeWindow ? (
            <div className="px-3 py-1.5 bg-amber-100 text-amber-900 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border border-amber-200">
              <Clock className="h-3.5 w-3.5 text-amber-700" />
              <span>Opens in {formatCountdown(windowStartMs)}</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold flex items-center space-x-1.5">
              <Lock className="h-3.5 w-3.5 text-gray-400" />
              <span>Participation Window Closed</span>
            </div>
          )}
        </div>
      </div>

      {/* Date & Conductors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-gray-600 border-t border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-gray-800 font-semibold">
            <Calendar className="h-3.5 w-3.5 text-emerald-700" />
            <span>{new Date(event.start_time).toLocaleString()}</span>
          </div>
          {event.joining_link && (
            <a
              href={event.joining_link}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center space-x-1 hover:underline truncate"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span>Join Virtual Session</span>
            </a>
          )}
        </div>

        {event.conductors && event.conductors.length > 0 && (
          <div className="space-y-1">
            <span className="font-bold text-gray-700">Conductors:</span>
            <div className="flex flex-wrap gap-1.5">
              {event.conductors.map((c, idx) => (
                <span
                  key={idx}
                  onClick={() => c.id && handleViewConductorCert(c.id)}
                  className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-md text-[11px] text-gray-800 font-medium cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                >
                  {c.full_name} ({c.affiliation})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {participateResult && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{participateResult}</span>
        </div>
      )}

      {participateError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{participateError}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
        <div>
          {/* Student Participate Button */}
          <button
            type="button"
            disabled={!isWindowOpen || participateBusy}
            onClick={handleParticipate}
            className={`py-2 px-5 rounded-xl font-bold text-xs transition-all flex items-center space-x-2 ${
              isWindowOpen
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-950/20 cursor-pointer'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {participateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            <span>Participate in Event</span>
          </button>
        </div>

        {/* Authority Approve Certificates Action */}
        {isAuthority && isEventOver && (
          <button
            type="button"
            onClick={() => setIsApprovalModalOpen(true)}
            className="py-2 px-4 bg-gradient-to-r from-[#103125] to-[#1A503E] text-white hover:from-[#0d281e] hover:to-[#154233] rounded-xl font-bold text-xs shadow-md shadow-emerald-950/20 flex items-center space-x-1.5 cursor-pointer"
          >
            <Award className="h-4 w-4 text-amber-300" />
            <span>Approve Certificates</span>
          </button>
        )}
      </div>

      {/* Password-Gated Certificate Approval Modal */}
      {isApprovalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                <ShieldCheck className="h-4 w-4" />
                <span>Re-Authentication Security Gate</span>
              </div>
              <h3 className="text-lg font-bold">Approve Participation Certificates</h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Authority verification required before cryptographic certificate dispatch.
              </p>
            </div>

            <form onSubmit={handleApproveCertificates} className="p-6 space-y-4">
              {approvalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>{approvalSuccess}</span>
                </div>
              )}

              {approvalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{approvalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Authority Account Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Enter your login password to confirm identity"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="flex space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsApprovalModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={approvalBusy}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2"
                >
                  {approvalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Approve & Sign</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conductor Certificate Modal */}
      {conductorCertData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-amber-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Event Conductor Certificate</h3>
                <p className="text-xs text-amber-100">Official Landscape Certificate &bull; NDLI Portal</p>
              </div>
              <button onClick={() => setConductorCertData(null)} className="text-white">✕</button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-amber-900">Certificate ID:</span>
                  <span className="font-mono font-bold text-gray-900">{conductorCertData.certificate_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-amber-900">Conductor Name:</span>
                  <span className="font-bold text-gray-900">{conductorCertData.conductor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-amber-900">Affiliation:</span>
                  <span className="text-gray-800">{conductorCertData.affiliation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-amber-900">Event Title:</span>
                  <span className="text-gray-800">{conductorCertData.event_title}</span>
                </div>
                <div className="flex justify-between border-t border-amber-200 pt-2">
                  <span className="font-bold text-amber-900">Cryptographic Signature:</span>
                  <span className="font-mono text-[10px] text-gray-600 truncate max-w-[200px]">{conductorCertData.signature_hmac}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
