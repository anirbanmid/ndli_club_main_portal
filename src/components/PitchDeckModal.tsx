import React, { useState } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Presentation, 
  CheckCircle2, 
  Zap, 
  ShieldCheck, 
  TrendingUp, 
  Layers, 
  Clock, 
  ExternalLink,
  Building2,
  Award
} from 'lucide-react';

interface PitchDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchDemo: () => void;
}

export const PitchDeckModal: React.FC<PitchDeckModalProps> = ({
  isOpen,
  onClose,
  onLaunchDemo,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const slides = [
    {
      title: "Re-energizing the NDLI Club Ecosystem",
      subtitle: "A Turnkey, High-Performance Solution for IIT Kharagpur & Ministry of Education",
      badge: "SLIDE 1 OF 6: STRATEGIC VISION",
      content: (
        <div className="space-y-6 text-slate-800">
          <p className="text-sm leading-relaxed text-slate-600">
            The National Digital Library of India (NDLI) holds over <strong>90+ Million academic resources</strong>. The NDLI Club is the indispensable grass-roots engine designed to bring this treasure to millions of students across 4,800+ colleges and schools.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
              <span className="font-bold text-blue-900 block text-sm">The Strategic Stakes</span>
              <p className="text-slate-600">The portal is the frontline interface for India's digital reading mission under NEP 2020.</p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <span className="font-bold text-amber-900 block text-sm">The Present Impasse</span>
              <p className="text-slate-600">The 2018 legacy portal is malfunctioning, and internal development has stalled for months.</p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <span className="font-bold text-emerald-900 block text-sm">Our Turnkey Solution</span>
              <p className="text-slate-600">A tested, production-ready primary product ready for immediate deployment on IIT KGP infrastructure.</p>
            </div>
          </div>

          <div className="bg-slate-900 text-white p-4 rounded-xl text-xs space-y-1">
            <div className="text-amber-400 font-bold uppercase tracking-wider">Executive Recommendation</div>
            <p className="text-slate-300">
              Contract our specialized engineering team to deliver the portal in 60 days, eliminating reputational risk and restoring service to thousands of colleges nationwide.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Root-Cause Technical Diagnosis",
      subtitle: "Why the Legacy Portal (club.ndl.iitkgp.ac.in) Breaks Down",
      badge: "SLIDE 2 OF 6: TECHNICAL AUDIT",
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-slate-700">
          <p className="text-xs text-slate-500">
            A comprehensive architectural audit of the current portal reveals deep structural debt that cannot be patched via incremental maintenance:
          </p>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3">
              <span className="h-6 w-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <div>
                <strong className="text-rose-950 block text-xs font-bold">Obsolete Frontend Framework (Vaadin / Polymer 1.0)</strong>
                <p className="text-xs text-slate-600 mt-0.5">Built on 2018-era Web Components polyfills that modern browsers (Chromium 120+, Safari) actively throttle or break, rendering mobile access erratic.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3">
              <span className="h-6 w-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <div>
                <strong className="text-rose-950 block text-xs font-bold">Synchronous PDF Certificate Bottleneck</strong>
                <p className="text-xs text-slate-600 mt-0.5">During national reading months, 10,000+ students attempt to claim certificates simultaneously. The legacy server attempts to render heavy PDFs in-thread, causing database locks and complete gateway crashes.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3">
              <span className="h-6 w-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
              <div>
                <strong className="text-rose-950 block text-xs font-bold">Rigid 4-Authority Verification Gridlock</strong>
                <p className="text-xs text-slate-600 mt-0.5">The mandatory 4-tier onboarding (Patron, President, Secretary, Executive) lacked automated domain matching or asynchronous fallback, leaving hundreds of colleges stuck in limbo.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Global Benchmarks & Architectural Synthesis",
      subtitle: "Adopting Proven Best-Practices from Global & Indian Giants",
      badge: "SLIDE 3 OF 6: BENCHMARKS",
      content: (
        <div className="space-y-4 text-xs sm:text-sm">
          <p className="text-xs text-slate-500">
            We systematically analyzed the world’s most successful campus chapter management engines:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                <span>Bevy (GDSC / Figma)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Adopted their <strong>hierarchical chapter governance model</strong> (HQ Admin → Chapter Lead → Event Host) and automated attendee headcounts.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                <span>CampusGroups (MIT / Stanford)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Integrated <strong>co-curricular tracking and automated accreditation reports</strong> for college principals (tailored for NAAC Criterion 3.3).
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-600"></span>
                <span>Unstop / HackerEarth</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Implemented their <strong>asynchronous vector certificate issuance engine</strong> with public QR verification and LinkedIn sharing.
              </p>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-medium">
            ✓ <strong>Result:</strong> NDLI Club 2.0 combines the institutional rigor of higher education with the velocity of modern ed-tech.
          </div>
        </div>
      )
    },
    {
      title: "Zero-Downtime Target Architecture",
      subtitle: "Engineered for 100,000+ Concurrent Nationwide Participants",
      badge: "SLIDE 4 OF 6: ARCHITECTURE",
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-slate-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 font-bold text-blue-900">
              Next.js 14 / React
              <span className="block text-[10px] font-normal text-slate-500">PWA & Fast Edge CDN</span>
            </div>
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 font-bold text-indigo-900">
              Go / Node Services
              <span className="block text-[10px] font-normal text-slate-500">Microsecond API Core</span>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 font-bold text-amber-900">
              Redis + BullMQ
              <span className="block text-[10px] font-normal text-slate-500">50k Certs/Min Queue</span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 font-bold text-emerald-900">
              PostgreSQL 16
              <span className="block text-[10px] font-normal text-slate-500">Read-Replica Scale</span>
            </div>
          </div>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs space-y-2 font-mono">
            <div className="text-amber-400 font-bold">// Security & Government Compliance</div>
            <div>• GIGW 3.0 (Guidelines for Indian Government Websites) Compliant</div>
            <div>• WCAG 2.1 AA Accessibility (Screen reader + High Contrast)</div>
            <div>• CERT-In Audit Ready (OWASP Top 10 hardened, parameterized SQL, strict RBAC)</div>
            <div>• Ready for NIC Cloud / MeghRaj or IIT Kharagpur On-Premise VM Cluster</div>
          </div>
        </div>
      )
    },
    {
      title: "Comprehensive 120-Day Turnkey Roadmap",
      subtitle: "Forensic Salvage, Staged Migration & 85-Day Accelerated Fast-Track",
      badge: "SLIDE 5 OF 6: RISK MITIGATION & TIMELINE",
      content: (
        <div className="space-y-3.5 text-xs sm:text-sm text-slate-700">
          <p className="text-xs text-slate-500">
            A battle-tested 16-week delivery roadmap ensuring institutional rigor with an accelerated target:
          </p>

          <div className="space-y-2">
            <div className="flex items-center space-x-3 p-2.5 bg-white border border-slate-200 rounded-xl">
              <span className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">D1-25</span>
              <div>
                <strong className="text-xs text-slate-900 block font-bold">Forensic Salvage & Schema Reconstruction</strong>
                <span className="text-[11px] text-slate-500">Airgapped offline dump, fuzzy AISHE matching, and personal email relational mapping.</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2.5 bg-white border border-slate-200 rounded-xl">
              <span className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">D26-55</span>
              <div>
                <strong className="text-xs text-slate-900 block font-bold">Enterprise Backend & 3-Branch Deployment</strong>
                <span className="text-[11px] text-slate-500">Deploy 3 branches, 7-zone governance (EMP01-EMP07), and Inter-Institutional Sharing Shield.</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2.5 bg-white border border-slate-200 rounded-xl">
              <span className="h-6 w-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">D56-80</span>
              <div>
                <strong className="text-xs text-slate-900 block font-bold">Data Cleansing & Dry-Run Ingestion</strong>
                <span className="text-[11px] text-slate-500">100% historical clubs, student profiles, past webinars, and cryptographic certificate verification.</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2.5 bg-white border border-slate-200 rounded-xl">
              <span className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">D81-120</span>
              <div>
                <strong className="text-xs text-slate-900 block font-bold">100-Club Regional Pilot (UAT) & National Go-Live</strong>
                <span className="text-[11px] text-slate-500">CERT-In security audit, 50k concurrent stress test, zero-downtime cutover. (Fast-track target: Day 85).</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Why Award the Contract to Us?",
      subtitle: "A Low-Risk, High-Certainty Partnership for IIT Kharagpur",
      badge: "SLIDE 6 OF 6: COMMERCIALS & VALUE",
      content: (
        <div className="space-y-6 text-xs sm:text-sm text-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Without Our Solution</span>
              <ul className="space-y-1 text-slate-500 text-xs list-disc pl-4">
                <li>Internal team continues to face multi-month backlogs</li>
                <li>Attempting to patch dead 2018 Polymer framework traps resources</li>
                <li>Mounting complaints from college principals & students</li>
                <li>Risk of permanent historical data corruption</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <span className="font-bold text-emerald-900 block text-xs">With Our Contract</span>
              <ul className="space-y-1 text-emerald-800 text-xs list-disc pl-4">
                <li>Working primary product prototype verified today</li>
                <li>Forensic data salvage guarantees zero historical data loss</li>
                <li>120-day phased rollout with 85-day fast-track delivery</li>
                <li>NAAC 3.3.3 accreditation engine provides immediate college buy-in</li>
                <li>7-zone regional governance architecture (EMP01-EMP07) ready</li>
              </ul>
            </div>
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => {
                onClose();
                onLaunchDemo();
              }}
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-sm shadow-xl hover:scale-105 transition-all inline-flex items-center space-x-2"
            >
              <span>Explore Live Primary Product Demo</span>
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
      )
    }
  ];

  const current = slides[currentSlide];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in flex flex-col justify-between min-h-[520px]">
        {/* Top Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              <Presentation className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {current.badge}
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                {current.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Slide Content Area */}
        <div className="py-6 grow">
          <div className="text-xs text-slate-400 font-semibold mb-3">
            {current.subtitle}
          </div>
          {current.content}
        </div>

        {/* Bottom Navigation */}
        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
          <button
            disabled={currentSlide === 0}
            onClick={() => setCurrentSlide(currentSlide - 1)}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          {/* Dots */}
          <div className="flex space-x-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-2 rounded-full transition-all ${
                  currentSlide === i ? 'w-6 bg-blue-600' : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <button
            disabled={currentSlide === slides.length - 1}
            onClick={() => setCurrentSlide(currentSlide + 1)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1 shadow-xs"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
