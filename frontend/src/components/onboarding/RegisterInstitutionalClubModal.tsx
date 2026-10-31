import React, { useState } from 'react';
import { 
  School as SchoolIcon, 
  GraduationCap, 
  ArrowRight, 
  X, 
  KeyRound
} from 'lucide-react';
import { useModalBehavior } from '../../utils/useModalBehavior';
import { ResumeDraftModal } from './ResumeDraftModal';
import { DraftPayload } from '../../lib/onboardingApi';

interface RegisterInstitutionalClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'higher_education' | 'school') => void;
  onDraftResumed: (draft: DraftPayload, token: string) => void;
}

export const RegisterInstitutionalClubModal: React.FC<RegisterInstitutionalClubModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
  onDraftResumed,
}) => {
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bifurcation-modal-title"
      >
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-emerald-100 overflow-hidden relative">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#103125] via-[#1A503E] to-[#0A5C3E] p-6 sm:p-8 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-gray-950 uppercase tracking-wider">
                Module 2
              </span>
              <span className="text-xs text-emerald-200">National Charter Registry</span>
            </div>
            <h2 id="bifurcation-modal-title" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Register Institutional Club
            </h2>
            <p className="text-sm text-emerald-100/90 mt-1 max-w-lg">
              Select your institution category to launch the appropriate governance workflow and compliance tier.
            </p>
          </div>

          {/* Options */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Type A: Higher Educational Institution */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectType('higher_education');
                }}
                className="group relative p-6 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 hover:to-emerald-100/60 border-2 border-emerald-200 hover:border-emerald-500 rounded-3xl text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-900/20 group-hover:scale-105 transition-transform">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        Type A
                      </span>
                      <span className="text-xs font-semibold text-gray-500">4-Tier Quorum</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mt-1 group-hover:text-emerald-950">
                      Higher Education Institution
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Universities, Colleges, and Institutes. Features Main Club + Sub-Clubs ($1+N$), self-service student member accounts, and multi-club collaborations.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-emerald-700 group-hover:text-emerald-900">
                  <span>Start HEI Application</span>
                  <ArrowRight className="h-4 w-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Type B: School */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectType('school');
                }}
                className="group relative p-6 bg-gradient-to-br from-amber-50/40 to-orange-50/30 hover:to-amber-100/60 border-2 border-amber-200 hover:border-amber-500 rounded-3xl text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-900/20 group-hover:scale-105 transition-transform">
                    <SchoolIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                        Type B
                      </span>
                      <span className="text-xs font-semibold text-gray-500">3-Tier Quorum</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mt-1 group-hover:text-amber-950">
                      School (Offline-First)
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Primary, Secondary, and Higher Secondary Schools. Compliant with DPDP Act 2023: bulk CSV upload, deterministic physical UIDs, and printable A4 cards.
                  </p>
                </div>
                <div className="mt-5 flex items-center text-xs font-bold text-amber-800 group-hover:text-amber-950">
                  <span>Start School Application</span>
                  <ArrowRight className="h-4 w-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>

            {/* Resume Token Option */}
            <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-gray-500 font-medium">
                Already started an application? Drafts remain saved for 7 days.
              </span>
              <button
                type="button"
                onClick={() => setIsResumeModalOpen(true)}
                className="inline-flex items-center space-x-1.5 font-bold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5 text-emerald-600" />
                <span>Resume with 7-Day Token</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ResumeDraftModal
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        onDraftResumed={(draft, token) => {
          setIsResumeModalOpen(false);
          onClose();
          onDraftResumed(draft, token);
        }}
      />
    </>
  );
};
