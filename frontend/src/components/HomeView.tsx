import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  Award, 
  Calendar, 
  Search, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  BookOpen, 
  Zap, 
  ShieldCheck, 
  FileCheck2,
  Sparkles,
  Landmark,
  GraduationCap
} from 'lucide-react';
import { InstituteClub } from '../types';
import { t } from "../i18n";

interface HomeViewProps {
  clubs: InstituteClub[];
  onSelectClub: (club: InstituteClub) => void;
  onJoinWithPasskey: () => void;
  onRegisterInstitute: () => void;
  onGoToClubModule: () => void;
  onGoToAdminModule: () => void;
  onVerifyCertificates: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  clubs,
  onSelectClub,
  onJoinWithPasskey,
  onRegisterInstitute,
  onGoToClubModule,
  onGoToAdminModule,
  onVerifyCertificates,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Active verified clubs only for the public directory
  const activeClubs = clubs.filter(c => c.status === 'Active');

  // Extract unique states for filter
  const states = ['All', ...Array.from(new Set(activeClubs.map(c => c.state)))];
  const categories = ['All', 'University', 'College', 'Autonomous Institute', 'School'];

  const filteredClubs = activeClubs.filter(club => {
    const matchesSearch = 
      club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.aisheCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.district.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = selectedState === 'All' || club.state === selectedState;
    const matchesCategory = selectedCategory === 'All' || club.category === selectedCategory;
    return matchesSearch && matchesState && matchesCategory;
  });

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Section with Authentic NDLI Green & Amber Theme */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#103125] via-[#1A503E] to-[#0A5C3E] text-white py-16 px-4 sm:px-6 lg:px-8 rounded-3xl mx-4 sm:mx-6 lg:px-8 mt-6 shadow-2xl border border-[#0D7751]/30">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#0D7751_1px,transparent_1px)] [background-size:20px_20px]"></div>

