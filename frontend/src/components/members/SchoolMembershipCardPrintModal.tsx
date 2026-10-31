import React, { useRef } from 'react';
import { Printer, X, School as SchoolIcon } from 'lucide-react';
import { SchoolStudentCard } from '../../lib/campusApi';
import { useModalBehavior } from '../../utils/useModalBehavior';

interface SchoolMembershipCardPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: SchoolStudentCard[];
  schoolName: string;
}

export const SchoolMembershipCardPrintModal: React.FC<SchoolMembershipCardPrintModalProps> = ({
  isOpen,
  onClose,
  cards,
  schoolName,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-amber-200 overflow-hidden">
        {/* Action Header */}
        <div className="bg-gradient-to-r from-[#1E3A2F] to-[#2D5A46] p-4 sm:p-6 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-400/20 text-amber-300 rounded-xl border border-amber-300/30">
              <SchoolIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Printable NDLI Club Membership Cards</h3>
              <p className="text-xs text-amber-200">
                A4 Printable Sheet &bull; DPDP Act 2023 Offline-First Tangible Identity
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Print A4 Sheet</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Cards Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-100 print:bg-white print:p-0">
          <div
            ref={printAreaRef}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3 print:m-0"
          >
            {cards.map((card, idx) => (
              <div
                key={card.student_uid || idx}
                className="bg-white border-2 border-dashed border-emerald-800/40 rounded-2xl p-4 shadow-xs relative flex flex-col justify-between overflow-hidden print:border-emerald-900 print:rounded-lg print:shadow-none break-inside-avoid"
                style={{ minHeight: '185px' }}
              >
                {/* Top Club Branding */}
                <div className="flex items-start justify-between border-b border-emerald-100 pb-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
                      NDLI
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-900 leading-none">
                        NDLI CLUB MEMBERSHIP CARD
                      </div>
                      <div className="text-[9px] text-gray-500 font-semibold truncate max-w-[200px]">
                        {card.school_name || schoolName}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded">
                    {card.batch_year || 2026}
                  </span>
                </div>

                {/* Card Body */}
                <div className="flex items-center justify-between gap-3 my-1">
                  <div className="space-y-1">
                    <div className="text-sm font-black text-gray-950 uppercase tracking-tight">
                      {card.full_name}
                    </div>
                    <div className="text-[11px] text-gray-700 font-semibold">
                      Class: <span className="font-bold text-emerald-800">{card.student_class}</span> &bull; Section: <span className="font-bold text-emerald-800">{card.section}</span> &bull; Gender: {card.gender}
                    </div>
                    <div className="pt-1">
                      <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                        Deterministic Student UID:
                      </div>
                      <div className="text-xs font-mono font-black text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                        {card.student_uid}
                      </div>
                    </div>
                  </div>

                  {/* QR Code Container */}
                  <div className="shrink-0 text-center bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                    <div className="w-16 h-16 bg-white flex items-center justify-center border border-gray-100">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                          `https://ndli.iitkgp.ac.in/verify/student/?uid=${card.student_uid}`
                        )}`}
                        alt="Student Verification QR"
                        className="w-14 h-14"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[8px] font-bold text-gray-400 block mt-0.5">SCAN TO VERIFY</span>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="border-t border-dashed border-gray-200 pt-1.5 mt-2 flex items-center justify-between text-[8px] text-gray-400 font-medium">
                  <span>National Digital Library of India &bull; IIT Kharagpur</span>
                  <span className="font-mono">Club: {card.club_code}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
