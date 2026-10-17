import React from 'react';
import { BookOpen, ShieldCheck, ExternalLink, Mail, Phone, MapPin } from 'lucide-react';
import { t } from "../i18n";

/* S5: footer re-toned into the brand system — deep brand green field,
   gold (complementary) headings/accents, ink-tinted body text. */
export const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-b from-ink-950 to-brand-950 text-ink-300 pt-12 pb-8 border-t-2 border-accent-500/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Col 1: Initiative info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 ring-1 ring-accent-400/40 flex items-center justify-center text-white font-bold shadow-md">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">{t("NDLI Club Portal 2.0")}</span>
            </div>
            <p className="text-xs text-ink-300/90 leading-relaxed">
              {t("National Digital Library of India (NDLI) is a flagship digital repository initiative of the Ministry of Education, Government of India, executed and coordinated by the Indian Institute of Technology Kharagpur.")}
                                      </p>
            <div className="flex items-center space-x-2 text-xs text-accent-300 bg-accent-400/10 border border-accent-400/25 px-3 py-1.5 rounded-md w-fit">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("GIGW 3.0 & CERT-In Compliant Standard")}</span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h4 className="text-xs font-bold text-accent-300 uppercase tracking-wider mb-4">{t("Quick Navigation")}</h4>
            <ul className="space-y-2.5 text-xs text-ink-300 leading-relaxed">
              <li><a href="#explore" className="hover:text-accent-300 transition-colors">{t("Directory of Registered Clubs")}</a></li>
              <li><a href="#guidelines" className="hover:text-accent-300 transition-colors">{t("Club Constitution & Guidelines")}</a></li>
              <li><a href="#naac" className="hover:text-accent-300 transition-colors">{t("NAAC Extension Credit Guidelines")}</a></li>
              <li><a href="#events" className="hover:text-accent-300 transition-colors">{t("National Reading Calendar 2026")}</a></li>
              <li><a href="https://ndl.gov.in" target="_blank" rel="noreferrer" className="hover:text-accent-300 inline-flex items-center gap-1">{t("Core NDLI Repository")} <ExternalLink className="h-3 w-3" /></a></li>
            </ul>
          </div>

          {/* Col 3: Institutional Roles */}
          <div>
            <h4 className="text-xs font-bold text-accent-300 uppercase tracking-wider mb-4">{t("Club Governance Hierarchy")}</h4>
            <div className="space-y-2.5 text-xs text-ink-300 leading-relaxed">
              <div className="p-2 rounded-lg bg-white/[0.05] border border-white/10">
                <span className="font-semibold text-white">{t("1. Patron:")}</span> {t("Head of Institution (VC / Principal)")}
                                            </div>
              <div className="p-2 rounded-lg bg-white/[0.05] border border-white/10">
                <span className="font-semibold text-white">{t("2. President:")}</span> {t("Faculty Coordinator / Librarian")}
                                            </div>
              <div className="p-2 rounded-lg bg-white/[0.05] border border-white/10">
                <span className="font-semibold text-white">{t("3. Secretary:")}</span> {t("Faculty Incharge / NSS Lead")}
                                            </div>
              <div className="p-2 rounded-lg bg-white/[0.05] border border-white/10">
                <span className="font-semibold text-white">{t("4. Executive Member:")}</span> {t("Student Council Lead")}
                                            </div>
            </div>
          </div>

          {/* Col 4: Contact & Nodal Office */}
          <div>
            <h4 className="text-xs font-bold text-accent-300 uppercase tracking-wider mb-4">{t("Central Nodal Office")}</h4>
            <ul className="space-y-3 text-xs text-ink-300 leading-relaxed">
              <li className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-accent-400 shrink-0 mt-0.5" />
                <span>{t("Central Library, Indian Institute of Technology Kharagpur, Kharagpur, WB 721302")}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-accent-400 shrink-0" />
                <span>{t("clubsupport@ndl.gov.in")}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-accent-400 shrink-0" />
                <span>{t("Official nodal office phone: [TO CONFIRM]")}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center text-xs text-ink-400 gap-4">
          <p>
            {t("© 2026 National Digital Library of India (NDLI), IIT Kharagpur. Under National Mission on Education through ICT (NMEICT).")}
                                </p>
          <div className="flex space-x-6">
            <span>{t("Portal Architecture: Cloud-Native Microservices 2.0")}</span>
            <span>{t("Status: Prototype Demonstration Environment")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
