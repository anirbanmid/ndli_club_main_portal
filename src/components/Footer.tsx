import React from 'react';
import { BookOpen, ShieldCheck, ExternalLink, Mail, Phone, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Col 1: Initiative info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">NDLI Club Portal 2.0</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              National Digital Library of India (NDLI) is a flagship digital repository initiative of the Ministry of Education, Government of India, executed and coordinated by the Indian Institute of Technology Kharagpur.
            </p>
            <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-md w-fit">
              <ShieldCheck className="h-4 w-4" />
              <span>GIGW 3.0 & CERT-In Compliant Standard</span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Quick Navigation</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#explore" className="hover:text-blue-400 transition-colors">Directory of Registered Clubs</a></li>
              <li><a href="#guidelines" className="hover:text-blue-400 transition-colors">Club Constitution & Guidelines</a></li>
              <li><a href="#naac" className="hover:text-blue-400 transition-colors">NAAC Extension Credit Guidelines</a></li>
              <li><a href="#events" className="hover:text-blue-400 transition-colors">National Reading Calendar 2026</a></li>
              <li><a href="https://ndl.gov.in" target="_blank" rel="noreferrer" className="hover:text-blue-400 inline-flex items-center gap-1">Core NDLI Repository <ExternalLink className="h-3 w-3" /></a></li>
            </ul>
          </div>

          {/* Col 3: Institutional Roles */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Club Governance Hierarchy</h4>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="p-2 rounded bg-slate-800/60 border border-slate-700/60">
                <span className="font-semibold text-slate-200">1. Patron:</span> Head of Institution (VC / Principal)
              </div>
              <div className="p-2 rounded bg-slate-800/60 border border-slate-700/60">
                <span className="font-semibold text-slate-200">2. President:</span> Faculty Coordinator / Librarian
              </div>
              <div className="p-2 rounded bg-slate-800/60 border border-slate-700/60">
                <span className="font-semibold text-slate-200">3. Secretary:</span> Faculty Incharge / NSS Lead
              </div>
              <div className="p-2 rounded bg-slate-800/60 border border-slate-700/60">
                <span className="font-semibold text-slate-200">4. Executive Member:</span> Student Council Lead
              </div>
            </div>
          </div>

          {/* Col 4: Contact & Nodal Office */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Central Nodal Office</h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Central Library, Indian Institute of Technology Kharagpur, Kharagpur, WB 721302</span>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-blue-400 shrink-0" />
                <span>clubsupport@ndl.gov.in</span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Official nodal office phone: [TO CONFIRM]</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-4">
          <p>
            © 2026 National Digital Library of India (NDLI), IIT Kharagpur. Under National Mission on Education through ICT (NMEICT).
          </p>
          <div className="flex space-x-6">
            <span className="text-slate-400">Portal Architecture: Cloud-Native Microservices 2.0</span>
            <span className="text-slate-400">Status: Prototype Demonstration Environment</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
