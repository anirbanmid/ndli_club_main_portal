import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  Users, 
  Award, 
  Calendar, 
  Search, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  GraduationCap,
  ListTree
} from 'lucide-react';
import { InstituteClub } from '../types';
import { t } from "../i18n";
import { TelemetrySection } from './TelemetrySection';
import { fetchTelemetry, TelemetryPayload } from '../lib/api';

interface HomeViewProps {
  clubs: InstituteClub[];
  onSelectClub: (club: InstituteClub) => void;
  onJoinWithPasskey: () => void;
  onRegisterInstitute: () => void;
  onGoToClubModule: () => void;
  onGoToAdminModule: () => void;
  onGoToStudentModule: () => void;
  onVerifyCertificates: () => void;
  onOpenDirectory: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  clubs,
  onSelectClub,
  onJoinWithPasskey,
  onRegisterInstitute,
  onGoToClubModule,
  onGoToAdminModule,
  onGoToStudentModule,
  onVerifyCertificates,
  onOpenDirectory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Live registry telemetry (M3-1): one fetch, two views (chart + table).
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [telemetryFailed, setTelemetryFailed] = useState(false);

  useEffect(() => {
    fetchTelemetry()
      .then((payload) => {
        setTelemetry(payload);
        setTelemetryFailed(false);
      })
      .catch(() => setTelemetryFailed(true))
      .finally(() => setTelemetryLoading(false));
  }, []);

  // Approved verified clubs for the public directory (excluding test samples or suspended)
  const canonicalClubs = clubs.filter(c => c.status !== 'Suspended' && !c.isSample && !c.name.includes('(SAMPLE)'));

  // Extract unique states for filter - sorted alphabetically across all States & UTs
  const states = ['All', ...Array.from(new Set(canonicalClubs.map(c => c.state))).filter(Boolean).sort()];
  const categories = ['All', 'University', 'College', 'Autonomous Institute', 'School'];

  const filteredClubs = canonicalClubs.filter(club => {
    const matchesSearch = 
      club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.aisheCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.district.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = selectedState === 'All' || club.state === selectedState;
    const matchesCategory = selectedCategory === 'All' || club.category === selectedCategory;
    return matchesSearch && matchesState && matchesCategory;
  });

