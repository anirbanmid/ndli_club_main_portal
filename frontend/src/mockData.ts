import { 
  InstituteClub, 
  ClubActivity, 
  CertificateData, 
  EmployeeNode, 
  StudentMember, 
  IssueTicket, 
  AuthorityChangeRequest, 
  ForensicQuarantineRecord 
} from './types';

export const INITIAL_EMPLOYEES: EmployeeNode[] = [
  { empId: 'EMP01', name: 'Rohan Sharma', zone: 'North', email: 'emp.north@ndli.example.edu', assignedStates: ['Delhi', 'Uttar Pradesh', 'Punjab', 'Haryana', 'J&K'], activeTicketsCount: 3 },
  { empId: 'EMP02', name: 'Pooja Verma', zone: 'Central', email: 'emp.central@ndli.example.edu', assignedStates: ['Madhya Pradesh', 'Chhattisgarh'], activeTicketsCount: 1 },
  { empId: 'EMP03', name: 'Amit Patel', zone: 'West', email: 'emp.west@ndli.example.edu', assignedStates: ['Maharashtra', 'Gujarat', 'Rajasthan', 'Goa'], activeTicketsCount: 4 },
  { empId: 'EMP04', name: 'Debabrata Ghosh', zone: 'East', email: 'emp.east@ndli.example.edu', assignedStates: ['West Bengal', 'Bihar', 'Jharkhand', 'Odisha'], activeTicketsCount: 2 },
  { empId: 'EMP05', name: 'M. Singh', zone: 'North East', email: 'emp.northeast@ndli.example.edu', assignedStates: ['Assam', 'Meghalaya', 'Manipur', 'Tripura'], activeTicketsCount: 1 },
  { empId: 'EMP06', name: 'K. Venkatesh', zone: 'South', email: 'emp.south1@ndli.example.edu', assignedStates: ['Karnataka', 'Telangana', 'Andhra Pradesh'], activeTicketsCount: 2 },
  { empId: 'EMP07', name: 'S. Soundararajan', zone: 'South', email: 'emp.south2@ndli.example.edu', assignedStates: ['Tamil Nadu', 'Kerala', 'Puducherry'], activeTicketsCount: 3 },
];

