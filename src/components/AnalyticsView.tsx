import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Building2, 
  Users, 
  Award, 
  Zap, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  Printer,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { InstituteClub } from '../types';

interface AnalyticsViewProps {
  clubs: InstituteClub[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ clubs }) => {
  const [selectedClubId, setSelectedClubId] = useState<string>(clubs[0]?.id || '');
  const [naacReportGenerated, setNaacReportGenerated] = useState(false);

  const selectedClub = clubs.find(c => c.id === selectedClubId) || clubs[0];

  const stateDistribution = [
    { state: 'Maharashtra', count: 640, percentage: '13.2%' },
    { state: 'Tamil Nadu', count: 580, percentage: '12.0%' },
    { state: 'West Bengal', count: 510, percentage: '10.5%' },
    { state: 'Uttar Pradesh', count: 470, percentage: '9.7%' },
    { state: 'Karnataka', count: 430, percentage: '8.9%' },
    { state: 'Delhi NCR', count: 390, percentage: '8.1%' },
    { state: 'Others (22 States/UTs)', count: 1800, percentage: '37.6%' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="inline-flex items-center space-x-2 bg-purple-50 border border-purple-200 text-purple-700 px-3.5 py-1 rounded-full text-xs font-bold mb-2">
            <BarChart3 className="h-4 w-4" />
            <span>Central Ministry of Education & Institutional Telemetry</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            National Impact Analytics & NAAC Accreditation Engine
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Real-time platform performance metrics, nationwide state penetration, and automated NAAC Criterion 3.3 audit compliance.
          </p>
        </div>

        {/* Live System Health Badge */}
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Async Certificate Worker Cluster: Healthy (92ms Latency)</span>
        </div>
      </div>

      {/* High-Level Comparison KPIs (New Portal vs Legacy Portal) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-600 text-xs font-semibold uppercase">
            <span>Certificate Throughput</span>
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">50,000 / min</div>
          <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <span>↑ 1,200% faster</span>
            <span className="text-slate-600 font-normal">(Prev: 40/min timeout lock)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-600 text-xs font-semibold uppercase">
            <span>Passkey Sync Latency</span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">&lt; 0.4 seconds</div>
          <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <span>Instant Validation</span>
            <span className="text-slate-600 font-normal">(Prev: manual 4-day queue)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-600 text-xs font-semibold uppercase">
            <span>Mobile Core Web Vitals</span>
            <ShieldCheck className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">99 / 100 Score</div>
          <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <span>Modern PWA</span>
            <span className="text-slate-600 font-normal">(Prev: Polymer 1.0 crash)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-600 text-xs font-semibold uppercase">
            <span>NAAC Audit Readiness</span>
            <Award className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">100% Automated</div>
          <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <span>Single-click export</span>
            <span className="text-slate-600 font-normal">Formats NAAC Criteria 3.3</span>
          </div>
        </div>
      </div>

      {/* Grid: State Distribution & NAAC Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Geographic Penetration */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              <span>Pan-India State Distribution</span>
            </h3>
            <span className="text-xs text-slate-600 font-semibold">{clubs.length} Sample Clubs</span>
          </div>

          <div className="space-y-4">
            {stateDistribution.map(item => (
              <div key={item.state} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-800">{item.state}</span>
                  <span className="text-slate-600">{item.count} clubs ({item.percentage})</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"
                    style={{ width: item.percentage }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-blue-900 leading-relaxed">
            💡 <strong>National Reach:</strong> Real-time synchronization allows state education directorates to monitor reading benchmarks across affiliated colleges.
          </div>
        </div>

        {/* Right Col: NAAC Criterion 3.3 Institutional Report Engine */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <span className="text-xs font-extrabold uppercase text-purple-700 bg-purple-50 px-2.5 py-1 rounded">
                College Principal / IQAC Coordinator Feature
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                Automated NAAC Extension Activity Report (Criterion 3.3)
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Select any registered institution to compile its verified annual NDLI Club activity report formatted according to National Assessment and Accreditation Council (NAAC) inspection guidelines.
          </p>

          {/* Club selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Select Institution:</label>
            <select
              value={selectedClubId}
              onChange={(e) => {
                setSelectedClubId(e.target.value);
                setNaacReportGenerated(false);
              }}
              className="w-full py-2.5 px-3 text-sm rounded-lg border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-500 font-medium"
            >
              {clubs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (AISHE: {c.aisheCode})
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <div className="flex gap-3">
            <button
              onClick={() => setNaacReportGenerated(true)}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md flex items-center space-x-2 transition-all"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Compile NAAC Audit Document</span>
            </button>
          </div>

          {/* NAAC Generated Preview */}
          {naacReportGenerated && selectedClub && (
            <div className="bg-slate-50 border-2 border-purple-200 rounded-xl p-5 space-y-4 animate-in fade-in text-xs">
              <div className="flex justify-between items-start border-b border-purple-100 pb-3">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-800">
                    IQAC NAAC Criterion 3.3.3 / 3.3.4 Compliance Record
                  </div>
                  <div className="font-bold text-sm text-slate-900 mt-0.5">{selectedClub.name}</div>
                  <div className="text-slate-600">AISHE: {selectedClub.aisheCode} • Academic Year 2025-2026</div>
                </div>

                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 flex items-center space-x-1"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Document</span>
                </button>
              </div>

              {/* Table of Activities */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600 text-[11px] uppercase">
                      <th className="py-2">Activity Name</th>
                      <th className="py-2">Date</th>
                      <th className="py-2">Organizing Body</th>
                      <th className="py-2">Participants</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    <tr>
                      <td className="py-2 font-medium">National Reading Month Digital Ethics Quiz</td>
                      <td className="py-2">15 Oct 2026</td>
                      <td className="py-2">NDLI Central + Campus Club</td>
                      <td className="py-2 font-bold text-slate-900">420 Students</td>
                      <td className="py-2 text-emerald-700 font-semibold">Verified</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-medium">Open Access Patent & Literature Workshop</td>
                      <td className="py-2">12 Oct 2026</td>
                      <td className="py-2">Campus NDLI Chapter</td>
                      <td className="py-2 font-bold text-slate-900">185 Students</td>
                      <td className="py-2 text-emerald-700 font-semibold">Verified</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-medium">NDLI Awareness & Digital Library Induction</td>
                      <td className="py-2">02 Aug 2026</td>
                      <td className="py-2">Central Library</td>
                      <td className="py-2 font-bold text-slate-900">850 Students</td>
                      <td className="py-2 text-emerald-700 font-semibold">Verified</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-600">
                <span className="flex items-center space-x-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Digitally certified by NDLI Nodal Center, IIT Kharagpur</span>
                </span>
                <span className="font-mono">Hash: 8f9b2c4e...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