  return (
    <div className="space-y-14 pb-20">
      {/* Hero Section with Authentic NDLI Green & Amber Theme */}
      <section className="relative overflow-hidden hero-mesh bg-gradient-to-br from-[#103125] via-[#164433] to-[#0A5C3E] text-white py-16 sm:py-20 px-4 sm:px-6 lg:px-8 rounded-3xl mx-4 sm:mx-6 lg:mx-8 mt-6 shadow-2xl border border-[#0D7751]/30">
        {/* Ambient decorative glow spheres with subtle float animation */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none animate-ambient-float" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none animate-ambient-float" style={{ animationDelay: '4s' }} />
        <div className="absolute inset-0 opacity-15 dot-pattern pointer-events-none"></div>

        <div className="relative max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center space-x-2.5 bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-1.5 rounded-full text-xs font-bold text-brand-100 backdrop-blur-md shadow-xs transition-all">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span className="tracking-wide">{t("National Digital Reading & Research Movement • NEP 2020")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.12]">
            {t("Connecting India's Campuses to")} <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 bg-clip-text text-transparent drop-shadow-xs">
              {t("India's National Academic Resources")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-brand-100/90 max-w-3xl mx-auto leading-relaxed font-normal">
            {t("The next-generation NDLI Club portal empowers thousands of schools, colleges, and universities across India to conduct verified reading marathons, co-curricular workshops, and inter-institutional research collaborations.")}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap justify-center items-center gap-3.5 pt-3">
            <button
              onClick={onRegisterInstitute}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#B45309] to-[#D97706] hover:from-[#92400E] hover:to-[#B45309] text-white font-extrabold text-sm shadow-lg shadow-amber-950/30 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center space-x-2 cursor-pointer group"
            >
              <Building2 className="h-4 w-4" />
              <span>{t("Register Institutional Club (4-Tier)")}</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={onJoinWithPasskey}
              className="px-6 py-3.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-sm shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center space-x-2 backdrop-blur-md cursor-pointer"
            >
              <span>{t("Students: Join with Passkey")}</span>
            </button>

            <button
              onClick={onGoToClubModule}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#0D7751] to-[#109364] hover:from-[#0a5c3e] hover:to-[#0D7751] text-white font-bold text-sm shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center space-x-2 cursor-pointer border border-emerald-400/20"
            >
              <GraduationCap className="h-4 w-4 text-amber-300" />
              <span>{t("Explore Club Management Space")}</span>
            </button>
          </div>
        </div>

        {/* Live National Registry Telemetry Summary */}
        <div className="relative mt-12 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#103125]/75 backdrop-blur-lg p-6 rounded-2xl border border-white/15 shadow-2xl">
          <div className="text-center group">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Building2 className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Active Clubs")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
              {telemetry?.totals?.clubs ? telemetry.totals.clubs.toLocaleString() : clubs.length.toLocaleString()}
            </div>
            <div className="text-[11px] text-brand-200/90 font-medium">{t("Across 6 Zonal Regions")}</div>
          </div>

          <div className="text-center border-l border-white/15 group">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Users className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Total Members Till Date")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {telemetry?.totals?.members !== undefined ? telemetry.totals.members.toLocaleString() : '0'}
            </div>
            <div className="text-[11px] text-brand-200/90 font-medium">{t("Total enrolled till date")}</div>
          </div>

          <div className="text-center border-l border-white/15 group">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Calendar className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Co-Curriculars")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {telemetry?.totals?.activities !== undefined ? telemetry.totals.activities.toLocaleString() : '0'}
            </div>
            <div className="text-[11px] text-brand-200/90 font-medium">{t("Verified NAAC 3.3 Logs")}</div>
          </div>

          <div className="text-center border-l border-white/15 group">
            <div className="flex items-center justify-center space-x-1.5 text-brand-300 mb-1">
              <Award className="h-4 w-4 text-amber-300 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">{t("Certificates")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
              {telemetry?.totals?.certificates !== undefined ? telemetry.totals.certificates.toLocaleString() : '0'}
            </div>
            <div className="text-[11px] text-brand-200/90 font-medium">{t("QR-Verified Micro-Credentials")}</div>
          </div>
        </div>
      </section>

      {/* Four Seamless Modules Selection Bar - positioned with comfortable spacing below hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#103125] via-[#164433] to-[#0d3b2c] text-white rounded-3xl p-6 sm:p-10 border border-[#1A503E] shadow-2xl">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-3xl mb-8 space-y-2">
            <span className="inline-flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-widest bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
              <Sparkles className="h-3 w-3" />
              <span>{t("Unified National Learning Architecture")}</span>
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight pt-1">
              {t("Four Seamless Modules Powering NDLI Club 2.0")}
            </h2>
            <p className="text-xs sm:text-sm text-brand-200/90 leading-relaxed font-normal">
              {t("Replacing the legacy portal with an enterprise-grade quadruple-branch platform.")}
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
            <div className="glass-card bg-white/[0.06] border border-white/10 p-6 rounded-2xl space-y-3.5 hover:bg-white/[0.09] transition-all">
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black text-sm border border-amber-400/30">
                1
              </div>
              <h3 className="font-bold text-lg text-white">{t("Public Portal & Discovery")}</h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("National discovery, live activity calendars, GIGW 3.0 accessibility, and instant cryptographic certificate verification engine.")}
              </p>
            </div>

            <div 
              onClick={onGoToClubModule}
              className="glass-card bg-white/[0.06] border border-white/10 p-6 rounded-2xl space-y-3.5 cursor-pointer hover-lift hover:bg-white/[0.12] hover:border-amber-400/50 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black text-sm border border-amber-400/30 group-hover:scale-105 transition-transform">
                2
              </div>
              <h3 className="font-bold text-lg text-white flex items-center justify-between">
                <span>{t("Club & Campus Module")}</span>
                <ArrowRight className="h-4 w-4 text-amber-300 group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("Student onboarding via Passkey or Bulk CSV, annual NAAC 3.3 activity logs, grievance ticketing, and the Inter-Club Sharing Shield.")}
              </p>
            </div>

            <div 
              onClick={onGoToAdminModule}
              className="glass-card bg-white/[0.06] border border-white/10 p-6 rounded-2xl space-y-3.5 cursor-pointer hover-lift hover:bg-white/[0.12] hover:border-amber-400/50 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black text-sm border border-amber-400/30 group-hover:scale-105 transition-transform">
                3
              </div>
              <h3 className="font-bold text-lg text-white flex items-center justify-between">
                <span>{t("IIT Kharagpur Admin")}</span>
                <ArrowRight className="h-4 w-4 text-amber-300 group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("6-zone regional governance with 7 officers (EMP01–EMP07), institutional approvals, authority transition sanctioning, and forensic legacy data healing.")}
              </p>
            </div>

            <div 
              onClick={onGoToStudentModule}
              className="glass-card bg-white/[0.06] border border-white/10 p-6 rounded-2xl space-y-3.5 cursor-pointer hover-lift hover:bg-white/[0.12] hover:border-amber-400/50 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black text-sm border border-amber-400/30 group-hover:scale-105 transition-transform">
                4
              </div>
              <h3 className="font-bold text-lg text-white flex items-center justify-between">
                <span>{t("Club Member Module (STUDENT)")}</span>
                <ArrowRight className="h-4 w-4 text-amber-300 group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-xs text-brand-200/80 leading-relaxed">
                {t("Personal learning dashboard for enrolled scholars. Participate in activities, manage disciplinary sub-clubs, and curate digital libraries.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live registry telemetry (chart + accessible table, one payload) */}
      <TelemetrySection data={telemetry} loading={telemetryLoading} failed={telemetryFailed} />

      {/* Directory of Authorized NDLI Clubs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E2ECE7] pb-5">
          <div>
            <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full mb-1">
              <Building2 className="h-3.5 w-3.5" />
              <span>{t("Branch 1: Public Institutional Discovery")}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#103125] tracking-tight">
              {t("National Directory of Approved NDLI Clubs")}
            </h2>
            <p className="text-xs text-[#5A7366] mt-0.5">
              {t("Search approved university and college clubs across India. View public showcase profiles and campus passkeys.")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenDirectory}
              className="px-3.5 py-1.5 rounded-xl border border-[#E2ECE7] bg-white text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] flex items-center space-x-1.5 shadow-2xs"
            >
              <ListTree className="h-3.5 w-3.5 text-[#0D7751]" />
              <span>{t("Institution Registry")}</span>
            </button>
            <button
              onClick={onVerifyCertificates}
              className="px-3.5 py-1.5 rounded-xl border border-[#E2ECE7] bg-white text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] flex items-center space-x-1.5 shadow-2xs"
            >
              <Award className="h-3.5 w-3.5 text-[#0D7751]" />
              <span>{t("Public Certificate Verifier")}</span>
            </button>
            <span className="text-xs font-bold text-[#103125] bg-[#E9F5EF] px-3 py-1.5 rounded-lg border border-[#0D7751]/20">
              {filteredClubs.length} {t("Approved Clubs")}
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
              aria-label={t("Filter by State / UT")}
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
              aria-label={t("Filter by Category")}
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

        {/* Dynamic Auto-Scrolling Row (Unsearched) or Fixed Filtered Grid (Searched) */}
        {!searchTerm.trim() && selectedState === 'All' && selectedCategory === 'All' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#5A7366] px-1">
              <span className="font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t("Dynamic National Roster (Auto-scrolling showcase • Hover to pause • Use search to isolate specific club)")}
              </span>
              <span className="text-[11px] font-mono font-bold bg-[#E9F5EF] text-[#0D7751] px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
                {canonicalClubs.length} {t("Approved Clubs")}
              </span>
            </div>

            <div className="marquee-container relative overflow-hidden py-3">
              {/* Gradient edge masks for smooth fade */}
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#F4F8F6] to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#F4F8F6] to-transparent z-10 pointer-events-none" />

              <div className="marquee-track gap-6 px-4">
                {[...canonicalClubs.slice(0, 14), ...canonicalClubs.slice(0, 14)].map((club, idx) => (
                  <div
                    key={`${club.id}-${idx}`}
                    className="w-80 sm:w-96 shrink-0 bg-white rounded-3xl border border-[#E2ECE7] p-6 shadow-xs hover:shadow-xl hover:border-[#0D7751]/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden card-glow"
                  >
                    {/* Subtle top accent highlight */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-600 via-[#0D7751] to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="space-y-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20">
                          {t("AISHE:")} {club.aisheCode}
                        </span>
                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-brand-800 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                          <CheckCircle2 className="h-3 w-3 text-brand-700" />
                          <span>{t(club.zone)} {t("Zone")}</span>
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-[#103125] group-hover:text-[#1A503E] transition-colors line-clamp-2 leading-snug">
                        {club.name}
                      </h3>

                      <div className="flex items-center space-x-1.5 text-xs text-[#5A7366]">
                        <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span>{club.district}, {club.state}</span>
                      </div>

                      {/* Key authorities snippet */}
                      <div className="text-xs bg-[#F4F8F6] p-3 rounded-xl border border-[#E2ECE7] space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[#5A7366] font-medium">{t("Patron:")}</span>
                          <span className="font-bold text-[#103125] truncate max-w-[170px] text-right">{club.authorities.find(a => a.role === 'Patron')?.name || 'Nodal Head'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#5A7366] font-medium">{t("President:")}</span>
                          <span className="font-bold text-[#103125] truncate max-w-[170px] text-right">{club.authorities.find(a => a.role === 'President')?.name || 'Faculty Advisor'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-[#E2ECE7] flex items-center justify-between">
                      <div className="text-xs text-[#5A7366]">
                        <span className="font-black text-[#103125] text-sm">{club.memberCount.toLocaleString()}</span> {t("Scholars")}
                      </div>

                      <button
                        onClick={() => onSelectClub(club)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#1A503E] bg-[#E9F5EF] hover:bg-[#d5eee0] transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30 cursor-pointer group-hover:border-[#0D7751]"
                      >
                        <span>{t("View Public Profile")}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : filteredClubs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {filteredClubs.map(club => (
              <div
                key={club.id}
                className="bg-white rounded-3xl border border-[#E2ECE7] p-6 shadow-xs hover:shadow-xl hover:border-[#0D7751]/50 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden card-glow"
              >
                {/* Subtle top accent highlight */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-600 via-[#0D7751] to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20">
                      {t("AISHE:")} {club.aisheCode}
                    </span>
                    <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-brand-800 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                      <CheckCircle2 className="h-3 w-3 text-brand-700" />
                      <span>{t(club.zone)} {t("Zone")}</span>
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-[#103125] group-hover:text-[#1A503E] transition-colors line-clamp-2 leading-snug">
                    {club.name}
                  </h3>

                  <div className="flex items-center space-x-1.5 text-xs text-[#5A7366]">
                    <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>{club.district}, {club.state}</span>
                  </div>

                  {/* Key authorities snippet */}
                  <div className="text-xs bg-[#F4F8F6] p-3 rounded-xl border border-[#E2ECE7] space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[#5A7366] font-medium">{t("Patron:")}</span>
                      <span className="font-bold text-[#103125] truncate max-w-[170px] text-right">{club.authorities.find(a => a.role === 'Patron')?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#5A7366] font-medium">{t("President:")}</span>
                      <span className="font-bold text-[#103125] truncate max-w-[170px] text-right">{club.authorities.find(a => a.role === 'President')?.name}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#E2ECE7] flex items-center justify-between">
                  <div className="text-xs text-[#5A7366]">
                    <span className="font-black text-[#103125] text-sm">{club.memberCount.toLocaleString()}</span> {t("Scholars")}
                  </div>

                  <button
                    onClick={() => onSelectClub(club)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#1A503E] bg-[#E9F5EF] hover:bg-[#d5eee0] transition-colors flex items-center space-x-1.5 border border-[#0D7751]/30 cursor-pointer group-hover:border-[#0D7751]"
                  >
                    <span>{t("View Public Profile")}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-[#E2ECE7] p-12 text-center space-y-4">
            <Building2 className="h-12 w-12 text-[#5A7366] mx-auto opacity-50" />
            <h3 className="text-base font-bold text-[#103125]">{t("No institutional chapters found")}</h3>
            <p className="text-xs text-[#5A7366] max-w-md mx-auto">
              {t("No active institutional chapters match your current selection.")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