export const INITIAL_CLUBS: InstituteClub[] = [
  {
    id: 'CLUB-IITKGP-001',
    aisheCode: 'U-0570',
    name: 'Indian Institute of Technology Kharagpur',
    state: 'West Bengal',
    district: 'Paschim Medinipur',
    zone: 'East',
    category: 'University',
    passkey: 'IITKGP-NDL-9021',
    status: 'Active',
    memberCount: 3840,
    eventsConducted: 42,
    establishedDate: '2021-04-12',
    websiteUrl: 'https://www.iitkgp.ac.in',
    description: 'Premier national institute coordinating the National Digital Library of India platform. Houses the central NDLI innovation club.',
    authorities: [
      { role: 'Patron', name: 'Prof. A. R. Deshmukh', designation: 'Director', email: 'director@iitkgp.example.edu', phone: '+91 9434000001', verified: true },
      { role: 'President', name: 'Dr. S. K. Iyer', designation: 'Librarian & PI', email: 'librarian@iitkgp.example.edu', phone: '+91 9434000002', verified: true },
      { role: 'Secretary', name: 'Prof. M. Banerjee', designation: 'Professor CSE', email: 'mb@cse.iitkgp.example.edu', phone: '+91 9434000003', verified: true },
      { role: 'Executive Member', name: 'Arjun Sen', designation: 'Research Scholar', email: 'arjun.sen@iitkgp.example.edu', phone: '+91 9830000004', verified: true },
    ]
  },
  {
    id: 'CLUB-IITB-002',
    aisheCode: 'U-0306',
    name: 'Indian Institute of Technology Bombay',
    state: 'Maharashtra',
    district: 'Mumbai Suburban',
    zone: 'West',
    category: 'University',
    passkey: 'IITB-NDL-4412',
    status: 'Active',
    memberCount: 2950,
    eventsConducted: 28,
    establishedDate: '2021-08-15',
    websiteUrl: 'https://www.iitb.ac.in',
    description: 'Pioneering collaborative digital reading circles and patent research workshops across Western India.',
    authorities: [
      { role: 'Patron', name: 'Prof. N. K. Joshi', designation: 'Director', email: 'director@iitb.example.edu', phone: '+91 9820000001', verified: true },
      { role: 'President', name: 'Dr. P. S. Kulkarni', designation: 'Central Library Head', email: 'library@iitb.example.edu', phone: '+91 9820000002', verified: true },
      { role: 'Secretary', name: 'Prof. Devang Khakhar', designation: 'Senior Faculty', email: 'khakhar@iitb.example.edu', phone: '+91 9820000003', verified: true },
      { role: 'Executive Member', name: 'Priya Sharma', designation: 'Student Council Rep', email: 'priya.s@iitb.example.edu', phone: '+91 9820000004', verified: true },
    ]
  },
  {
    id: 'CLUB-DU-003',
    aisheCode: 'U-0109',
    name: 'University of Delhi (Central Campus)',
    state: 'Delhi',
    district: 'North Delhi',
    zone: 'North',
    category: 'University',
    passkey: 'DELHIU-NDL-1092',
    status: 'Active',
    memberCount: 5120,
    eventsConducted: 56,
    establishedDate: '2020-11-05',
    websiteUrl: 'https://www.du.ac.in',
    description: 'Central university with expansive arts, science, and humanities research chapters active in annual reading marathons.',
    authorities: [
      { role: 'Patron', name: 'Prof. R. K. Malhotra', designation: 'Vice Chancellor', email: 'vc@du.example.edu', phone: '+91 9811000001', verified: true },
      { role: 'President', name: 'Dr. A. K. Bhatnagar', designation: 'University Librarian', email: 'librarian@du.example.edu', phone: '+91 9811000002', verified: true },
      { role: 'Secretary', name: 'Prof. Sanjeev Kumar', designation: 'NSS Coordinator', email: 'sanjeev@du.example.edu', phone: '+91 9811000003', verified: true },
      { role: 'Executive Member', name: 'Rohan Verma', designation: 'Postgraduate Student', email: 'rohan.v@du.example.edu', phone: '+91 9811000004', verified: true },
    ]
  },
  {
    id: 'CLUB-AU-004',
    aisheCode: 'U-0439',
    name: 'Anna University, Chennai',
    state: 'Tamil Nadu',
    district: 'Chennai',
    zone: 'South',
    category: 'University',
    passkey: 'ANNAU-NDL-8820',
    status: 'Active',
    memberCount: 4210,
    eventsConducted: 34,
    establishedDate: '2022-01-20',
    websiteUrl: 'https://www.annauniv.edu',
    description: 'Promoting open access technical literature, engineering standards, and patent search across Tamil Nadu.',
    authorities: [
      { role: 'Patron', name: 'Prof. S. Rajendran', designation: 'Vice Chancellor', email: 'vc@annauniv.example.edu', phone: '+91 9444000001', verified: true },
      { role: 'President', name: 'Dr. V. Lakshmanan', designation: 'Chief Librarian', email: 'library@annauniv.example.edu', phone: '+91 9444000002', verified: true },
      { role: 'Secretary', name: 'Dr. T. Murugesan', designation: 'Faculty Incharge', email: 'tm@annauniv.example.edu', phone: '+91 9444000003', verified: true },
      { role: 'Executive Member', name: 'Ananya Raman', designation: 'Final Year CSE', email: 'ananya.r@annauniv.example.edu', phone: '+91 9444000004', verified: true },
    ]
  },
  {
    id: 'CLUB-PENDING-001',
    aisheCode: 'C-28491',
    name: 'St. Stephen\'s College, New Delhi',
    state: 'Delhi',
    district: 'North Delhi',
    zone: 'North',
    category: 'College',
    passkey: 'STEPH-PENDING-01',
    status: 'Pending Verification',
    memberCount: 0,
    eventsConducted: 0,
    establishedDate: '2026-10-14',
    websiteUrl: 'https://www.ststephens.edu',
    description: 'Autonomous constituent college requesting authorization for new liberal arts NDLI reading chapter.',
    authorities: [
      { role: 'Patron', name: 'Prof. J. Mathews', designation: 'Principal', email: 'principal@stephens.example.edu', phone: '+91 9811550001', verified: false },
      { role: 'President', name: 'Dr. E. Thomas', designation: 'Librarian', email: 'librarian@stephens.example.edu', phone: '+91 9811550002', verified: false },
      { role: 'Secretary', name: 'Dr. P. Kurian', designation: 'English Faculty', email: 'pk@stephens.example.edu', phone: '+91 9811550003', verified: false },
      { role: 'Executive Member', name: 'Meera Jacob', designation: 'Literary Society Head', email: 'meera.j@stephens.example.edu', phone: '+91 9811550004', verified: false },
    ]
  },
  {
    id: 'CLUB-PENDING-002',
    aisheCode: 'U-0014',
    name: 'Gauhati University',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    zone: 'North East',
    category: 'University',
    passkey: 'GAUHA-PENDING-02',
    status: 'Pending Verification',
    memberCount: 0,
    eventsConducted: 0,
    establishedDate: '2026-10-15',
    websiteUrl: 'https://www.gauhati.ac.in',
    description: 'Major regional hub in Assam aiming to connect 200+ affiliated colleges through central NDLI digital repositories.',
    authorities: [
      { role: 'Patron', name: 'Prof. D. N. Sharma', designation: 'Vice Chancellor', email: 'vc@gauhati.example.edu', phone: '+91 9435001122', verified: false },
      { role: 'President', name: 'Dr. B. K. Phukan', designation: 'Central Library Head', email: 'lib@gauhati.example.edu', phone: '+91 9435001123', verified: false },
      { role: 'Secretary', name: 'Dr. H. Barua', designation: 'Dean Student Affairs', email: 'dba@gauhati.example.edu', phone: '+91 9435001124', verified: false },
      { role: 'Executive Member', name: 'Rahul Deka', designation: 'Postgraduate Scholar', email: 'rahul.d@gauhati.example.edu', phone: '+91 9435001125', verified: false },
    ]
  }
];

