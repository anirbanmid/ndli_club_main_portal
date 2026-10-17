import React from 'react';
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
import { t } from "../i18n";

/**
 * Language picker (S4). Every listed language has a REAL catalogue:
 * en (natural keys) + hi (curated) + 18 machine-drafted catalogues under
 * src/i18n/. Bodo, Kashmiri, Manipuri and the 'scf' placeholder were REMOVED
 * at user decision (no implementable translation source) — they return when
 * reviewed catalogues exist. Sindhi ships in Perso-Arabic script (RTL).
 */
export const NDLI_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', status: 'Active' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', status: 'Active' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', status: 'Active' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', status: 'Active' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', status: 'Active' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', status: 'Active' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', status: 'Active' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', status: 'Active' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', status: 'Active' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', status: 'Active' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', status: 'Active' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', status: 'Active' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', status: 'Active' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', status: 'Active' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', status: 'Active' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', status: 'Active' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', status: 'Active' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', status: 'Active' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', status: 'Active' },
  { code: 'ur', name: 'Urdu', native: 'اردو', status: 'Active' },
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
  language: string;
  setLanguage: (code: string) => void;
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
  language,
  setLanguage,
}) => {

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
        <div className="flex items-center space-x-2 sm:space-x-3 text-[11px] text-brand-100">
          <span className="font-semibold tracking-wide">{t("Government of India")}</span>
          <span className="text-brand-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">{t("Ministry of Education")}</span>
          <span className="text-brand-700 hidden sm:inline">|</span>
          <span className="hidden md:inline text-amber-300 font-medium">{t("National Digital Library of India • IIT Kharagpur")}</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Text Resizer */}
          <div className="flex items-center space-x-1 bg-[#1A503E] px-2 py-0.5 rounded border border-[#0D7751]/60">
            <span className="text-[11px] text-brand-200 mr-1">{t("Text:")}</span>
            <button 
              onClick={() => setFontSize('normal')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'normal' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
              title={t("Standard Font Size")}
            >
              A
            </button>
            <button 
              onClick={() => setFontSize('large')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'large' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
              title={t("Large Font Size")}
            >
              A+
            </button>
            <button 
              onClick={() => setFontSize('larger')}
              className={`px-1.5 rounded text-xs transition-colors ${fontSize === 'larger' ? 'bg-[#B45309] text-white font-bold' : 'hover:text-white'}`}
              title={t("Extra Large Font Size")}
            >
              A++
            </button>
          </div>

          <button 
            onClick={() => setHighContrast(!highContrast)}
            className={`px-2.5 py-0.5 rounded text-xs border transition-colors ${
              highContrast 
                ? 'bg-amber-400 text-ink-950 font-bold border-amber-300' 
                : 'bg-[#1A503E] text-brand-100 border-[#0D7751]/60 hover:text-white'
            }`}
          >
            {highContrast ? t("Standard Mode") : t("High Contrast")}
          </button>

          {/* Indian Languages Selector (20 live languages) */}
          <div className="flex items-center space-x-1 bg-[#1A503E] px-2 py-0.5 rounded border border-[#0D7751]/60">
            <Globe className="h-3 w-3 text-amber-300 shrink-0" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent text-brand-100 text-[11px] font-semibold focus:outline-hidden cursor-pointer"
              title={t("Select Language")}
              aria-label={t("Select Language")}
            >
              {NDLI_LANGUAGES.map(lang => (
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
                  {t("NDLI Club")}
                                                  </span>
                <span className="bg-[#E9F5EF] text-[#0D7751] text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-[#0D7751]/30">
                  {t("National Portal")}
                                                  </span>
              </div>
              <p className="text-xs text-[#5A7366] font-medium">
                {t("National Digital Library of India • IIT Kharagpur")}
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
            <span>{t("1. Public Portal")}</span>
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
            <span>{t("2. Institutional Club Module")}</span>
            <span className="bg-[#B45309] text-white text-[11px] px-1.5 py-0.2 rounded font-black">{t("CAMPUS")}</span>
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
            <span>{t("3. IIT KGP Admin Module")}</span>
            <span className="bg-[#0D7751] text-white text-[11px] px-1.5 py-0.2 rounded font-black">{t("6 ZONES")}</span>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="hidden lg:flex items-center space-x-2.5">
          <button
            onClick={openPasskeyModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-[#0D7751] bg-[#1A503E] text-white shadow-xs hover:bg-[#103125] transition-all"
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-300" />
            <span>{t("Student Passkey Join")}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
