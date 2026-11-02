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
  FileText,
  Download,
  UploadCloud,
  X,
  Check,
  Printer,
  QrCode,
  ShieldCheck,
  Users
} from 'lucide-react';
import { 
  ClubEvent, 
  participateInEvent, 
  approveEventCertificates,
  fetchConductorCertificate,
  respondCollaboration,
  retryEventCollaboration,
  uploadEventParticipants,
  downloadEventCertificatesZipUrl,
  fetchEventAttendees,
  fetchMyEventCertificate,
  EventAttendeeItem,
  MyEventCertificateResponse
} from '../../lib/campusApi';

interface EventParticipationCardProps {
  event: ClubEvent;
  isAuthority: boolean;
  currentClubCode?: string;
  isSchool?: boolean;
  onRefresh: () => void;
}

export const EventParticipationCard: React.FC<EventParticipationCardProps> = ({
  event,
  isAuthority,
  currentClubCode,
  isSchool = false,
  onRefresh,
}) => {
  const [participateBusy, setParticipateBusy] = useState(false);
  const [participateResult, setParticipateResult] = useState<string | null>(null);
  const [participateError, setParticipateError] = useState<string | null>(null);

  // Approval Modal State
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalStep, setApprovalStep] = useState<'auth_challenge' | 'attendee_roster'>('auth_challenge');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Attendees list state for certificate sign-off
  const [attendees, setAttendees] = useState<EventAttendeeItem[]>([]);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<number[]>([]);

  // Student participant certificate & DigiLocker state
  const [myCertificate, setMyCertificate] = useState<MyEventCertificateResponse | null>(null);
  const [participantCertModalOpen, setParticipantCertModalOpen] = useState(false);
  const [digiLockerModalOpen, setDigiLockerModalOpen] = useState(false);
  const [digiLockerSaved, setDigiLockerSaved] = useState(false);

  // Conductor certificate viewer state
  const [conductorCertData, setConductorCertData] = useState<any | null>(null);

  // Collaboration action state
  const [collabBusyId, setCollabBusyId] = useState<number | null>(null);
  const [collabMessage, setCollabMessage] = useState<string | null>(null);

  // School participant upload state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Dynamic window calculation (10 mins before to 20 mins after start)
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAuthority) {
      void fetchMyEventCertificate(event.id)
        .then(setMyCertificate)
        .catch(() => setMyCertificate(null));
    }
  }, [event.id, isAuthority]);

  const startTimeMs = new Date(event.start_time).getTime();
  const endTimeMs = new Date(event.end_time).getTime();
  const windowStartMs = startTimeMs - 10 * 60 * 1000;
  const windowEndMs = startTimeMs + 20 * 60 * 1000;

  const isWindowOpen = now >= windowStartMs && now <= windowEndMs;
  const isBeforeWindow = now < windowStartMs;
  const isEventOver = now >= endTimeMs || event.status === 'completed';

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
      // Also refresh participant certificate state
      void fetchMyEventCertificate(event.id)
        .then(setMyCertificate)
        .catch(() => null);
    } catch (err: any) {
      setParticipateError(err.message || 'Participation window is closed or attendance failed.');
    } finally {
      setParticipateBusy(false);
    }
  };

  const handleOpenApprovalModal = () => {
    setIsApprovalModalOpen(true);
    setApprovalStep('auth_challenge');
    setPasswordConfirm('');
    setApprovalError(null);
    setApprovalSuccess(null);
  };

  const handleVerifyPasswordChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordConfirm.trim()) {
      setApprovalError('Please enter your authority password.');
      return;
    }

    setApprovalBusy(true);
    setApprovalError(null);

    try {
      const attRes = await fetchEventAttendees(event.id);
      setAttendees(attRes.attendees || []);
      const pendingIds = (attRes.attendees || []).filter((a) => !a.is_approved).map((a) => a.id);
      setSelectedAttendeeIds(pendingIds);
      setApprovalStep('attendee_roster');
    } catch (err: any) {
      setApprovalError(err.message || 'Identity verification failed.');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleExecuteApproval = async (options: { approveAll: boolean; attendeeIds?: number[] }) => {
    setApprovalBusy(true);
    setApprovalError(null);

    try {
      const res = await approveEventCertificates(event.id, passwordConfirm, options);
      setApprovalSuccess(`Successfully approved and issued ${res.approved_count} certificates.`);

      // Dispatch real-time telemetry update so Public Portal certificate counter updates immediately
      window.dispatchEvent(
        new CustomEvent('ndli-club-updated', {
          detail: { clubCode: currentClubCode },
        })
      );

      // Refresh attendee list
      const updated = await fetchEventAttendees(event.id);
      setAttendees(updated.attendees || []);
      setSelectedAttendeeIds([]);

      setTimeout(() => {
        setIsApprovalModalOpen(false);
        setApprovalSuccess(null);
        onRefresh();
      }, 1800);
    } catch (err: any) {
      setApprovalError(err.message || 'Failed to approve certificates.');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleToggleSelectAllAttendees = () => {
    const pending = attendees.filter((a) => !a.is_approved).map((a) => a.id);
    if (selectedAttendeeIds.length === pending.length) {
      setSelectedAttendeeIds([]);
    } else {
      setSelectedAttendeeIds(pending);
    }
  };

  const handleToggleAttendee = (id: number) => {
    setSelectedAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleViewConductorCert = async (conductorId: number) => {
    try {
      const data = await fetchConductorCertificate(event.id, conductorId);
      setConductorCertData(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load conductor certificate.');
    }
  };

  const handleRespondCollab = async (collabId: number, action: 'accept' | 'reject') => {
    try {
      setCollabBusyId(collabId);
      setCollabMessage(null);
      const res = await respondCollaboration(collabId, action);
      setCollabMessage(res.message);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update collaboration');
    } finally {
      setCollabBusyId(null);
    }
  };

  const handleRetryCollab = async (collabId: number) => {
    try {
      setCollabBusyId(collabId);
      setCollabMessage(null);
      const res = await retryEventCollaboration(collabId);
      setCollabMessage(res.message);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Retry failed');
    } finally {
      setCollabBusyId(null);
    }
  };

  const handleUploadParticipants = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    try {
      setUploadBusy(true);
      setUploadError(null);
      setUploadResult(null);
      const res = await uploadEventParticipants(event.id, uploadFile);
      setUploadResult(`Enrolled ${res.enrolled_count} participants and generated attendance records!`);
      setTimeout(() => {
        setUploadModalOpen(false);
        setUploadResult(null);
      }, 2000);
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload participants');
    } finally {
      setUploadBusy(false);
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

      {/* Collaborations Section */}
      {event.collaborations && event.collaborations.length > 0 && (
        <div className="pt-2 border-t border-gray-100 space-y-2">
          <div className="text-xs font-bold text-gray-700 flex items-center justify-between">
            <span>Inter-Institutional Collaboration Partners:</span>
            {collabMessage && (
              <span className="text-[11px] text-teal-700 font-semibold">{collabMessage}</span>
            )}
          </div>
          <div className="space-y-1.5">
            {event.collaborations.map((col) => {
              const partnerCode = col.partner_club || col.partner_club_id;
              const isPartnerViewing =
                Boolean(currentClubCode && partnerCode && currentClubCode.toLowerCase() === partnerCode.toLowerCase());
              const isHostViewing =
                Boolean(currentClubCode && event.host_club && currentClubCode.toLowerCase() === event.host_club.toLowerCase());

              return (
                <div
                  key={col.id}
                  className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-gray-800">{col.partner_club_name || partnerCode}</span>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        col.status === 'accepted'
                          ? 'bg-emerald-100 text-emerald-800'
                          : col.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {col.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Partner club accepting / rejecting */}
                    {isPartnerViewing && (col.status === 'invited' || col.status === 'pending') && (
                      <>
                        <button
                          type="button"
                          disabled={collabBusyId === col.id}
                          onClick={() => handleRespondCollab(col.id, 'accept')}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={collabBusyId === col.id}
                          onClick={() => handleRespondCollab(col.id, 'reject')}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* Host club retrying if rejected (max 1 retry) */}
                    {isHostViewing && col.status === 'rejected' && (
                      col.retry_count < 1 ? (
                        <button
                          type="button"
                          disabled={collabBusyId === col.id}
                          onClick={() => handleRetryCollab(col.id)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          Resend Request (1 Retry Limit)
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">Retry limit reached</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          {!isAuthority && (
            <div className="flex flex-wrap items-center gap-2">
              {isWindowOpen ? (
                <button
                  type="button"
                  disabled={participateBusy}
                  onClick={handleParticipate}
                  className="py-2 px-5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-950/20 cursor-pointer flex items-center space-x-2 transition-all"
                >
                  {participateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  <span>Participate in Event</span>
                </button>
              ) : myCertificate?.approved ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setParticipantCertModalOpen(true)}
                    className="py-2 px-4 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-amber-300" />
                    <span>Download Certificate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDigiLockerSaved(true);
                      setDigiLockerModalOpen(true);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                      digiLockerSaved
                        ? 'bg-blue-100 border-blue-300 text-blue-900'
                        : 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                    <span>{digiLockerSaved ? 'Saved in DigiLocker' : 'Save to DigiLocker'}</span>
                  </button>
                </div>
              ) : myCertificate?.status === 'pending_approval' ? (
                <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-700" />
                  <span>Attendance Recorded &bull; Awaiting Authority Approval</span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  className="py-2 px-5 rounded-xl font-bold text-xs bg-gray-100 text-gray-400 cursor-not-allowed flex items-center space-x-2"
                >
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                  <span>{isBeforeWindow ? 'Session Not Started' : 'Attendance Window Closed'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* School post-event actions */}
          {isAuthority && isSchool && (
            <>
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center space-x-1 cursor-pointer"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>Upload Attendance CSV</span>
              </button>
              <a
                href={downloadEventCertificatesZipUrl(event.id)}
                download
                className="py-2 px-3 bg-[#1A503E] hover:bg-[#103125] text-white rounded-xl font-bold text-xs flex items-center space-x-1 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Certificates (ZIP)</span>
              </a>
            </>
          )}

          {/* Authority Approve Certificates Action */}
          {isAuthority && isEventOver && (
            <button
              type="button"
              onClick={handleOpenApprovalModal}
              className="py-2 px-4 bg-gradient-to-r from-[#103125] to-[#1A503E] text-white hover:from-[#0d281e] hover:to-[#154233] rounded-xl font-bold text-xs shadow-md shadow-emerald-950/20 flex items-center space-x-1.5 cursor-pointer"
            >
              <Award className="h-4 w-4 text-amber-300" />
              <span>Approve Certificates</span>
            </button>
          )}
        </div>
      </div>

      {/* School Post-Event Participant CSV Upload Modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Upload School Event Attendees</h3>
                <p className="text-xs text-emerald-100">Enrolls attendees & assigns deterministic UIDs</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-white hover:text-emerald-200 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUploadParticipants} className="p-6 space-y-4 text-xs">
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold">
                  {uploadError}
                </div>
              )}
              {uploadResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 font-semibold">
                  {uploadResult}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Participant CSV File
                </label>
                <p className="text-[11px] text-gray-500 mb-2">
                  Columns: Full Name, Gender, Class, Section, Guardian Phone (optional)
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required
                  className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-800 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadBusy || !uploadFile}
                  className="py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl disabled:opacity-60 flex items-center space-x-1.5"
                >
                  {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Process & Enroll</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2-Phase Password-Gated & Attendee Selection Certificate Approval Modal */}
      {isApprovalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className={`bg-white rounded-3xl shadow-2xl w-full border border-gray-200 overflow-hidden transition-all ${
            approvalStep === 'attendee_roster' ? 'max-w-3xl' : 'max-w-md'
          }`}>
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white relative">
              <button
                onClick={() => setIsApprovalModalOpen(false)}
                className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                <Lock className="h-3.5 w-3.5" />
                <span>
                  {approvalStep === 'auth_challenge'
                    ? 'Step 1: Identity Verification Gate'
                    : 'Step 2: Participant Certificate Sign-Off'}
                </span>
              </div>
              <h3 className="text-lg font-bold">
                {approvalStep === 'auth_challenge'
                  ? 'Authority Re-Authentication'
                  : 'Event Participation Roster Approval'}
              </h3>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                {approvalStep === 'auth_challenge'
                  ? 'Re-enter your authority password to authorize cryptographic digital signing.'
                  : `Select eligible attendees to issue digitally signed certificates for "${event.title}".`}
              </p>
            </div>

            {/* Error & Success Banners */}
            <div className="p-6 pb-0 space-y-3">
              {approvalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{approvalError}</span>
                </div>
              )}

              {approvalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{approvalSuccess}</span>
                </div>
              )}
            </div>

            {/* Phase 1: Login Gate */}
            {approvalStep === 'auth_challenge' && (
              <form onSubmit={handleVerifyPasswordChallenge} className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Authority Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Enter your login password (e.g. Password@123)"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Sign-off eligible roles: Patron / President / Secretary (Institutional) or Sub-Club Coordinator (Sub-Club).
                  </p>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsApprovalModalOpen(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={approvalBusy}
                    className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {approvalBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>Verify & Open Attendees Roster</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Phase 2: Attendee Roster Approval */}
            {approvalStep === 'attendee_roster' && (
              <div className="p-6 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F4F8F6] p-3 rounded-2xl border border-[#E2ECE7]">
                  <div className="flex items-center space-x-2">
                    <Users className="h-4 w-4 text-[#0D7751]" />
                    <span className="font-bold text-[#103125]">
                      {attendees.length} Attendee{attendees.length === 1 ? '' : 's'} Logged
                    </span>
                    <span className="text-gray-400">&bull;</span>
                    <span className="text-[11px] text-gray-600">
                      {attendees.filter((a) => !a.is_approved).length} Pending Approval
                    </span>
                  </div>

                  <div className="text-[11px] text-[#0D7751] font-semibold">
                    {selectedAttendeeIds.length} Selected
                  </div>
                </div>

                {attendees.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 space-y-1">
                    <Users className="h-8 w-8 text-gray-300 mx-auto" />
                    <p className="font-bold text-gray-700">No participants recorded for this session</p>
                    <p className="text-[11px] text-gray-400">
                      Students who clicked the participate button during the 30-minute window will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs divide-y divide-gray-200">
                      <thead className="bg-gray-50 text-gray-700 font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-3 w-10">
                            <input
                              type="checkbox"
                              checked={
                                attendees.filter((a) => !a.is_approved).length > 0 &&
                                selectedAttendeeIds.length ===
                                  attendees.filter((a) => !a.is_approved).length
                              }
                              onChange={handleToggleSelectAllAttendees}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                              title="Select all pending attendees"
                            />
                          </th>
                          <th className="p-3">Participant Name</th>
                          <th className="p-3">Roll & Dept</th>
                          <th className="p-3 text-center">Log Time</th>
                          <th className="p-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-gray-700">
                        {attendees.map((att) => {
                          const isSelected = selectedAttendeeIds.includes(att.id);
                          return (
                            <tr
                              key={att.id}
                              className={`transition-colors ${
                                att.is_approved
                                  ? 'bg-emerald-50/40 text-gray-500'
                                  : isSelected
                                  ? 'bg-amber-50/50'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  disabled={att.is_approved}
                                  checked={att.is_approved || isSelected}
                                  onChange={() => handleToggleAttendee(att.id)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                                />
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-gray-900">{att.name}</div>
                                <div className="text-[10px] text-gray-500">{att.email}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-mono text-[11px]">{att.roll_number || 'N/A'}</div>
                                <div className="text-[10px] text-gray-500">{att.department || 'General'}</div>
                              </td>
                              <td className="p-3 text-center text-[10px] text-gray-500">
                                {att.participated_at
                                  ? new Date(att.participated_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'Window'}
                              </td>
                              <td className="p-3 text-right">
                                {att.is_approved ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <Check className="h-3 w-3" />
                                    <span>Signed</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <span>Pending</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setApprovalStep('auth_challenge')}
                    className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Back to Challenge
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={approvalBusy || selectedAttendeeIds.length === 0}
                      onClick={() =>
                        handleExecuteApproval({ approveAll: false, attendeeIds: selectedAttendeeIds })
                      }
                      className="py-2 px-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
                    >
                      {approvalBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>Done &bull; Approve Selected ({selectedAttendeeIds.length})</span>
                    </button>

                    <button
                      type="button"
                      disabled={approvalBusy || attendees.every((a) => a.is_approved)}
                      onClick={() => handleExecuteApproval({ approveAll: true })}
                      className="py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
                    >
                      {approvalBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Award className="h-3.5 w-3.5 text-amber-300" />
                      )}
                      <span>Approve All ({attendees.filter((a) => !a.is_approved).length})</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student Participant Verifiable Certificate Modal */}
      {participantCertModalOpen && myCertificate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-emerald-300 overflow-hidden">
            <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center space-x-2">
                <Award className="h-5 w-5 text-amber-300" />
                <h3 className="text-base font-bold">Verifiable Participation Certificate</h3>
              </div>
              <button
                type="button"
                onClick={() => setParticipantCertModalOpen(false)}
                className="text-white hover:text-emerald-200 cursor-pointer p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Official Landscape Certificate Document */}
            <div className="p-8 sm:p-10 bg-[#FFFEF9] border-8 border-double border-[#103125]/20 m-4 rounded-2xl space-y-6 text-center text-gray-800">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.25em] font-extrabold text-[#1A503E]">
                  National Digital Library of India (NDLI) Club
                </div>
                <div className="text-[10px] text-gray-500 font-semibold">
                  Ministry of Education, Government of India
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-[#103125] pt-2">
                  Certificate of Participation
                </h2>
              </div>

              <p className="text-xs text-gray-600 italic">This is proudly presented to</p>
              <div className="text-xl sm:text-2xl font-serif font-bold text-gray-900 border-b border-gray-300 pb-1 max-w-md mx-auto">
                {myCertificate.recipient_name}
              </div>

              <p className="text-xs text-gray-600 max-w-lg mx-auto leading-relaxed">
                for active participation and successful completion of the academic event{' '}
                <strong className="text-gray-900 font-bold">"{myCertificate.event_title}"</strong> conducted at{' '}
                <strong className="text-gray-900">{myCertificate.institution_name}</strong> on{' '}
                {myCertificate.event_date}.
              </p>

              <div className="pt-6 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-left text-[11px]">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Certificate ID</span>
                  <span className="font-mono font-bold text-gray-900">{myCertificate.certificate_id}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Issue Date</span>
                  <span className="font-semibold text-gray-800">{myCertificate.issue_date}</span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">HMAC Signature</span>
                  <span className="font-mono text-[9px] text-gray-600 truncate block max-w-[150px]">
                    {myCertificate.hmac_tag}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <span className="text-[11px] text-gray-500 font-mono">
                Cryptographically signed & verified under NDLI National Framework
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#1A503E] hover:bg-[#103125] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setParticipantCertModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DigiLocker Confirmation Modal */}
      {digiLockerModalOpen && myCertificate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-blue-200 overflow-hidden text-center p-6 space-y-4">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto text-blue-700">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <div className="inline-block px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-extrabold uppercase tracking-wider border border-blue-200">
                National DigiLocker Repository
              </div>
              <h3 className="text-lg font-extrabold text-gray-900">Certificate Saved to DigiLocker</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Your verifiable certificate has been permanently issued to your Aadhaar-linked DigiLocker account.
              </p>
            </div>

            <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-100 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Document URI:</span>
                <span className="font-mono font-bold text-blue-900">
                  in.gov.ndli.cert.{myCertificate.certificate_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recipient Name:</span>
                <span className="font-bold text-gray-800">{myCertificate.recipient_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Issuer:</span>
                <span className="font-medium text-gray-700">NDLI Ministry of Education</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Legally Valid Credential (IT Act 2000)</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDigiLockerModalOpen(false)}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Done
            </button>
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
              <button onClick={() => setConductorCertData(null)} className="text-white cursor-pointer">✕</button>
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