export const INITIAL_STUDENTS: StudentMember[] = [
  { id: 'STU-001', clubId: 'CLUB-IITKGP-001', name: 'Aarav Mukherjee', rollNo: '22CS30045', email: 'aarav.m@demo.example.edu', department: 'Computer Science', year: '4th Year', readingPoints: 850, tier: 'Diamond Scholar', status: 'Active', joinedDate: '2024-01-15', approvedCertificateCount: 5, apaarId: '9842-1049-5501', nadStatus: 'Deposited to NAD-ABC' },
  { id: 'STU-002', clubId: 'CLUB-IITKGP-001', name: 'Ritika Sen', rollNo: '23EC10012', email: 'ritika.s@demo.example.edu', department: 'Electronics', year: '3rd Year', readingPoints: 620, tier: 'Gold', status: 'Active', joinedDate: '2024-03-20', approvedCertificateCount: 3, apaarId: '9842-1049-5502', nadStatus: 'Deposited to NAD-ABC' },
  { id: 'STU-003', clubId: 'CLUB-IITKGP-001', name: 'Debrup Ghosh', rollNo: '23ME10088', email: 'debrup.g@demo.example.edu', department: 'Mechanical', year: '3rd Year', readingPoints: 340, tier: 'Silver', status: 'Active', joinedDate: '2024-08-10', approvedCertificateCount: 2, apaarId: '9842-1049-5503', nadStatus: 'Pending Sync' },
  { id: 'STU-004', clubId: 'CLUB-IITKGP-001', name: 'Ananya Roy', rollNo: '24PH20004', email: 'ananya.r@demo.example.edu', department: 'Physics', year: '2nd Year', readingPoints: 180, tier: 'Bronze', status: 'Active', joinedDate: '2025-01-12', approvedCertificateCount: 1, nadStatus: 'Not Linked' },
  { id: 'STU-005', clubId: 'CLUB-IITKGP-001', name: 'Siddhartha Paul', rollNo: '21CH10002', email: 'sid.paul@demo.example.edu', department: 'Chemical', year: 'Alumni', readingPoints: 920, tier: 'Diamond Scholar', status: 'Alumni', joinedDate: '2022-09-01', approvedCertificateCount: 7, apaarId: '9842-1049-5505', nadStatus: 'Deposited to NAD-ABC' },
  { id: 'STU-006', clubId: 'CLUB-IITB-002', name: 'Sneha Deshmukh', rollNo: '23EE10012', email: 'sneha.d@demo.example.edu', department: 'Electrical', year: '3rd Year', readingPoints: 710, tier: 'Gold', status: 'Active', joinedDate: '2024-02-14', approvedCertificateCount: 4, apaarId: '8831-2940-1120', nadStatus: 'Deposited to NAD-ABC' },
  { id: 'STU-007', clubId: 'CLUB-IITB-002', name: 'Tanmay Joshi', rollNo: '24CS20033', email: 'tanmay.j@demo.example.edu', department: 'Computer Science', year: '2nd Year', readingPoints: 410, tier: 'Silver', status: 'Active', joinedDate: '2024-09-05', approvedCertificateCount: 2, nadStatus: 'Pending Sync' },
];