        <div className="relative max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center space-x-2 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-xs font-bold text-brand-200 backdrop-blur-xs">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>{t("National Digital Reading & Research Movement • NEP 2020")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {t("Connecting India's Campuses to")} <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-100 bg-clip-text text-transparent">
              {t("India's National Academic Resources")}
                                      </span>
          </h1>

          <p className="text-base sm:text-lg text-brand-100/90 max-w-3xl mx-auto leading-relaxed">
            {t("The next-generation NDLI Club portal empowers thousands of schools, colleges, and universities across India to conduct verified reading marathons, co-curricular workshops, and inter-institutional research collaborations.")}
                                </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap justify-center items-center gap-3 pt-2">
            <button
              onClick={onRegisterInstitute}
              className="px-6 py-3.5 rounded-xl bg-[#B45309] hover:bg-[#92400E] text-white font-extrabold text-sm shadow-lg shadow-amber-950/20 hover:scale-[1.02] transition-all flex items-center space-x-2"
            >
              <Building2 className="h-4 w-4" />
              <span>{t("Register Institutional Club (4-Tier)")}</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              onClick={onJoinWithPasskey}
              className="px-6 py-3.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-sm shadow-md hover:scale-[1.02] transition-all flex items-center space-x-2 backdrop-blur-xs"
            >
              <span>{t("Students: Join with Passkey")}</span>
            </button>

            <button
              onClick={onGoToClubModule}
              className="px-6 py-3.5 rounded-xl bg-[#0D7751] hover:bg-[#0a5c3e] text-white font-bold text-sm shadow-md hover:scale-[1.02] transition-all flex items-center space-x-2"
            >
              <GraduationCap className="h-4 w-4 text-amber-300" />
              <span>{t("Explore Club Management Space")}</span>
            </button>
          </div>
        </div>

        {/* Demonstration Telemetry Counters (SAMPLE ONLY — live counters ship with the data platform) */}
        <div className="relative mt-12 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#103125]/80 backdrop-blur-md p-6 rounded-2xl border border-brand-800/40 shadow-xl">
          <div className="absolute -top-3 right-4 bg-amber-400 text-[#103125] text-[11px] font-black px-2.5 py-1 rounded-full shadow">{t("SAMPLE ONLY — DEMO FIGURES")}</div>
          <div className="text-center">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Active Clubs")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300">324</div>
            <div className="text-[11px] text-brand-200">{t("Across 6 Zonal Regions")}</div>
          </div>

          <div className="text-center border-l border-brand-900/60">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Enrolled Scholars")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">12,800</div>
            <div className="text-[11px] text-brand-200">{t("Students & Researchers")}</div>
          </div>

          <div className="text-center border-l border-brand-900/60">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Co-Curriculars")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">486</div>
            <div className="text-[11px] text-brand-200">{t("Sample NAAC 3.3 Logs")}</div>
          </div>

          <div className="text-center border-l border-brand-900/60">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Award className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Certificates")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300">3,910</div>
            <div className="text-[11px] text-brand-200">{t("QR-Verified Micro-Credentials")}</div>
          </div>
        </div>
      </section>

      {/* Directory of Authorized NDLI Clubs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E2ECE7] pb-5">
          <div>
            <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full mb-1">
              <Building2 className="h-3.5 w-3.5" />
              <span>{t("Branch 1: Public Institutional Discovery")}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#103125] tracking-tight">
              {t("National Directory of Chartered NDLI Clubs")}
                                      </h2>
            <p className="text-xs text-[#5A7366] mt-0.5">
              {t("Search authorized university and college chapters across India. View public showcase profiles and campus passkeys.")}
                                      </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onVerifyCertificates}
              className="px-3.5 py-1.5 rounded-xl border border-[#E2ECE7] bg-white text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] flex items-center space-x-1.5 shadow-2xs"
            >
              <Award className="h-3.5 w-3.5 text-[#0D7751]" />
              <span>{t("Public Certificate Verifier")}</span>
            </button>
            <span className="text-xs font-bold text-[#103125] bg-[#E9F5EF] px-3 py-1.5 rounded-lg border border-[#0D7751]/20">
              {filteredClubs.length} {t("Active Chapters")}
                                      </span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2ECE7] shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5A7366]" />
            <input
              type="text"
              placeholder={t("Search institute name, AISHE code (e.g. U-0570), or city...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751] focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full py-2.5 px-3 text-xs rounded-xl border border-[#E2ECE7] bg-white text-[#103125] font-semibold focus:ring-2 focus:ring-[#0D7751]"
            >
              {states.map(state => (
                <option key={state} value={state}>
                  {t("State:")} {state}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-2.5 px-3 text-xs rounded-xl border border-[#E2ECE7] bg-white text-[#103125] font-semibold focus:ring-2 focus:ring-[#0D7751]"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {t("Category:")} {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Club Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClubs.map(club => (
            <div
              key={club.id}
              className="bg-white rounded-3xl border border-[#E2ECE7] p-6 shadow-xs hover:shadow-md hover:border-[#0D7751]/60 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20">
                    {t("AISHE:")} {club.aisheCode}
                  </span>
                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-brand-800 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                    <CheckCircle2 className="h-3 w-3 text-brand-700" />
                    <span>{t(club.zone)} {t("Zone")}</span>
                  </span>
                </div>

                <h3 className="font-bold text-base text-[#103125] group-hover:text-[#1A503E] transition-colors line-clamp-2">
                  {club.name}
                </h3>

                <div className="flex items-center space-x-1.5 text-xs text-[#5A7366]">
                  <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>{club.district}, {club.state}</span>
                </div>

                {/* Key authorities snippet */}
                <div className="text-xs bg-[#F4F8F6] p-3 rounded-xl border border-[#E2ECE7] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#5A7366] font-medium">{t("Patron:")}</span>
                    <span className="font-bold text-[#103125]">{club.authorities.find(a => a.role === 'Patron')?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5A7366] font-medium">{t("President:")}</span>
                    <span className="font-bold text-[#103125]">{club.authorities.find(a => a.role === 'President')?.name}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-[#E2ECE7] flex items-center justify-between">
                <div className="text-xs text-[#5A7366]">
                  <span className="font-bold text-[#103125]">{club.memberCount.toLocaleString()}</span> {t("Scholars")}
                                          </div>

                <button
                  onClick={() => onSelectClub(club)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#1A503E] bg-[#E9F5EF] hover:bg-[#d5eee0] transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30"
                >
                  <span>{t("View Public Profile")}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Main Architectural Branches Overview (Pitch Feature) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#103125] text-white rounded-3xl p-8 sm:p-12 border border-[#1A503E]">
          <div className="max-w-3xl mb-8 space-y-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              {t("Unified National Learning Architecture")}
                                      </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t("Three Seamless Modules Powering NDLI Club 2.0")}
                                      </h2>
            <p className="text-xs sm:text-sm text-brand-200/90 leading-relaxed">
              {t("Replacing the legacy portal with an enterprise-grade triple-branch platform.")}
                                      </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3">
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-bold text-lg text-white">{t("Public Portal & Discovery")}</h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("National discovery, live activity calendars, GIGW 3.0 accessibility, and instant cryptographic certificate verification engine.")}
                                            </p>
            </div>

            <div 
              onClick={onGoToClubModule}
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3 cursor-pointer hover-lift hover:bg-white/10 hover:border-amber-400/40 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                2
              </div>
              <h3 className="font-bold text-lg text-white flex items-center justify-between">
                <span>{t("Club & Campus Module")}</span>
                <ArrowRight className="h-4 w-4 text-amber-300" />
              </h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("Student onboarding via Passkey or Bulk CSV, annual NAAC 3.3 activity logs, grievance ticketing, and the Inter-Club Sharing Shield.")}
                                            </p>
            </div>

            <div 
              onClick={onGoToAdminModule}
              className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-3 cursor-pointer hover-lift hover:bg-white/10 hover:border-amber-400/40 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                3
              </div>
              <h3 className="font-bold text-lg text-white flex items-center justify-between">
                <span>{t("IIT Kharagpur Admin")}</span>
                <ArrowRight className="h-4 w-4 text-amber-300" />
              </h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("6-zone regional governance with 7 officers (EMP01–EMP07), institutional approvals, authority transition sanctioning, and forensic legacy data healing.")}
                                            </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
