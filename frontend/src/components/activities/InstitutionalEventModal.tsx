import React, { useState, useEffect } from 'react';
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
  Building2,
  FileImage,
  Search
} from 'lucide-react';
import { createClubEvent, SubClub } from '../../lib/campusApi';
import { fetchCanonicalClubs } from '../../lib/clubRepository';
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

  // Poster & 300KB Check
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string>('');

  // Sub-Clubs selection (for institutional events)
  const [allSubClubs, setAllSubClubs] = useState(true);
  const [selectedSubClubIds, setSelectedSubClubIds] = useState<number[]>([]);

  // Partner Clubs selection (for multi-club collaboration)
  const [selectedPartnerClubIds, setSelectedPartnerClubIds] = useState<string[]>([]);
  const [canonicalClubList, setCanonicalClubList] = useState<InstituteClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubSearchTerm, setClubSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    async function loadClubs() {
      if (canonicalClubs && canonicalClubs.length > 0 && !canonicalClubs.some(c => c.id.startsWith('NDLI-EMP01-'))) {
        if (active) setCanonicalClubList(canonicalClubs);
        return;
      }
      setClubsLoading(true);
      try {
        const list = await fetchCanonicalClubs();
        if (active) {
          const genuine = list.filter(c => !c.id.startsWith('NDLI-EMP01-'));
          setCanonicalClubList(genuine);
        }
      } catch {
        if (active) setCanonicalClubList([]);
      } finally {
        if (active) setClubsLoading(false);
      }
    }
    loadClubs();
    return () => {
      active = false;
    };
  }, [canonicalClubs]);

  const allAvailablePartners = canonicalClubList.filter(c => c.id !== clubCode);
  const filteredPartners = allAvailablePartners.filter(p => {
    if (!clubSearchTerm.trim()) return true;
    const q = clubSearchTerm.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.state.toLowerCase().includes(q) ||
      (p.aisheCode && p.aisheCode.toLowerCase().includes(q)) ||
      (p.district && p.district.toLowerCase().includes(q))
    );
  });

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

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 300 * 1024) {
      setErrorMsg('Event poster exceeds the maximum 300KB limit.');
      return;
    }
    setErrorMsg(null);
    setPosterFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setPosterPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPosterPreview('');
    }
  };

  const handleSave = async (publish: boolean) => {
    if (!title.trim() || !description.trim() || !startTime || !endTime) {
      setErrorMsg('Title, description, and event timing are required.');
      return;
    }

    const validConductors = conductors
      .filter(c => c.full_name.trim() !== '')
      .map(c => ({ name: c.full_name.trim(), affiliation: c.affiliation.trim() }));

    setBusy(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('club_code', clubCode);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('scope', scope);
      formData.append('start_time', startTime);
      formData.append('end_time', endTime);
      formData.append('publish', publish ? 'true' : 'false');
      if (joiningLink.trim()) formData.append('joining_link', joiningLink.trim());
      if (posterFile) formData.append('poster', posterFile);

      if (scope === 'institutional') {
        if (!allSubClubs && selectedSubClubIds.length > 0) {
          formData.append('sub_club_ids', JSON.stringify(selectedSubClubIds));
        }
      } else if (scope === 'multi_club') {
        if (selectedPartnerClubIds.length > 0) {
          formData.append('partner_clubs', JSON.stringify(selectedPartnerClubIds));
        }
      }

      if (validConductors.length > 0) {
        formData.append('conductors', JSON.stringify(validConductors));
      }

      await createClubEvent(formData);
      onEventCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save event.';
      setErrorMsg(msg);
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
            className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
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
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
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
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
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
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
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
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
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
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 outline-none resize-none"
            />
          </div>

          {/* Event Poster Upload with 300KB Check */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileImage className="h-3.5 w-3.5 text-emerald-700" />
                <span>Event Poster (Optional, Max 300KB)</span>
              </span>
              <span className="text-[10px] text-gray-400 font-normal">PNG / JPEG / PDF</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={handlePosterChange}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-800 hover:file:bg-emerald-100 cursor-pointer"
              />
              {posterFile && (
                <button
                  type="button"
                  onClick={() => { setPosterFile(null); setPosterPreview(''); }}
                  className="text-xs text-rose-600 hover:underline shrink-0 font-medium cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            {posterPreview && (
              <div className="mt-2 p-2 border border-emerald-100 rounded-xl bg-emerald-50/30 inline-block">
                <img src={posterPreview} alt="Poster Preview" className="h-20 object-contain rounded" />
              </div>
            )}
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
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">
                Participating Sub-Clubs Scope
              </label>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center space-x-2 text-xs font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="radio"
                    name="subClubScope"
                    checked={allSubClubs}
                    onChange={() => { setAllSubClubs(true); setSelectedSubClubIds([]); }}
                    className="text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Main Club (All Sub-Clubs Included)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="radio"
                    name="subClubScope"
                    checked={!allSubClubs}
                    onChange={() => setAllSubClubs(false)}
                    className="text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Specific Sub-Clubs Only</span>
                </label>
              </div>

              {!allSubClubs && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {subClubs.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleToggleSubClub(sub.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        selectedSubClubIds.includes(sub.id)
                          ? 'bg-emerald-700 text-white border-emerald-800'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {sub.name} ({sub.code})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Multi-Club Collaboration Selection */}
          {scope === 'multi_club' && (
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="block text-xs font-bold text-gray-800">
                  Select Partner Clubs for Collaboration Invite
                </label>
                <span className="text-[11px] text-gray-500">
                  {clubsLoading ? (
                    'Loading canonical clubs...'
                  ) : (
                    <span>
                      Showing <strong>{filteredPartners.length}</strong> of <strong>{allAvailablePartners.length}</strong> canonical clubs{' '}
                      ({selectedPartnerClubIds.length} selected)
                    </span>
                  )}
                </span>
              </div>

              {/* Universal Instant Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={clubSearchTerm}
                  onChange={(e) => setClubSearchTerm(e.target.value)}
                  placeholder="Universal search by club name, club code (e.g. CLUB-BHU-008), or state..."
                  className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-600 outline-none"
                />
                {clubSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setClubSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Selected Partners Chips */}
              {selectedPartnerClubIds.length > 0 && (
                <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                    <span>Selected Partner Clubs ({selectedPartnerClubIds.length}):</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPartnerClubIds([])}
                      className="text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {allAvailablePartners
                      .filter(p => selectedPartnerClubIds.includes(p.id))
                      .map(p => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100/90 text-emerald-900 text-[11px] font-medium border border-emerald-300"
                        >
                          <span className="font-bold">{p.name}</span>
                          <span className="text-[10px] text-emerald-700 font-mono">({p.id})</span>
                          <button
                            type="button"
                            onClick={() => handleTogglePartnerClub(p.id)}
                            className="hover:text-rose-700 ml-0.5 cursor-pointer font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Quick Select Actions */}
              {filteredPartners.length > 0 && (
                <div className="flex items-center justify-between text-[11px] pt-0.5 px-0.5">
                  <span className="text-gray-500 font-medium">Click any club to toggle collaboration invite</span>
                  <button
                    type="button"
                    onClick={() => {
                      const idsToAdd = filteredPartners.map(p => p.id);
                      setSelectedPartnerClubIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                    }}
                    className="text-emerald-700 hover:underline font-bold cursor-pointer"
                  >
                    Select All {filteredPartners.length} Filtered
                  </button>
                </div>
              )}

              {/* Filtered Canonical Clubs List */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-2xl p-2 bg-gray-50 divide-y divide-gray-100">
                {clubsLoading ? (
                  <div className="p-6 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Loading canonical NDLI club registry...</span>
                  </div>
                ) : filteredPartners.length > 0 ? (
                  filteredPartners.map((partner) => {
                    const isSelected = selectedPartnerClubIds.includes(partner.id);
                    return (
                      <label
                        key={partner.id}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-100/60 border border-emerald-300' : 'hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleTogglePartnerClub(partner.id)}
                            className="rounded text-emerald-700 focus:ring-emerald-600 h-4 w-4 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate">{partner.name}</div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-2">
                              <span className="font-mono text-emerald-800 font-semibold">{partner.id}</span>
                              <span>•</span>
                              <span>{partner.state}</span>
                              {partner.category && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-400">{partner.category}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/80 px-2 py-0.5 rounded-full shrink-0">
                            Invited
                          </span>
                        )}
                      </label>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-gray-500 space-y-1">
                    <div className="font-bold text-gray-700">No canonical clubs matching &ldquo;{clubSearchTerm}&rdquo;</div>
                    <div className="text-[11px]">Try searching by club code (e.g. CLUB-BHU-008), state, or institution name.</div>
                  </div>
                )}
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
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold inline-flex items-center space-x-1 cursor-pointer"
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
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer with Save as Draft vs Publish */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSave(false)}
              className="py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl text-xs transition-all disabled:opacity-60 flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <span>Save as Draft</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSave(true)}
              className="py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center space-x-2 cursor-pointer"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Publish Event</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
