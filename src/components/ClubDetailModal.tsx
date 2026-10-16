import React, { useState } from 'react';
import { 
  X, 
  Building2, 
  MapPin, 
  Users, 
  Calendar, 
  KeyRound, 
  UserCheck, 
  ShieldCheck, 
  Copy, 
  Check,
  Award
} from 'lucide-react';
import { InstituteClub } from '../types';
import { useModalBehavior } from '../utils/useModalBehavior';

interface ClubDetailModalProps {
  club: InstituteClub | null;
  onClose: () => void;
  onJoinThisClub: (passkey: string) => void;
}

export const ClubDetailModal: React.FC<ClubDetailModalProps> = ({
  club,
  onClose,
  onJoinThisClub,
}) => {
  const [copied, setCopied] = useState(false);

  // S1: shared dialog behaviour (Escape / scroll-lock / focus)
  useModalBehavior(club !== null, onClose);

  if (!club) return null;

  const handleCopyPasskey = () => {
    navigator.clipboard.writeText(club.passkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Club details" tabIndex={-1} className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in my-8">
        <button
          onClick={onClose}
          aria-label="Close dialog" className="absolute right-5 top-5 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2 border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                AISHE: {club.aisheCode}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
                Category: {club.category}
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2Icon className="h-3.5 w-3.5" />
                <span>Verified Charter</span>
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
              {club.name}
            </h2>

            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span>{club.district}, {club.state}</span>
              <span>•</span>
              <span>Chartered: {club.establishedDate}</span>
            </div>
          </div>

          {/* Passkey Banner */}
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                <span>Institutional Passkey for Members</span>
              </div>
              <div className="font-mono text-lg font-black text-blue-900 tracking-wider">
                {club.passkey}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPasskey}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onJoinThisClub(club.passkey);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
              >
                Join Chapter
              </button>
            </div>
          </div>

          {/* Institutional Authorities Quorum */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
              <UserCheck className="h-4 w-4 text-slate-600" />
              <span>Designated 4-Tier Institutional Authorities</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {club.authorities.map(auth => (
                <div key={auth.role} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-900 text-[11px] uppercase">{auth.role}</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Verified</span>
                  </div>
                  <div className="font-bold text-slate-900">{auth.name}</div>
                  <div className="text-[11px] text-slate-500">{auth.designation}</div>
                  <div className="text-[11px] text-slate-600 font-mono pt-1">{auth.email}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Snapshot */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-center">
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-lg font-black text-slate-900">{club.memberCount.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Active Enrolled Members</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-lg font-black text-slate-900">{club.eventsConducted}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Activities & Reading Events</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function CheckCircle2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
