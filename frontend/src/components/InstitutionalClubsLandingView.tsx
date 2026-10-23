import React, { useState } from 'react';
import { 
  Building2, 
  Search, 
  MapPin, 
  Users, 
  Calendar, 
  CheckCircle2, 
  ArrowRight, 
  Lock, 
  Landmark, 
  GraduationCap, 
  LogIn, 
  ShieldCheck, 
  Filter,
  X
} from 'lucide-react';
import { InstituteClub, RegionalZone } from '../types';
import { t } from '../i18n';

interface InstitutionalClubsLandingViewProps {
  clubs: InstituteClub[];
  onSelectClub: (club: InstituteClub) => void;
  onManageClub: (club: InstituteClub) => void;
  onAuthoritySignIn: () => void;
  onBackToLanding: () => void;
}

export const InstitutionalClubsLandingView: React.FC<InstitutionalClubsLandingViewProps> = ({
  clubs,
  onSelectClub,
  onManageClub,
  onAuthoritySignIn,
  onBackToLanding,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedZone, setSelectedZone] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Filter only active chartered clubs
  const activeClubs = clubs.filter(c => c.status === 'Active');

  // Unique filter sets
  const states = ['All', ...Array.from(new Set(activeClubs.map(c => c.state))).sort()];
  const zones: ('All' | RegionalZone)[] = ['All', 'North', 'Central', 'West', 'East', 'North East', 'South'];
  const categories = ['All', 'University', 'College', 'Autonomous Institute', 'School'];

  const filteredClubs = activeClubs.filter(club => {
    const matchesSearch = 
      club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.aisheCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.district.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = selectedState === 'All' || club.state === selectedState;
    const matchesZone = selectedZone === 'All' || club.zone === selectedZone;
    const matchesCategory = selectedCategory === 'All' || club.category === selectedCategory;
    return matchesSearch && matchesState && matchesZone && matchesCategory;
  });

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedState('All');
    setSelectedZone('All');
    setSelectedCategory('All');
  };

  const hasActiveFilters = searchTerm !== '' || selectedState !== 'All' || selectedZone !== 'All' || selectedCategory !== 'All';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-[#103125] via-[#1A503E] to-[#0A5C3E] rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 p-8 pointer-events-none">
          <GraduationCap className="h-72 w-72 text-white" />
        </div>

        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 bg-white/10 border border-white/20 px-3 py-1 rounded-full text-xs font-bold text-brand-200 backdrop-blur-xs">
            <Building2 className="h-3.5 w-3.5 text-amber-300" />
            <span>{t("Module 2: Institutional Club Module (CAMPUS)")}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {t("National Institutional Chapter Network")}
          </h1>

          <p className="text-xs sm:text-sm text-brand-100/90 leading-relaxed max-w-2xl">
            {t("Explore chartered NDLI club chapters across Indian universities, colleges, and institutes. Select a campus chapter to view its public governance and activities, or sign in as an appointed authority to enter your institutional management dashboard.")}
          </p>
        </div>

        {/* Authority Fast-Track Sign In Ribbon */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{t("Appointed Club Authorities (Patron, President, Secretary, Executive Member)")}</div>
              <div className="text-[11px] text-brand-200">{t("Access your club's operational desk, manage student rosters, and log campus events.")}</div>
            </div>
          </div>

          <button
            onClick={onAuthoritySignIn}
            className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-ink-950 text-xs font-bold shadow-md transition-all flex items-center space-x-2 shrink-0 cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>{t("Club Authority Sign In")}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-[#0D7751]" />
            <h2 className="text-sm font-bold text-[#103125]">
              {t("Filter Institutional Chapters")}
            </h2>
            <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-0.5 rounded-full border border-[#0D7751]/20">
              {filteredClubs.length} {t("of")} {activeClubs.length} {t("Chapters")}
            </span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-[#B45309] hover:text-[#92400E] flex items-center space-x-1"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t("Clear Filters")}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-1">
          {/* Text search */}
          <div className="sm:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5A7366]" />
            <input
              type="text"
              placeholder={t("Search institution name, AISHE code (e.g. U-0570), or city...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751] focus:outline-hidden"
            />
          </div>

          {/* State filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              aria-label={t("Filter by State")}
              className="w-full py-2 px-3 text-xs rounded-xl border border-[#E2ECE7] bg-white text-[#103125] font-semibold focus:ring-2 focus:ring-[#0D7751]"
            >
              {states.map(st => (
                <option key={st} value={st}>
                  {st === 'All' ? t("All States / UTs") : `${t("State:")} ${st}`}
                </option>
              ))}
            </select>
          </div>

          {/* Zone filter */}
          <div className="sm:col-span-2">
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              aria-label={t("Filter by Zone")}
              className="w-full py-2 px-3 text-xs rounded-xl border border-[#E2ECE7] bg-white text-[#103125] font-semibold focus:ring-2 focus:ring-[#0D7751]"
            >
              {zones.map(zn => (
                <option key={zn} value={zn}>
                  {zn === 'All' ? t("All Zones") : `${t(zn)} ${t("Zone")}`}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label={t("Filter by Category")}
              className="w-full py-2 px-3 text-xs rounded-xl border border-[#E2ECE7] bg-white text-[#103125] font-semibold focus:ring-2 focus:ring-[#0D7751]"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? t("All Categories") : `${t("Category:")} ${t(cat)}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Clubs Cards Grid */}
      {filteredClubs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClubs.map(club => (
            <div
              key={club.id}
              className="bg-white rounded-3xl border border-[#E2ECE7] p-6 shadow-xs hover:shadow-md hover:border-[#0D7751]/60 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                {/* Badges */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[#E9F5EF] text-[#0D7751] border border-[#0D7751]/20 font-mono">
                    {t("AISHE:")} {club.aisheCode}
                  </span>
                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-brand-800 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                    <CheckCircle2 className="h-3 w-3 text-brand-700" />
                    <span>{t(club.zone)} {t("Zone")}</span>
                  </span>
                </div>

                {/* Club / Institute Name */}
                <h3 className="font-bold text-base text-[#103125] group-hover:text-[#1A503E] transition-colors line-clamp-2">
                  {club.name}
                </h3>

                {/* Location */}
                <div className="flex items-center space-x-1.5 text-xs text-[#5A7366]">
                  <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>{club.district}, {club.state}</span>
                </div>

                {/* Key authorities snippet */}
                <div className="text-xs bg-[#F4F8F6] p-3 rounded-xl border border-[#E2ECE7] space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-[#5A7366] font-medium">{t("Patron:")}</span>
                    <span className="font-bold text-[#103125] truncate max-w-[160px]">{club.authorities.find(a => a.role === 'Patron')?.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-[#5A7366] font-medium">{t("President:")}</span>
                    <span className="font-bold text-[#103125] truncate max-w-[160px]">{club.authorities.find(a => a.role === 'President')?.name}</span>
                  </div>
                </div>

                {/* Summary counts */}
                <div className="grid grid-cols-2 gap-2 text-center pt-1">
                  <div className="bg-[#F4F8F6] p-2 rounded-lg border border-[#E2ECE7]">
                    <div className="text-sm font-extrabold text-[#103125]">{club.memberCount.toLocaleString()}</div>
                    <div className="text-[10px] text-[#5A7366] font-medium uppercase">{t("Enrolled")}</div>
                  </div>
                  <div className="bg-[#F4F8F6] p-2 rounded-lg border border-[#E2ECE7]">
                    <div className="text-sm font-extrabold text-[#0D7751]">{club.eventsConducted}</div>
                    <div className="text-[10px] text-[#5A7366] font-medium uppercase">{t("Activities")}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-[#E2ECE7] flex flex-col sm:flex-row items-center gap-2">
                <button
                  onClick={() => onSelectClub(club)}
                  className="w-full sm:w-1/2 px-3 py-2 rounded-xl text-xs font-bold text-[#1A503E] bg-[#E9F5EF] hover:bg-[#d5eee0] transition-colors flex items-center justify-center space-x-1.5 border border-[#0D7751]/30 cursor-pointer"
                >
                  <span>{t("Public Profile")}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => onManageClub(club)}
                  className="w-full sm:w-1/2 px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#1A503E] hover:bg-[#103125] transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 text-amber-300" />
                  <span>{t("Manage Club")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E2ECE7] p-12 text-center space-y-4">
          <Building2 className="h-12 w-12 text-[#5A7366] mx-auto opacity-50" />
          <h3 className="text-base font-bold text-[#103125]">{t("No institutional chapters match your filters")}</h3>
          <p className="text-xs text-[#5A7366] max-w-md mx-auto">
            {t("Try clearing your search query or selecting a different state or zone from the filter options above.")}
          </p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 rounded-xl bg-[#0D7751] hover:bg-[#103125] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            {t("Reset All Filters")}
          </button>
        </div>
      )}
    </div>
  );
};