export const INITIAL_ACTIVITIES: ClubActivity[] = [
  {
    id: 'ACT-2026-001',
    clubId: 'CLUB-IITKGP-001',
    clubName: 'Indian Institute of Technology Kharagpur',
    title: 'National Reading Month: Open Research & Digital Ethics Assessment',
    category: 'Quiz',
    date: '2026-10-18',
    time: '10:00 AM - 05:00 PM IST',
    mode: 'Online',
    description: 'All-India digital literacy assessment testing citation ethics, open educational resources, and copyright literacy for young scholars.',
    participantsCount: 14250,
    status: 'Live',
    isInterInstitutional: true,
    coHostClubs: ['Indian Institute of Technology Bombay', 'University of Delhi (Central Campus)'],
    securityAuditStatus: 'Verified & Safe',
    hasQuiz: true,
    attendanceVerifiedCount: 12100,
    resourceAttachments: ['NDLI-Research-Ethics-Handbook-2026.pdf', 'OpenAccess-Standard-Guidelines.pdf']
  },
  {
    id: 'ACT-2026-002',
    clubId: 'CLUB-IITKGP-001',
    clubName: 'Indian Institute of Technology Kharagpur',
    title: 'Harnessing NDLI for Interdisciplinary Engineering & Science Projects',
    category: 'Webinar',
    date: '2026-10-22',
    time: '03:00 PM - 04:30 PM IST',
    mode: 'Online',
    description: 'Expert masterclass by faculty on mining NDLI scholarly manuscripts, patents, and video lectures available free of cost through NDLI.',
    participantsCount: 6890,
    status: 'Upcoming',
    isInterInstitutional: true,
    coHostClubs: ['Anna University, Chennai'],
    securityAuditStatus: 'Verified & Safe',
    hasQuiz: false,
    resourceAttachments: ['Syllabus-Mining-Guide.pdf']
  },
  {
    id: 'ACT-2026-003',
    clubId: 'CLUB-IITB-002',
    clubName: 'Indian Institute of Technology Bombay',
    title: 'Intellectual Property Rights (IPR) & Patent Prior-Art Search Clinic',
    category: 'Workshop',
    date: '2026-10-12',
    time: '11:00 AM - 01:00 PM IST',
    mode: 'Offline In-Campus',
    description: 'Hands-on training session conducted at Central Library for postgraduate innovators to register prior art before publication.',
    participantsCount: 185,
    status: 'Completed',
    isInterInstitutional: false,
    securityAuditStatus: 'Verified & Safe',
    hasQuiz: false,
    attendanceVerifiedCount: 185,
    resourceAttachments: ['Indian-Patent-Office-Template.pdf']
  },
  {
    id: 'ACT-2026-004',
    clubId: 'CLUB-DU-003',
    clubName: 'University of Delhi (Central Campus)',
    title: '30-Day Inter-Collegiate Digital Reading Challenge & Review Forum',
    category: 'Reading Challenge',
    date: '2026-11-01',
    time: 'All Month',
    mode: 'Hybrid',
    description: 'Reading marathon encouraging students to complete 3 monographs from the NDLI digital repository with peer review logs.',
    participantsCount: 3240,
    status: 'Upcoming',
    isInterInstitutional: true,
    coHostClubs: ['Indian Institute of Technology Kharagpur'],
    securityAuditStatus: 'Verified & Safe',
    hasQuiz: false
  }
];

export const INITIAL_TICKETS: IssueTicket[] = [
  {
    id: 'TKT-2026-1042',
    clubId: 'CLUB-IITB-002',
    clubName: 'IIT Bombay NDLI Club',
    zone: 'West',
    category: 'Registration & Passkey',
    priority: 'Critical',
    title: 'Student passkey sync error for 2026 batch intake',
    description: 'Around 250 freshly admitted postgraduate students received an invalid passkey error when attempting to join with IITB-NDL-4412.',
    status: 'In Progress',
    assignedTo: 'EMP03 (Amit Patel - West)',
    createdAt: '2026-10-14 09:30 AM',
    resolutionNotes: 'Passkey regex boundary condition updated in auth service; re-testing on staging.'
  },
  {
    id: 'TKT-2026-1039',
    clubId: 'CLUB-AU-004',
    clubName: 'Anna University NDLI Club',
    zone: 'South',
    category: 'Certificate Approval',
    priority: 'High',
    title: 'Bulk attendance sign-off approval delay for IPR Workshop',
    description: 'Event coordinator marked 185 attendees as verified on 12th October, but the certificates are still locked in pending verification status.',
    status: 'Submitted',
    assignedTo: 'EMP07 (S. Soundararajan - South Zone 2)',
    createdAt: '2026-10-15 11:15 AM'
  },
  {
    id: 'TKT-2026-0988',
    clubId: 'CLUB-IITKGP-001',
    clubName: 'IIT Kharagpur NDLI Club',
    zone: 'East',
    category: 'Data Correction',
    priority: 'Medium',
    title: 'Update contact phone for new Executive Member',
    description: 'Executive member contact details were changed after student council elections.',
    status: 'Resolved',
    assignedTo: 'EMP04 (Debabrata Ghosh - East)',
    createdAt: '2026-10-10 02:00 PM',
    resolutionNotes: 'Contact phone updated and verified via institutional OTP.',
    resolvedAt: '2026-10-10 04:30 PM'
  }
];

