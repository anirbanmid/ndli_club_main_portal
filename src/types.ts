export type BranchType = 'landing' | 'club_module' | 'admin_module';

export type RegionalZone = 'North' | 'Central' | 'West' | 'East' | 'North East' | 'South 1' | 'South 2';

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}


export interface EmployeeNode {
  empId: string; // e.g. EMP01
  name: string;
  zone: RegionalZone;
  email: string;
  assignedStates: string[];
  activeTicketsCount: number;
}

export interface ClubAuthority {
  role: 'Patron' | 'President' | 'Secretary' | 'Executive Member';
  name: string;
  designation: string;
  email: string;
  phone: string;
  verified: boolean;
}

export interface InstituteClub {
  id: string; // e.g. CLUB-IITKGP-001
  aisheCode: string;
  name: string;
  state: string;
  district: string;
  zone: RegionalZone;
  category: 'University' | 'College' | 'Autonomous Institute' | 'School';
  passkey: string;
  status: 'Active' | 'Pending Verification' | 'Needs Renewal' | 'Revision Required';
  memberCount: number;
  eventsConducted: number;
  establishedDate: string;
  authorities: ClubAuthority[];
  description?: string;
  websiteUrl?: string;
}

export interface StudentMember {
  id: string;
  clubId: string;
  name: string;
  rollNo: string;
  email: string;
  department: string;
  year: string;
  readingPoints: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond Scholar';
  status: 'Active' | 'Alumni' | 'Suspended';
  joinedDate: string;
  approvedCertificateCount: number;
}

export interface ClubActivity {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  category: 'Quiz' | 'Webinar' | 'Reading Challenge' | 'Workshop' | 'Seminar';
  date: string;
  time: string;
  mode: 'Online' | 'Offline In-Campus' | 'Hybrid';
  description: string;
  participantsCount: number;
  status: 'Upcoming' | 'Live' | 'Completed';
  isInterInstitutional: boolean;
  coHostClubs?: string[];
  securityAuditStatus: 'Verified & Safe' | 'Under Review' | 'Flagged';
  resourceAttachments?: string[];
  hasQuiz: boolean;
  attendanceVerifiedCount?: number;
  organizer?: string;
  bannerGradient?: string;
}

export type ClubEvent = ClubActivity;

export interface IssueTicket {

  id: string; // e.g. TKT-2026-1042
  clubId: string;
  clubName: string;
  zone: RegionalZone;
  category: 'Registration & Passkey' | 'Certificate Approval' | 'Event Logistics' | 'Technical Glitch' | 'Data Correction';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  title: string;
  description: string;
  status: 'Submitted' | 'In Progress' | 'Resolved';
  assignedTo: string; // e.g. EMP04 (Debabrata Ghosh - East)
  createdAt: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface AuthorityChangeRequest {
  id: string; // e.g. AUTH-REQ-901
  clubId: string;
  clubName: string;
  role: 'Patron' | 'President' | 'Secretary' | 'Executive Member';
  currentName: string;
  proposedName: string;
  proposedEmail: string;
  proposedPhone: string;
  officialDocName: string;
  reason: string;
  status: 'Pending Admin Review' | 'Approved & Updated' | 'Rejected';
  submittedAt: string;
  reviewedBy?: string;
}

export interface CertificateData {
  certId: string;
  recipientName: string;
  recipientEmail: string;
  recipientRoll?: string;
  instituteName: string;
  eventName: string;
  eventDate: string;
  category: 'Participation' | 'Merit' | 'Club Registration';
  score?: string;
  issuedAt: string;
  qrDataUrl: string;
  verified: boolean;
  authorityApproved: boolean;
}

export interface ForensicQuarantineRecord {
  id: string;
  legacyId: string;
  rawInstituteName: string;
  healedAisheCode: string;
  healedState: string;
  anomalyDetected: string;
  recoveryStatus: 'Auto-Healed' | 'Needs Review' | 'Archived';
  legacyCertificatesFound: number;
}
