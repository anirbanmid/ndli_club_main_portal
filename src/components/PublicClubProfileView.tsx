import React, { useState } from 'react';
import QRCode from 'qrcode';
import { 
  Building2, 
  MapPin, 
  Users, 
  Calendar, 
  KeyRound, 
  UserCheck, 
  ShieldCheck, 
  ArrowLeft, 
  ExternalLink,
  Award,
  BookOpen,
  Share2,
  Check,
  Copy,
  Landmark
} from 'lucide-react';
import { InstituteClub, ClubActivity } from '../types';
import { t } from "../i18n";

interface PublicClubProfileViewProps {
  club: InstituteClub;
  activities: ClubActivity[];
  onBack: () => void;
  onOpenClubDashboard: (club: InstituteClub) => void;
  onJoinWithPasskey: (passkey: string) => void;
}

export const PublicClubProfileView: React.FC<PublicClubProfileViewProps> = ({
  club,
  activities,
  onBack,
  onOpenClubDashboard,
  onJoinWithPasskey,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  React.useEffect(() => {
    const joinUrl = `${window.location.origin}?joinPasskey=${club.passkey}`;
    QRCode.toDataURL(joinUrl, {
      width: 140,
      margin: 1,
      color: { dark: '#103125', light: '#ffffff' }
    }).then(setQrDataUrl);
  }, [club]);

  const clubActivities = activities.filter(a => a.clubId === club.id);

  const handleCopyPasskey = () => {
    navigator.clipboard.writeText(club.passkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-[#E2ECE7] shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs font-bold text-[#2E4A3E] hover:text-[#103125] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("Back to National Directory")}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-3 py-1 rounded-full border border-[#0D7751]/20 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("Chartered by IIT Kharagpur (Zone:")} {t(club.zone)})</span>
          </span>

          <button
            onClick={() => onOpenClubDashboard(club)}
            className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
          >
            <Landmark className="h-4 w-4 text-amber-300" />
            <span>{t("Open Club Management Dashboard")}</span>
          </button>
        </div>
      </div>

      {/* Hero Showcase Card */}
      <div className="bg-gradient-to-br from-[#103125] via-[#1A503E] to-[#0A5C3E] rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 p-8 pointer-events-none">
          <Building2 className="h-80 w-80 text-white" />
        </div>

        <div className="relative max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-lg bg-white/10 backdrop-blur-xs text-emerald-200 border border-white/20">
              {t("AISHE Code:")} {club.aisheCode}
            </span>
            <span className="text-xs font-bold px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30">
              {t(club.category)}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 text-emerald-300">
              {t("Established:")} {club.establishedDate}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {club.name}
          </h1>

          <div className="flex items-center space-x-2 text-sm text-emerald-100">
            <MapPin className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{club.district}, {club.state} {t("(Region:")} {t(club.zone)} {t("Zone)")}</span>
          </div>

          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed max-w-2xl">
            {club.description || t("Dedicated campus chapter actively fostering research literacy, open access learning resources, and academic reading initiatives.")}
          </p>

          {club.websiteUrl && (
            <a 
              href={club.websiteUrl} 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs text-amber-300 hover:text-amber-200 font-semibold"
            >
              <span>{t("Visit Official Institution Portal")}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Live Counters Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8 pt-6 border-t border-white/10 max-w-xl text-center">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl">
            <div className="text-2xl font-black text-amber-300">{club.memberCount.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-200 uppercase font-bold">{t("Enrolled Students")}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl">
            <div className="text-2xl font-black text-white">{club.eventsConducted}</div>
            <div className="text-[11px] text-emerald-200 uppercase font-bold">{t("Activities Logged")}</div>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-white/10 backdrop-blur-xs p-3 rounded-xl">
            <div className="text-2xl font-black text-emerald-300">100%</div>
            <div className="text-[11px] text-emerald-200 uppercase font-bold">{t("Verified Quorum")}</div>
          </div>
        </div>
      </div>

      {/* Grid: Passkey Enrollment & 4 Key Authorities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Passkey & QR Enrollment */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-3 py-1 rounded-full">
              <KeyRound className="h-3.5 w-3.5" />
              <span>{t("Student / Scholar Enrollment")}</span>
            </div>
            <h3 className="text-xl font-bold text-[#103125]">
              {t("Join")} {club.name} {t("Chapter")}
                                      </h3>
            <p className="text-xs text-[#5A7366] leading-relaxed">
              {t("If you are an enrolled student or faculty member of this institution, use the official institutional passkey to connect your NDLI account.")}
                                      </p>

            {/* Passkey Banner */}
            <div className="bg-[#F4F8F6] border-2 border-dashed border-[#0D7751]/50 p-4 rounded-2xl text-center space-y-2">
              <div className="text-[11px] font-bold text-[#5A7366] uppercase tracking-wider">
                {t("Official Institutional Passkey")}
                                            </div>
              <div className="font-mono text-2xl font-black text-[#103125] tracking-widest">
                {club.passkey}
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <button
                  onClick={handleCopyPasskey}
                  className="px-3 py-1 rounded-lg bg-white border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#E9F5EF] flex items-center gap-1 shadow-2xs"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#0D7751]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? t("Copied") : t("Copy Key")}</span>
                </button>
                <button
                  onClick={() => onJoinWithPasskey(club.passkey)}
                  className="px-3.5 py-1 rounded-lg bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold shadow-2xs"
                >
                  {t("Join Now")}
                                                  </button>
              </div>
            </div>
          </div>

          {/* QR Code */}
          {qrDataUrl && (
            <div className="pt-4 border-t border-[#E2ECE7] flex items-center space-x-4">
              <img src={qrDataUrl} alt={t("Club QR Code")} className="h-20 w-20 border border-[#E2ECE7] p-1 rounded-xl bg-white shadow-2xs" />
              <div className="text-xs text-[#5A7366]">
                <strong className="text-[#103125] block font-bold">{t("Dynamic Campus QR")}</strong>
                {t("Scan to join chapter directly from your mobile smartphone.")}
                                            </div>
            </div>
          )}
        </div>

        {/* Right: Mandatory 4-Tier Governance Quorum */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-5">
          <div className="border-b border-[#E2ECE7] pb-3 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0D7751]">
                {t("Institutional Governance Quorum")}
                                            </span>
              <h3 className="text-lg font-bold text-[#103125] mt-0.5">
                {t("Official Club Authorities")}
                                            </h3>
            </div>
            <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2.5 py-1 rounded-md">
              {t("4 Roles Verified")}
                                      </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {club.authorities.map(auth => (
              <div key={auth.role} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0D7751] bg-white px-2 py-0.5 rounded border border-[#0D7751]/20">
                    {t(auth.role)}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold">{t("✓ Verified")}</span>
                </div>
                <div className="font-bold text-sm text-[#103125] pt-0.5">{auth.name}</div>
                <div className="text-xs text-[#5A7366]">{t(auth.designation)}</div>
                <div className="text-[11px] font-mono text-[#2E4A3E] pt-1">{auth.email}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#5A7366] italic pt-1">
            {t("* Designated under the Ministry of Education & IIT Kharagpur NDLI Club Charter. Leadership succession requires formal dual-verification.")}
                                </p>
        </div>
      </div>

      {/* Annual Activities & Event Showcase */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2ECE7] pb-4">
          <div>
            <h3 className="text-xl font-bold text-[#103125] flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-[#0D7751]" />
              <span>{t("Campus Co-Curricular & Reading Activities")}</span>
            </h3>
            <p className="text-xs text-[#5A7366] mt-0.5">
              {t("Verified record of workshops, reading marathons, and research webinars conducted by this club.")}
                                      </p>
          </div>

          <span className="text-xs font-bold text-[#1A503E] bg-[#E9F5EF] px-3 py-1.5 rounded-lg border border-[#0D7751]/20">
            {clubActivities.length} {t("Events on Record")}
                                </span>
        </div>

        {clubActivities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clubActivities.map(act => (
              <div key={act.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                      {t(act.category)} • {t(act.mode)}
                    </span>
                    <span className="text-xs font-semibold text-[#5A7366]">{act.date}</span>
                  </div>
                  <h4 className="font-bold text-[#103125] text-sm leading-snug">{act.title}</h4>
                  <p className="text-xs text-[#5A7366] line-clamp-2">{act.description}</p>
                </div>

                <div className="pt-3 border-t border-[#E2ECE7] flex justify-between items-center text-xs text-[#5A7366]">
                  <span>👥 {act.participantsCount.toLocaleString()} {t("Participants")}</span>
                  <span className="text-[#0D7751] font-semibold flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" />
                    <span>{t("Verifiable Certificate")}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-[#F4F8F6] rounded-2xl border border-dashed border-[#E2ECE7] text-xs text-[#5A7366]">
            <BookOpen className="h-8 w-8 text-[#5A7366] mx-auto mb-2 opacity-50" />
            <div>{t("No public activities listed yet for this academic quarter.")}</div>
          </div>
        )}
      </div>
    </div>
  );
};