export const INITIAL_AUTHORITY_REQUESTS: AuthorityChangeRequest[] = [
  {
    id: 'AUTH-REQ-901',
    clubId: 'CLUB-DU-003',
    clubName: 'University of Delhi (Central Campus)',
    role: 'Patron',
    currentName: 'Prof. R. K. Malhotra',
    proposedName: 'Prof. K. N. Shrivastava (Officiating)',
    proposedEmail: 'vc.officiating@du.example.edu',
    proposedPhone: '+91 9811000999',
    officialDocName: 'MoE-Notification-Order-2026-88.pdf',
    reason: 'Interim officiating charge handed over as per Ministry of Education notification.',
    status: 'Pending Admin Review',
    submittedAt: '2026-10-14 04:45 PM'
  }
];

export const INITIAL_CERTIFICATES: CertificateData[] = [
  {
    certId: 'NDLI-A7KQ-2M4X',
    recipientName: 'Aarav Mukherjee',
    recipientEmail: 'aarav.m@demo.example.edu',
    recipientRoll: '22CS30045',
    instituteName: 'Indian Institute of Technology Kharagpur',
    eventName: 'National Reading Month: Open Research & Digital Ethics Assessment',
    eventDate: '15th October 2026',
    category: 'Merit',
    score: '100% (Verified)',
    issuedAt: '2026-10-15T10:30:00Z',
    qrDataUrl: '',
    verified: true,
    authorityApproved: true,
    apaarId: '9842-1049-5501',
    nadStatus: 'Deposited to NAD-ABC'
  },
  {
    certId: 'NDLI-B4XR-9WZT',
    recipientName: 'Sneha Deshmukh',
    recipientEmail: 'sneha.d@demo.example.edu',
    recipientRoll: '23EE10012',
    instituteName: 'Indian Institute of Technology Bombay',
    eventName: 'Intellectual Property Rights (IPR) & Patent Prior-Art Search Clinic',
    eventDate: '12th October 2026',
    category: 'Participation',
    issuedAt: '2026-10-12T13:45:00Z',
    qrDataUrl: '',
    verified: true,
    authorityApproved: true,
    apaarId: '8831-2940-1120',
    nadStatus: 'Deposited to NAD-ABC'
  }
];

export const INITIAL_FORENSIC_RECORDS: ForensicQuarantineRecord[] = [
  {
    id: 'FNS-001',
    legacyId: 'LEGACY_TBL_9041',
    rawInstituteName: 'Calcutta Universiti (Collge St. Campus)',
    healedAisheCode: 'U-0568',
    healedState: 'West Bengal',
    anomalyDetected: 'Misspelled name, orphan record link, missing district',
    recoveryStatus: 'Auto-Healed',
    legacyCertificatesFound: 1420
  },
  {
    id: 'FNS-002',
    legacyId: 'LEGACY_TBL_8819',
    rawInstituteName: 'Govt Engg Col Jalpaiguri',
    healedAisheCode: 'C-1294',
    healedState: 'West Bengal',
    anomalyDetected: 'Missing Patron contact records; legacy passkey field unreadable',
    recoveryStatus: 'Needs Review',
    legacyCertificatesFound: 512
  },
  {
    id: 'FNS-003',
    legacyId: 'LEGACY_TBL_7720',
    rawInstituteName: 'Osmania Univ (Coll of Sci)',
    healedAisheCode: 'U-0023',
    healedState: 'Telangana',
    anomalyDetected: 'Duplicate institute charter record found in legacy import',
    recoveryStatus: 'Auto-Healed',
    legacyCertificatesFound: 840
  }
];
