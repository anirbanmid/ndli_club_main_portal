import React, { useState } from 'react';
import { 
  Landmark, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Users, 
  Building2, 
  LifeBuoy, 
  ShieldCheck, 
  Database, 
  Filter, 
  Search, 
  Check, 
  Clock, 
  FileText, 
  ExternalLink,
  Lock,
  Zap,
  ArrowRight
} from 'lucide-react';
import { 
  InstituteClub, 
  EmployeeNode, 
  IssueTicket, 
  AuthorityChangeRequest, 
  ForensicQuarantineRecord,
  RegionalZone
} from '../types';

interface AdminModuleViewProps {
  clubs: InstituteClub[];
  employees: EmployeeNode[];
  tickets: IssueTicket[];
  authorityRequests: AuthorityChangeRequest[];
  forensicRecords: ForensicQuarantineRecord[];
  onApproveClub: (clubId: string) => void;
  onRejectClub: (clubId: string) => void;
  onResolveTicket: (ticketId: string, notes: string) => void;
  onApproveAuthorityChange: (reqId: string) => void;
  onHealForensicRecord: (recordId: string) => void;
}

export const AdminModuleView: React.FC<AdminModuleViewProps> = ({
  clubs,
  employees,
  tickets,
  authorityRequests,
  forensicRecords,
  onApproveClub,
  onRejectClub,
  onResolveTicket,
  onApproveAuthorityChange,
  onHealForensicRecord,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [adminTab, setAdminTab] = useState<'approvals' | 'tickets' | 'succession' | 'migration' | 'zones'>('approvals');

  const pendingClubs = clubs.filter(c => c.status === 'Pending Verification');
  const activeClubs = clubs.filter(c => c.status === 'Active');

  const filteredPending = pendingClubs.filter(c => selectedZone === 'All' || c.zone === selectedZone);
  const filteredTickets = tickets.filter(t => selectedZone === 'All' || t.zone === selectedZone);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Top Admin Header */}
      <div className="bg-[#103125] text-white p-5 sm:p-7 rounded-3xl border border-[#1A503E] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-[#0D7751] text-emerald-100 text-[11px] font-black px-2.5 py-0.5 rounded-full border border-emerald-400/30">
              IIT KHARAGPUR NODAL COMMAND
            </span>
            <span className="text-xs text-amber-300 font-semibold">
              6-Zone National Governance Core
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Central Administration & Regional Management Desk
          </h1>

          <p className="text-xs text-emerald-200/90 max-w-2xl">
            Coordinating club charter approvals, regional support desk dispatches (EMP01–EMP07), institutional authority transitions, and legacy data healing.
          </p>
        </div>

        {/* Telemetry Pills */}
        <div className="grid grid-cols-2 gap-3 text-center shrink-0">
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-xs">
            <div className="text-2xl font-black text-amber-300">{pendingClubs.length}</div>
            <div className="text-[11px] text-emerald-200 uppercase font-bold">Pending Approvals</div>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-xs">
            <div className="text-2xl font-black text-white">{tickets.filter(t => t.status !== 'Resolved').length}</div>
            <div className="text-[11px] text-emerald-200 uppercase font-bold">Active Tickets</div>
          </div>
        </div>
      </div>

      {/* Zone Selector & Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-3 rounded-2xl border border-[#E2ECE7] shadow-xs">
        {/* Navigation Desks */}
        <div className="tab-scroll flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setAdminTab('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'approvals' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Club Approvals ({pendingClubs.length})</span>
          </button>

          <button
            onClick={() => setAdminTab('tickets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'tickets' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <LifeBuoy className="h-4 w-4" />
            <span>Grievance Desk ({tickets.filter(t => t.status !== 'Resolved').length})</span>
          </button>

          <button
            onClick={() => setAdminTab('succession')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'succession' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>Authority Succession ({authorityRequests.length})</span>
          </button>

          <button
            onClick={() => setAdminTab('migration')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'migration' ? 'bg-[#B45309] text-white shadow-xs' : 'text-[#B45309] hover:bg-amber-50'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>Forensic Migration Desk</span>
            <span className="bg-white text-[#B45309] text-[11px] px-1 rounded font-black">Legacy Data Healing</span>
          </button>

          <button
            onClick={() => setAdminTab('zones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              adminTab === 'zones' ? 'bg-[#1A503E] text-white shadow-xs' : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
            }`}
          >
            <Landmark className="h-4 w-4" />
            <span>7 Regional Officers</span>
          </button>
        </div>

        {/* Regional Zone Filter */}
        <div className="flex items-center space-x-2 text-xs self-end sm:self-auto">
          <Filter className="h-3.5 w-3.5 text-[#5A7366]" />
          <span className="font-semibold text-[#5A7366]">Zone:</span>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="text-xs font-bold text-[#103125] bg-[#F4F8F6] border border-[#E2ECE7] rounded-lg px-2.5 py-1.5 shadow-xs hover:border-[#0D7751]/40 focus:outline-hidden focus:ring-2 focus:ring-[#0D7751]/25 transition-colors"
          >
            <option value="All">All 6 Zones</option>
            <option value="North">North Zone (EMP01)</option>
            <option value="Central">Central Zone (EMP02)</option>
            <option value="West">West Zone (EMP03)</option>
            <option value="East">East Zone (EMP04)</option>
            <option value="North East">North East Zone (EMP05)</option>
            <option value="South">South Zone (EMP06 • EMP07)</option>
          </select>
        </div>
      </div>

      {/* DESK 1: Club Registration Approvals */}
      {adminTab === 'approvals' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-[#103125]">
                Pending Institutional Onboarding Requests
              </h3>
              <p className="text-xs text-[#5A7366]">
                Review 4-tier institutional quorum, verify AISHE registration, and grant official charter with unique passkey.
              </p>
            </div>
            <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-3 py-1 rounded-full">
              {filteredPending.length} Awaiting Verification
            </span>
          </div>

          {filteredPending.length > 0 ? (
            <div className="space-y-4">
              {filteredPending.map(club => (
                <div key={club.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                          AISHE: {club.aisheCode}
                        </span>
                        <span className="text-xs font-semibold text-[#5A7366]">
                          Zone: <strong>{club.zone}</strong> • {club.district}, {club.state}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-[#103125] mt-1">{club.name}</h4>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onRejectClub(club.id)}
                        className="px-3.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all"
                      >
                        Request Revision
                      </button>
                      <button
                        onClick={() => onApproveClub(club.id)}
                        className="px-4 py-1.5 rounded-lg bg-[#0D7751] hover:bg-[#0a5c3e] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Approve Charter & Issue Passkey</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Authorities Quorum Check */}
                  <div className="pt-2 border-t border-[#E2ECE7]">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5A7366] block mb-2">
                      Submitted 4-Tier Authority Quorum
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {club.authorities.map(a => (
                        <div key={a.role} className="p-2.5 rounded-lg bg-white border border-[#E2ECE7]">
                          <span className="text-[11px] font-bold text-[#0D7751] uppercase">{a.role}</span>
                          <div className="font-bold text-[#103125]">{a.name}</div>
                          <div className="text-[11px] text-[#5A7366]">{a.designation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-[#5A7366]">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-bold text-[#103125]">All Institutional Requests Cleared</h4>
              <p>No clubs pending verification in the selected zone.</p>
            </div>
          )}
        </div>
      )}

      {/* DESK 2: Grievance & SLA Dispatch Desk */}
      {adminTab === 'tickets' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-[#103125]">
                National Grievance & SLA Dispatch Desk
              </h3>
              <p className="text-xs text-[#5A7366]">
                Issues raised by college coordinators dispatched to regional employee nodes (EMP01–EMP07).
              </p>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
              {filteredTickets.filter(t => t.status !== 'Resolved').length} Unresolved Issues
            </span>
          </div>

          <div className="space-y-3">
            {filteredTickets.map(tkt => (
              <div key={tkt.id} className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-2 text-xs">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-[#103125] bg-white px-2 py-0.5 rounded border border-[#E2ECE7]">
                      {tkt.id}
                    </span>
                    <span className="font-bold text-[#103125]">{tkt.clubName}</span>
                    <span className="text-[#5A7366]">({tkt.zone} Zone)</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      tkt.priority === 'Critical' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {tkt.priority} Priority
                    </span>
                  </div>

                  {tkt.status !== 'Resolved' ? (
                    <button
                      onClick={() => {
                        const notes = prompt('Enter resolution summary for college:', 'Verified and resolved by central engineering desk.');
                        if (notes) onResolveTicket(tkt.id, notes);
                      }}
                      className="px-3 py-1 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs"
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ Resolved
                    </span>
                  )}
                </div>

                <div className="font-bold text-[#103125]">{tkt.title}</div>
                <p className="text-[#5A7366]">{tkt.description}</p>

                <div className="pt-2 border-t border-[#E2ECE7] flex justify-between items-center text-[11px] text-[#5A7366]">
                  <span>Category: {tkt.category} • Assigned Node: {tkt.assignedTo}</span>
                  {tkt.resolutionNotes && (
                    <span className="text-emerald-700 font-medium">Resolution: {tkt.resolutionNotes}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DESK 3: Authority Succession Authorization Gate */}
      {adminTab === 'succession' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4">
            <h3 className="text-lg font-bold text-[#103125]">
              Institutional Authority Succession & Charter Re-Signing Gate
            </h3>
            <p className="text-xs text-[#5A7366]">
              Validate appointment orders and cryptographically sanction leadership changes for colleges.
            </p>
          </div>

          <div className="space-y-4">
            {authorityRequests.map(req => (
              <div key={req.id} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-[#103125]">{req.id} • {req.clubName}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    req.status === 'Approved & Updated' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {req.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-white p-3 rounded-xl border border-[#E2ECE7]">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#5A7366]">Current Officer</span>
                    <div className="font-bold text-[#103125]">{req.currentName}</div>
                    <div className="text-[11px] text-[#5A7366]">Role: {req.role}</div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#0D7751]">Incoming Nominee</span>
                    <div className="font-bold text-[#103125]">{req.proposedName}</div>
                    <div className="text-[11px] text-[#5A7366]">{req.proposedEmail} ({req.proposedPhone})</div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-[#5A7366]">
                  <span>Uploaded Order: <strong className="font-mono">{req.officialDocName}</strong></span>
                  {req.status === 'Pending Admin Review' && (
                    <button
                      onClick={() => onApproveAuthorityChange(req.id)}
                      className="px-4 py-1.5 rounded-lg bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs"
                    >
                      Authorize & Re-Sign Charter
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DESK 4: The Forensic Data Migration Desk (The Crucial Pitch Defense) */}
      {adminTab === 'migration' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1 rounded-full mb-1">
                <Database className="h-3.5 w-3.5 text-amber-700" />
                <span>Legacy Database Recovery & Reconciliation Pipeline</span>
              </div>
              <h3 className="text-xl font-bold text-[#103125]">
                Forensic Migration & Recovery of Legacy Data
              </h3>
              <p className="text-xs text-[#5A7366] mt-0.5">
                Automated schema reverse-engineering, entity inference against AISHE master, and reconciliation-accounted healing.
              </p>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-[#0D7751]">{forensicRecords.length ? Math.round(forensicRecords.filter(r => r.recoveryStatus === 'Auto-Healed').length / forensicRecords.length * 100) : 0}%</span>
              <span className="block text-[11px] font-bold uppercase text-[#5A7366]">Auto-Healing Rate (Sample)</span>
            </div>
          </div>

          {/* Migration Pipeline Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-center">
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#103125]">{forensicRecords.length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">Legacy Records Scanned</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-emerald-700">{forensicRecords.filter(r => r.recoveryStatus === 'Auto-Healed').length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">Reconstructed & Healed</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#B45309]">{forensicRecords.filter(r => r.recoveryStatus === 'Needs Review').length}</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">Quarantined for Review</div>
            </div>
            <div className="p-3 bg-[#F4F8F6] rounded-xl border border-[#E2ECE7]">
              <div className="font-mono text-xl font-black text-[#0D7751]">—</div>
              <div className="text-[#5A7366] text-[11px] font-bold uppercase">Past Certs Re-Anchored (live count at M8)</div>
            </div>
          </div>

          {/* Quarantined Records Inspection Table */}
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-sm text-[#103125]">Isolated Anomaly Quarantine Table:</h4>
            <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
                <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Legacy ID</th>
                    <th className="p-3">Raw Ingested Name</th>
                    <th className="p-3">Detected Anomaly</th>
                    <th className="p-3">Inferred AISHE</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                  {forensicRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-[#F4F8F6]/60">
                      <td className="p-3 font-mono font-bold text-[#103125]">{rec.legacyId}</td>
                      <td className="p-3 font-semibold text-rose-900">{rec.rawInstituteName}</td>
                      <td className="p-3 text-[#5A7366] max-w-xs">{rec.anomalyDetected}</td>
                      <td className="p-3 font-mono text-emerald-800 font-bold">{rec.healedAisheCode}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          rec.recoveryStatus === 'Auto-Healed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rec.recoveryStatus}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {rec.recoveryStatus !== 'Auto-Healed' ? (
                          <button
                            onClick={() => onHealForensicRecord(rec.id)}
                            className="px-3 py-1 rounded bg-[#0D7751] text-white font-bold hover:bg-[#0a5c3e] shadow-2xs"
                          >
                            Heal & Commit
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-bold">✓ Committed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DESK 5: The 6 Zonal Regions / 7 Regional Officers */}
      {adminTab === 'zones' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="border-b border-[#E2ECE7] pb-4">
            <h3 className="text-lg font-bold text-[#103125]">
              National 6-Zone Operational Network (7 Regional Officers)
            </h3>
            <p className="text-xs text-[#5A7366]">
              Regional deployment nodes coordinating institutional outreach, support ticket queues, and local university workshops.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map(emp => (
              <div key={emp.empId} className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-white bg-[#103125] px-2 py-0.5 rounded">
                    {emp.empId}
                  </span>
                  <span className="text-xs font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                    {emp.zone} Zone
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-[#103125]">{emp.name}</h4>
                  <div className="text-xs font-mono text-[#5A7366]">{emp.email}</div>
                </div>

                <div className="text-[11px] text-[#5A7366]">
                  <strong>States:</strong> {emp.assignedStates.join(', ')}
                </div>

                <div className="pt-2 border-t border-[#E2ECE7] flex justify-between items-center text-xs">
                  <span className="text-[#5A7366]">Active Support Tickets:</span>
                  <span className="font-bold text-[#B45309]">{emp.activeTicketsCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
