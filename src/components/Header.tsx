import React from 'react';
import { 
  Building2, 
  KeyRound, 
  CalendarDays, 
  Award, 
  BarChart3, 
  Presentation, 
  Search,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Compass,
  GraduationCap,
  Landmark,
  Layers
} from 'lucide-react';
import { BranchType } from '../types';

interface HeaderProps {
  currentBranch: BranchType;
  setCurrentBranch: (branch: BranchType) => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openPasskeyModal: () => void;
  openPitchModal: () => void;
  fontSize: 'normal' | 'large' | 'larger';
  setFontSize: (size: 'normal' | 'large' | 'larger') => void;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentBranch,
  setCurrentBranch,
  currentTab,
  setCurrentTab,
  openPasskeyModal,
  openPitchModal,
  fontSize,
  setFontSize,
  highContrast,
  setHighContrast,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E2ECE7] shadow-xs">
      {/* Tricolor National Identity Ribbon */}
      <div className="h-1.5 w-full flex">
        <div className="h-full w-1/3 bg-[#FF9933]"></div>
        <div className="h-full w-1/3 bg-white"></div>
        <div className="h-full w-1/3 bg-[#138808]"></div>
      </div>

      {/* Top GIGW Accessibility & Ministry Bar */}
      <div className="bg-[#103125] text-emerald-100/90 text-xs py-1.5 px-4 md:px-8 flex flex-wrap justify-between items-center gap-2 border-b border-[#1A503E]">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-white tracking-wide">भारत सरकार | Government of India</span>
          <span className="text-emerald-700">|</span>
          <span className="hidden sm:inline">Ministry of Education (MoE)</span>
          <span className="text-emerald-700 hidden sm:inline">|</span>
          <span className="hidden md:inline text-amber-300 font-medium">National Digital Library of India • IIT Kharagpur</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Text Resizer */}
          <div className="flex items-center space-x-1 bg-[#1A503E] px-2 py-0.5 rounded border border-[#0D7751]/60">
            <span className="text-[10px] text-emerald-200 mr-1">Text:</span>
            <button 
              onClick={() => setFontSize('normal')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'normal' ? 'bg-[#D97706] text-white font-bold' : 'hover:text-white'}`}
              title="Standard Font Size"
            >
              A
            </button>
            <button 
              onClick={() => setFontSize('large')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'large' ? 'bg-[#D97706] text-white font-bold' : 'hover:text-white'}`}
              title="Large Font Size"
            >
              A+
            </button>
            <button 
              onClick={() => setFontSize('larger')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'larger' ? 'bg-[#D97706] text-white font-bold' : 'hover:text-white'}`}
              title="Extra Large Font Size"
            >
              A++
            </button>
          </div>

          <button 
            onClick={() => setHighContrast(!highContrast)}
            className={`px-2.5 py-0.5 rounded text-xs border transition-colors ${
              highContrast 
                ? 'bg-amber-400 text-slate-950 font-bold border-amber-300' 
                : 'bg-[#1A503E] text-emerald-100 border-[#0D7751]/60 hover:text-white'
            }`}
          >
            {highContrast ? 'Standard Mode' : 'High Contrast'}
          </button>

          <span className="text-emerald-300 font-semibold text-[11px]">English / हिंदी</span>
        </div>
      </div>

      {/* Main Branding & Master Branch Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Brand identity */}
        <div className="flex items-center justify-between">
          <div 
            onClick={() => {
              setCurrentBranch('landing');
              setCurrentTab('home');
            }}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-[#103125] via-[#1A503E] to-[#0D7751] flex items-center justify-center text-white shadow-md shadow-[#1A503E]/20 group-hover:scale-105 transition-transform">
              <BookOpen className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-extrabold tracking-tight text-[#103125] group-hover:text-[#1A503E] transition-colors">
                  NDLI Club
                </span>
                <span className="bg-[#E9F5EF] text-[#0D7751] text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-[#0D7751]/30">
                  v2.0 NextGen
                </span>
              </div>
              <p className="text-xs text-[#5F7B6E] font-medium">
                National Digital Library of India • IIT Kharagpur
              </p>
            </div>
          </div>

          {/* Mobile Pitch button */}
          <button
            onClick={openPitchModal}
            className="lg:hidden flex items-center space-x-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#D97706] text-white shadow-sm"
          >
            <Presentation className="h-3.5 w-3.5" />
            <span>Pitch</span>
          </button>
        </div>

        {/* 3 Master Branches Switcher (The Core Portal Partition) */}
        <div className="flex items-center p-1 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7] self-start lg:self-auto overflow-x-auto max-w-full">
          {/* Branch 1: Public Landing */}
          <button
            onClick={() => {
              setCurrentBranch('landing');
              setCurrentTab('home');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap ${
              currentBranch === 'landing'
                ? 'bg-[#1A503E] text-white shadow-sm'
                : 'text-[#2E4A3E] hover:text-[#103125] hover:bg-white/60'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>1. Public Portal</span>
          </button>

          {/* Branch 2: Club Module */}
          <button
            onClick={() => {
              setCurrentBranch('club_module');
              setCurrentTab('club_dashboard');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap ${
              currentBranch === 'club_module'
                ? 'bg-[#1A503E] text-white shadow-sm'
                : 'text-[#2E4A3E] hover:text-[#103125] hover:bg-white/60'
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            <span>2. Club Module</span>
            <span className="bg-[#D97706] text-white text-[9px] px-1.5 py-0.2 rounded font-black">CAMPUS</span>
          </button>

          {/* Branch 3: IIT KGP Admin Module */}
          <button
            onClick={() => {
              setCurrentBranch('admin_module');
              setCurrentTab('admin_overview');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap ${
              currentBranch === 'admin_module'
                ? 'bg-[#1A503E] text-white shadow-sm'
                : 'text-[#2E4A3E] hover:text-[#103125] hover:bg-white/60'
            }`}
          >
            <Landmark className="h-4 w-4" />
            <span>3. IIT KGP Admin</span>
            <span className="bg-[#0D7751] text-white text-[9px] px-1.5 py-0.2 rounded font-black">7 ZONES</span>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="hidden lg:flex items-center space-x-2.5">
          <button
            onClick={openPasskeyModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-[#E2ECE7] bg-white hover:bg-[#F4F8F6] text-[#17332A] shadow-xs transition-all"
          >
            <KeyRound className="h-3.5 w-3.5 text-[#0D7751]" />
            <span>Student Passkey Join</span>
          </button>

          <button
            onClick={openPitchModal}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-white shadow-sm hover:from-[#B45309] hover:to-[#D97706] hover:scale-[1.02] transition-all"
          >
            <Presentation className="h-4 w-4" />
            <span>Pitch Deck</span>
            <Sparkles className="h-3 w-3 text-amber-200 animate-pulse" />
          </button>
        </div>
      </div>
    </header>
  );
};
