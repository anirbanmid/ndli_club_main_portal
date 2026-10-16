import React, { useState } from 'react';
import { 
  Building2, 
  KeyRound, 
  CalendarDays, 
  Award, 
  BarChart3, 
  Search,
  BookOpen,
  ShieldCheck,
  Compass,
  GraduationCap,
  Landmark,
  Languages,
  Globe
} from 'lucide-react';
import { BranchType } from '../types';

export const NDLI_24_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', status: 'Active' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', status: 'Active' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', status: 'Scaffolded' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', status: 'Scaffolded' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', status: 'Scaffolded' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', status: 'Scaffolded' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', status: 'Scaffolded' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', status: 'Scaffolded' },
  { code: 'ks', name: 'Kashmiri', native: 'कॉशुर', status: 'Scaffolded' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', status: 'Scaffolded' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', status: 'Scaffolded' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', status: 'Scaffolded' },
  { code: 'mni', name: 'Manipuri', native: 'মৈতৈলোন্', status: 'Scaffolded' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', status: 'Scaffolded' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', status: 'Scaffolded' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', status: 'Scaffolded' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', status: 'Scaffolded' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', status: 'Scaffolded' },
  { code: 'sat', name: 'Santali', native: 'संताली', status: 'Scaffolded' },
  { code: 'sd', name: 'Sindhi', native: 'सिन्धी', status: 'Scaffolded' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', status: 'Scaffolded' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', status: 'Scaffolded' },
  { code: 'ur', name: 'Urdu', native: 'اردو', status: 'Scaffolded' },
  { code: 'scf', name: '24th Language (Scaffolded)', native: 'भारतीय भाषा', status: 'Scaffolded' },
];

interface HeaderProps {
  currentBranch: BranchType;
  setCurrentBranch: (branch: BranchType) => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openPasskeyModal: () => void;
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
  fontSize,
  setFontSize,
  highContrast,
  setHighContrast,
}) => {
  const [selectedLang, setSelectedLang] = useState('en');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E2ECE7] shadow-xs">
      {/* Tricolor National Identity Ribbon */}
      <div className="h-1.5 w-full flex">
        <div className="h-full w-1/3 bg-[#FF9933]"></div>
        <div className="h-full w-1/3 bg-white"></div>
        <div className="h-full w-1/3 bg-[#138808]"></div>
      </div>

      {/* GIGW 3.0 / Accessibility & Multilingual Bar */}
      <div className="bg-[#103125] text-white px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between text-xs border-b border-[#1A503E]">
        <div className="flex items-center space-x-2 sm:space-x-3 text-[11px] text-emerald-100">
          <span className="font-semibold tracking-wide">Government of India</span>
          <span className="text-emerald-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">Ministry of Education</span>
          <span className="text-emerald-700 hidden sm:inline">|</span>
          <span className="hidden md:inline text-amber-300 font-medium">National Digital Library of India • IIT Kharagpur</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Text Resizer */}
          <div className="flex items-center space-x-1 bg-[#1A503E] px-2 py-0.5 rounded border border-[#0D7751]/60">
            <span className="text-[11px] text-emerald-200 mr-1">Text:</span>
            <button 
              onClick={() => setFontSize('normal')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'normal' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
              title="Standard Font Size"
            >
              A
            </button>
            <button 
              onClick={() => setFontSize('large')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'large' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
              title="Large Font Size"
            >
              A+
            </button>
            <button 
              onClick={() => setFontSize('larger')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'larger' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
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

          {/* 24 Indian Languages Selector */}
          <div className="flex items-center space-x-1 bg-[#1A503E] px-2 py-0.5 rounded border border-[#0D7751]/60">
            <Globe className="h-3 w-3 text-amber-300 shrink-0" />
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-transparent text-emerald-100 text-[11px] font-semibold focus:outline-hidden cursor-pointer"
              title="Select Language (24 Languages Scaffolded)"
            >
              {NDLI_24_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-[#103125] text-white">
                  {lang.native} ({lang.name}) {lang.status === 'Active' ? '✓' : '•'}
                </option>
              ))}
            </select>
          </div>
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
                  National Portal
                </span>
              </div>
              <p className="text-xs text-[#5A7366] font-medium">
                National Digital Library of India • IIT Kharagpur
              </p>
            </div>
          </div>
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
            <span>2. Institutional Club Module</span>
            <span className="bg-[#B45309] text-white text-[11px] px-1.5 py-0.2 rounded font-black">CAMPUS</span>
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
            <span>3. IIT KGP Admin Module</span>
            <span className="bg-[#0D7751] text-white text-[11px] px-1.5 py-0.2 rounded font-black">6 ZONES</span>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="hidden lg:flex items-center space-x-2.5">
          <button
            onClick={openPasskeyModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-[#0D7751] bg-[#1A503E] text-white shadow-xs hover:bg-[#103125] transition-all"
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-300" />
            <span>Student Passkey Join</span>
          </button>
        </div>
      </div>
    </header>
  );
};
