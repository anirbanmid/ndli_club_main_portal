import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  X, 
  Loader2, 
  AlertCircle, 
  Link as LinkIcon, 
  Share2, 
  Building2
} from 'lucide-react';
import { createClubEvent, SubClub } from '../../lib/campusApi';
import { InstituteClub } from '../../types';
import { useModalBehavior } from '../../utils/useModalBehavior';

interface InstitutionalEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubCode: string;
  subClubs: SubClub[];
  canonicalClubs: InstituteClub[];
  onEventCreated: () => void;
}

export const InstitutionalEventModal: React.FC<InstitutionalEventModalProps> = ({
  isOpen,
  onClose,
  clubCode,
  subClubs,
  canonicalClubs,
  onEventCreated,
}) => {
  const [scope, setScope] = useState<'institutional' | 'multi_club'>('institutional');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [joiningLink, setJoiningLink] = useState('');

  // Sub-Clubs selection (for institutional events)
  const [selectedSubClubIds, setSelectedSubClubIds] = useState<number[]>([]);

  // Partner Clubs selection (for multi-club collaboration)
  const [selectedPartnerClubIds, setSelectedPartnerClubIds] = useState<string[]>([]);

  // Conductors list
  const [conductors, setConductors] = useState<{ full_name: string; affiliation: string }[]>([
    { full_name: '', affiliation: '' },
  ]);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  const handleAddConductor = () => {
    setConductors(prev => [...prev, { full_name: '', affiliation: '' }]);
  };

  const handleRemoveConductor = (index: number) => {
    setConductors(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleConductorChange = (index: number, field: 'full_name' | 'affiliation', val: string) => {
    setConductors(prev =>
      prev.map((c, idx) => (idx === index ? { ...c, [field]: val } : c))
    );
  };

  const handleToggleSubClub = (id: number) => {
    setSelectedSubClubIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleTogglePartnerClub = (code: string) => {
    setSelectedPartnerClubIds(prev =>
      prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !startTime || !endTime) {
      setErrorMsg('Title, description, and event timing are required.');
      return;
    }

    const validConductors = conductors.filter(c => c.full_name.trim() !== '');

    setBusy(true);
    setErrorMsg(null);

    try {
      await createClubEvent({
        title: title.trim(),
        description: description.trim(),
        scope,
        start_time: startTime,
        end_time: endTime,
        joining_link: joiningLink.trim() || undefined,
        sub_club_ids: scope === 'institutional' ? selectedSubClubIds : undefined,
        conductors: validConductors.length > 0 ? validConductors : undefined,
      });

      onEventCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to schedule event.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-emerald-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>Event Coordination Engine</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Create Club Activity or Event</h2>
          <p className="text-xs text-emerald-100/90 mt-0.5">
            Configure conductors, dynamic 30-minute attendance windows, and inter-institutional partnerships.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Scope Selector: Institutional vs Multi-Club */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">Event Scope</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScope('institutional')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'institutional'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-2 text-xs">
                  <Building2 className="h-4 w-4 text-emerald-700" />
                  <span>Institutional Event</span>
                </div>
                <p className="text-[11px] font-normal text-gray-500 mt-1">
                  Main Club and departmental Sub-Clubs.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('multi_club')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'multi_club'
                    ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-bold ring-2 ring-teal-500/20'
                    : 'border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-2 text-xs">
                  <Share2 className="h-4 w-4 text-teal-700" />
                  <span>Multi-Club Collaboration</span>
                </div>
                <p className="text-[11px] font-normal text-gray-500 mt-1">
                  Inter-institutional co-hosted event.
                </p>
              </button>
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. National Reading Olympiad & AI Workshop"
              required
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Event Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Outline event agenda, speaker topics, and learning objectives..."
              required
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none resize-none"
            />
          </div>

          {/* Timing: Start & End */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Start Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                End Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-600 outline-none"
              />
            </div>
          </div>

          {/* Dynamic 30-min window note */}
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
            <Clock className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <span>
              <strong>Dynamic Attendance Window:</strong> Students can record participation only from <strong>10 minutes before start</strong> until <strong>20 minutes after start</strong> (30-minute total window).
            </span>
          </div>

          {/* Joining Link */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Virtual Joining Link <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <LinkIcon className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="url"
                value={joiningLink}
                onChange={(e) => setJoiningLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="w-full pl-9 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
              />
            </div>
          </div>

          {/* Sub-Clubs Scope Selection */}
          {scope === 'institutional' && subClubs.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                Participating Sub-Clubs (Leave empty for All Sub-Clubs)
              </label>
              <div className="flex flex-wrap gap-2">
                {subClubs.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleToggleSubClub(sub.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      selectedSubClubIds.includes(sub.id)
                        ? 'bg-emerald-700 text-white border-emerald-800'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {sub.name} ({sub.code})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Club Collaboration Selection */}
          {scope === 'multi_club' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                Select Partner Clubs for Collaboration Invite
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-gray-200 rounded-2xl p-2 bg-gray-50">
                {canonicalClubs.filter(c => c.id !== clubCode).map((partner) => (
                  <label
                    key={partner.id}
                    className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-white text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPartnerClubIds.includes(partner.id)}
                      onChange={() => handleTogglePartnerClub(partner.id)}
                      className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-gray-800">{partner.name}</span>{' '}
                      <span className="text-[11px] text-gray-500">({partner.state})</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Conductors List */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Event Conductors (For Conductor Certificates)
                </h4>
                <p className="text-[11px] text-gray-500">
                  Conductors will receive HMAC-SHA256 verifiable landscape certificates with official logo and signature.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddConductor}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold inline-flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>

            {conductors.map((c, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Conductor Full Name"
                  value={c.full_name}
                  onChange={(e) => handleConductorChange(idx, 'full_name', e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <input
                  type="text"
                  placeholder="Affiliation / Dept"
                  value={c.affiliation}
                  onChange={(e) => handleConductorChange(idx, 'affiliation', e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {conductors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveConductor(idx)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center space-x-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Publish Event</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
