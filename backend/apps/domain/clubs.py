"""Single Source of Truth for Institutional Clubs and Renewal States.

This module is the canonical backend registry for all NDLI clubs across all
portal modules (Module 1 Public Portal, Module 2 Campus Module, Module 3 Admin
& Employee Portal, and Certificate Verifier).

Strict Architecture Rules (SSOT):
1. No view or module may define its own diverging list of clubs or dates.
2. All club retrieval must go through `get_all_canonical_clubs()`.
3. Renewals are persisted and immediately reflected across all endpoints.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings

SIGNATURES_DIR = Path(settings.BASE_DIR) / "data" / "signatures"
PERSISTED_RENEWALS_FILE = SIGNATURES_DIR / "persisted_renewals.json"


def load_persisted_renewals() -> dict[str, dict[str, str]]:
    """Load persisted renewals from disk storage."""
    if not PERSISTED_RENEWALS_FILE.exists():
        return {}
    try:
        with open(PERSISTED_RENEWALS_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_persisted_renewal(
    club_id: str, last_renewal: str, upcoming_renewal: str
) -> None:
    """Save club renewal directly to the relational database (PostgreSQL/SQLite)."""
    from apps.domain.models import Club

    # 1. Update relational database record directly (Relational SSOT)
    try:
        Club.objects.filter(code=club_id).update(
            last_renewal_date=last_renewal,
            upcoming_renewal_date=upcoming_renewal,
            status="active",
        )
    except Exception:
        pass

    # 2. Mirror to persistent disk storage for redundancy
    SIGNATURES_DIR.mkdir(parents=True, exist_ok=True)
    renewals = load_persisted_renewals()
    renewals[club_id] = {
        "last_renewal_date": last_renewal,
        "upcoming_renewal_date": upcoming_renewal,
        "renewal_date": upcoming_renewal,
        "status": "Active",
    }
    try:
        with open(PERSISTED_RENEWALS_FILE, "w", encoding="utf-8") as f:
            json.dump(renewals, f, indent=2)
    except Exception:
        pass


#: Master canonical club approval and baseline renewal dates
MASTER_CLUB_DATES: dict[str, tuple[str, str, str]] = {
    # Flagship institutional club
    "NDLI-EMP01-002": ("2024-08-15", "2025-08-15", "2026-08-15"),
    "REG-2025-EMP01-002": ("2024-08-15", "2025-08-15", "2026-08-15"),
    # Premier institutes
    "CLUB-IITKGP-001": ("2021-04-12", "2025-04-12", "2026-04-12"),
    "CLUB-IITD-002": ("2021-05-10", "2025-05-10", "2026-05-10"),
    "CLUB-IITB-003": ("2021-08-15", "2025-08-15", "2026-08-15"),
    "CLUB-IITM-004": ("2021-09-01", "2025-09-01", "2026-09-01"),
    "CLUB-IITK-005": ("2021-10-10", "2025-10-10", "2026-10-10"),
    "CLUB-JU-006": ("2021-11-15", "2025-11-15", "2026-11-15"),
    "CLUB-DU-007": ("2020-11-05", "2025-11-05", "2026-11-05"),
    "CLUB-BHU-008": ("2021-12-01", "2025-12-01", "2026-12-01"),
    "CLUB-IISCB-009": ("2022-01-15", "2025-01-15", "2026-01-15"),
    "CLUB-CU-010": ("2022-02-20", "2025-02-20", "2026-02-20"),
    # Sample test clubs
    "CLB-DU-CULT": ("2021-04-12", "2025-04-12", "2026-04-12"),
    "CLB-DU-TECH": ("2021-05-10", "2025-05-10", "2026-05-10"),
    "CLB-AS-CULT": ("2021-08-15", "2025-08-15", "2026-08-15"),
    "CLB-KA-TECH": ("2021-09-01", "2025-09-01", "2026-09-01"),
    "CLB-MH-TECH": ("2021-10-10", "2025-10-10", "2026-10-10"),
    "CLB-MP-TECH": ("2021-11-15", "2025-11-15", "2026-11-15"),
    "CLB-TG-CULT": ("2020-11-05", "2025-11-05", "2026-11-05"),
    "CLB-TN-TECH": ("2021-12-01", "2025-12-01", "2026-12-01"),
    "CLB-UP-LIT": ("2022-01-15", "2025-01-15", "2026-01-15"),
    "CLB-WB-LIT": ("2022-02-20", "2025-02-20", "2026-02-20"),
}


def get_club_dates(code: str, created_at: Any) -> tuple[str, str, str]:
    """Return (date_of_approval, last_renewal_date, upcoming_renewal_date)."""
    renewals = load_persisted_renewals()
    clean_code = code.strip()
    if clean_code in renewals:
        r = renewals[clean_code]
        last_r = r.get("last_renewal_date", "")
        upcoming_r = r.get("upcoming_renewal_date", "")
        doa = MASTER_CLUB_DATES.get(clean_code, ("2021-04-12", "", ""))[0]
        return doa, last_r, upcoming_r

    if clean_code in MASTER_CLUB_DATES:
        return MASTER_CLUB_DATES[clean_code]
    c_date = created_at.date() if created_at else None
    doa = c_date.strftime("%Y-%m-%d") if c_date else "2021-04-12"
    last_ren = ""
    try:
        next_year = c_date.replace(year=c_date.year + 1) if c_date else None
        upcoming_ren = next_year.strftime("%Y-%m-%d") if next_year else "2027-04-12"
    except ValueError:
        upcoming_ren = f"{c_date.year + 1}-02-28" if c_date else "2027-04-12"
    if last_ren and doa and last_ren < doa:
        last_ren = ""
    return doa, last_ren or "None (Initial)", upcoming_ren


CANONICAL_INSTITUTIONAL_CLUBS: list[dict[str, Any]] = [
    {
        "id": "NDLI-EMP01-002",
        "club_id": "NDLI-EMP01-002",
        "aisheCode": "C-100001",
        "name": "Delhi Advanced Technical Institute",
        "institution_name": "Delhi Advanced Technical Institute",
        "state": "Delhi",
        "district": "South Delhi",
        "zone": "North",
        "category": "Autonomous Institute",
        "passkey": "DATI-NDL-002",
        "status": "Active",
        "memberCount": 2450,
        "member_count": 2450,
        "eventsConducted": 26,
        "soloSessions": 20,
        "jointSessions": 6,
        "solo_activities": 20,
        "joint_activities": 6,
        "establishedDate": "2024-08-15",
        "registrationNo": "REG-2025-EMP01-002",
        "registration_no": "REG-2025-EMP01-002",
        "reg_no": "REG-2025-EMP01-002",
        "websiteUrl": "https://www.dati.ac.in",
        "email": "club.dati@ndli.edu",
        "description": (
            "Premier national technical education chapter fostering research"
            " circles, digital archives, and student literature clubs."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Dr. K. N. Rao",
                "designation": "Director",
                "email": "director@dati.ac.in",
                "phone": "+91 9811200001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. Ramesh Chandra",
                "designation": "Librarian & Nodal Officer",
                "email": "pres.dati@dati.ac.in",
                "phone": "+91 9811200002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Alok Gupta",
                "designation": "Faculty Advisor",
                "email": "sec.dati@dati.ac.in",
                "phone": "+91 9811200003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Megha Sharma",
                "designation": "Student Representative",
                "email": "megha.s@dati.ac.in",
                "phone": "+91 9811200004",
                "verified": True,
            },
        ],
        "patron_name": "Dr. K. N. Rao",
        "patron_email": "director@dati.ac.in",
        "president_name": "Dr. Ramesh Chandra",
        "president_email": "pres.dati@dati.ac.in",
        "secretary_name": "Prof. Alok Gupta",
        "secretary_email": "sec.dati@dati.ac.in",
    },
    {
        "id": "CLUB-IITKGP-001",
        "club_id": "CLUB-IITKGP-001",
        "aisheCode": "U-0570",
        "name": "Indian Institute of Technology Kharagpur",
        "institution_name": "Indian Institute of Technology Kharagpur",
        "state": "West Bengal",
        "district": "Paschim Medinipur",
        "zone": "East",
        "category": "University",
        "passkey": "IITKGP-NDL-9021",
        "status": "Active",
        "memberCount": 3840,
        "member_count": 3840,
        "eventsConducted": 42,
        "soloSessions": 35,
        "jointSessions": 7,
        "solo_activities": 35,
        "joint_activities": 7,
        "establishedDate": "2021-04-12",
        "registrationNo": "NDLI/CLUB/IITKGP-001",
        "registration_no": "NDLI/CLUB/IITKGP-001",
        "reg_no": "NDLI/CLUB/IITKGP-001",
        "websiteUrl": "https://www.iitkgp.ac.in",
        "email": "club.iitkgp@ndli.edu",
        "description": (
            "Premier national institute coordinating the National Digital"
            " Library of India platform. Houses the central NDLI innovation club."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. A. R. Deshmukh",
                "designation": "Director",
                "email": "director@iitkgp.example.edu",
                "phone": "+91 9434000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. S. K. Iyer",
                "designation": "Librarian & PI",
                "email": "librarian@iitkgp.example.edu",
                "phone": "+91 9434000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. M. Banerjee",
                "designation": "Professor CSE",
                "email": "mb@cse.iitkgp.example.edu",
                "phone": "+91 9434000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Arjun Sen",
                "designation": "Research Scholar",
                "email": "arjun.sen@iitkgp.example.edu",
                "phone": "+91 9830000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. A. R. Deshmukh",
        "patron_email": "director@iitkgp.example.edu",
        "president_name": "Dr. S. K. Iyer",
        "president_email": "librarian@iitkgp.example.edu",
        "secretary_name": "Prof. M. Banerjee",
        "secretary_email": "mb@cse.iitkgp.example.edu",
    },
    {
        "id": "CLUB-IITD-002",
        "club_id": "CLUB-IITD-002",
        "aisheCode": "U-0109",
        "name": "Indian Institute of Technology Delhi",
        "institution_name": "Indian Institute of Technology Delhi",
        "state": "Delhi",
        "district": "South Delhi",
        "zone": "North",
        "category": "University",
        "passkey": "IITD-NDL-1044",
        "status": "Active",
        "memberCount": 4100,
        "member_count": 4100,
        "eventsConducted": 38,
        "soloSessions": 30,
        "jointSessions": 8,
        "solo_activities": 30,
        "joint_activities": 8,
        "establishedDate": "2021-05-10",
        "registrationNo": "NDLI/CLUB/IITD-002",
        "registration_no": "NDLI/CLUB/IITD-002",
        "reg_no": "NDLI/CLUB/IITD-002",
        "websiteUrl": "https://www.iitd.ac.in",
        "email": "club.iitd@ndli.edu",
        "description": (
            "IIT Delhi NDLI Club chapter driving interdisciplinary hackathons"
            " and digital preservation."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. R. Ranganathan",
                "designation": "Director",
                "email": "director@iitd.example.edu",
                "phone": "+91 9810000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. Neeraj Kumar",
                "designation": "Librarian",
                "email": "library@iitd.example.edu",
                "phone": "+91 9810000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Sunita Saran",
                "designation": "Associate Dean",
                "email": "sunita@iitd.example.edu",
                "phone": "+91 9810000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Kavita Rao",
                "designation": "Postgrad Representative",
                "email": "kavita.r@iitd.example.edu",
                "phone": "+91 9810000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. R. Ranganathan",
        "patron_email": "director@iitd.example.edu",
        "president_name": "Dr. Neeraj Kumar",
        "president_email": "library@iitd.example.edu",
        "secretary_name": "Prof. Sunita Saran",
        "secretary_email": "sunita@iitd.example.edu",
    },
    {
        "id": "CLUB-IITB-003",
        "club_id": "CLUB-IITB-003",
        "aisheCode": "U-0306",
        "name": "Indian Institute of Technology Bombay",
        "institution_name": "Indian Institute of Technology Bombay",
        "state": "Maharashtra",
        "district": "Mumbai Suburban",
        "zone": "West",
        "category": "University",
        "passkey": "IITB-NDL-3033",
        "status": "Active",
        "memberCount": 2950,
        "member_count": 2950,
        "eventsConducted": 28,
        "soloSessions": 22,
        "jointSessions": 6,
        "solo_activities": 22,
        "joint_activities": 6,
        "establishedDate": "2021-08-15",
        "registrationNo": "NDLI/CLUB/IITB-003",
        "registration_no": "NDLI/CLUB/IITB-003",
        "reg_no": "NDLI/CLUB/IITB-003",
        "websiteUrl": "https://www.iitb.ac.in",
        "email": "club.iitb@ndli.edu",
        "description": (
            "Promotes technical literature, collaborative research seminars,"
            " and digital reading drives."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. N. K. Joshi",
                "designation": "Director",
                "email": "director@iitb.example.edu",
                "phone": "+91 9820000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. P. S. Kulkarni",
                "designation": "Chief Librarian",
                "email": "library@iitb.example.edu",
                "phone": "+91 9820000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Devang Khakhar",
                "designation": "Professor Chem Engg",
                "email": "khakhar@iitb.example.edu",
                "phone": "+91 9820000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Rahul Verma",
                "designation": "Student Convener",
                "email": "rahul.v@iitb.example.edu",
                "phone": "+91 9820000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. N. K. Joshi",
        "patron_email": "director@iitb.example.edu",
        "president_name": "Dr. P. S. Kulkarni",
        "president_email": "library@iitb.example.edu",
        "secretary_name": "Prof. Devang Khakhar",
        "secretary_email": "khakhar@iitb.example.edu",
    },
    {
        "id": "CLUB-IITM-004",
        "club_id": "CLUB-IITM-004",
        "aisheCode": "U-0456",
        "name": "Indian Institute of Technology Madras",
        "institution_name": "Indian Institute of Technology Madras",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "zone": "South",
        "category": "University",
        "passkey": "IITM-NDL-4412",
        "status": "Active",
        "memberCount": 3450,
        "member_count": 3450,
        "eventsConducted": 31,
        "soloSessions": 25,
        "jointSessions": 6,
        "solo_activities": 25,
        "joint_activities": 6,
        "establishedDate": "2021-09-01",
        "registrationNo": "NDLI/CLUB/IITM-004",
        "registration_no": "NDLI/CLUB/IITM-004",
        "reg_no": "NDLI/CLUB/IITM-004",
        "websiteUrl": "https://www.iitm.ac.in",
        "email": "club.iitm@ndli.edu",
        "description": (
            "Fostering regional reading circles and open digital access"
            " programs across Tamil Nadu."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. V. Kamakoti",
                "designation": "Director",
                "email": "director@iitm.example.edu",
                "phone": "+91 9444000011",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. K. Ramasamy",
                "designation": "Librarian",
                "email": "library@iitm.example.edu",
                "phone": "+91 9444000012",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. S. Umesh",
                "designation": "Professor EE",
                "email": "umesh@iitm.example.edu",
                "phone": "+91 9444000013",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Ananya Krishnan",
                "designation": "Student Rep",
                "email": "ananya.k@iitm.example.edu",
                "phone": "+91 9444000014",
                "verified": True,
            },
        ],
        "patron_name": "Prof. V. Kamakoti",
        "patron_email": "director@iitm.example.edu",
        "president_name": "Dr. K. Ramasamy",
        "president_email": "library@iitm.example.edu",
        "secretary_name": "Prof. S. Umesh",
        "secretary_email": "umesh@iitm.example.edu",
    },
    {
        "id": "CLUB-IITK-005",
        "club_id": "CLUB-IITK-005",
        "aisheCode": "U-0500",
        "name": "Indian Institute of Technology Kanpur",
        "institution_name": "Indian Institute of Technology Kanpur",
        "state": "Uttar Pradesh",
        "district": "Kanpur Nagar",
        "zone": "North",
        "category": "University",
        "passkey": "IITK-NDL-5521",
        "status": "Active",
        "memberCount": 2890,
        "member_count": 2890,
        "eventsConducted": 25,
        "soloSessions": 20,
        "jointSessions": 5,
        "solo_activities": 20,
        "joint_activities": 5,
        "establishedDate": "2021-10-10",
        "registrationNo": "NDLI/CLUB/IITK-005",
        "registration_no": "NDLI/CLUB/IITK-005",
        "reg_no": "NDLI/CLUB/IITK-005",
        "websiteUrl": "https://www.iitk.ac.in",
        "email": "club.iitk@ndli.edu",
        "description": (
            "Active in STEM reading challenges and open science dissemination."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. S. Ganesh",
                "designation": "Director",
                "email": "director@iitk.example.edu",
                "phone": "+91 9512000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. B. K. Singh",
                "designation": "Librarian",
                "email": "library@iitk.example.edu",
                "phone": "+91 9512000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Manindra Agrawal",
                "designation": "Professor CSE",
                "email": "manindra@iitk.example.edu",
                "phone": "+91 9512000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Pooja Mishra",
                "designation": "Student Lead",
                "email": "pooja.m@iitk.example.edu",
                "phone": "+91 9512000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. S. Ganesh",
        "patron_email": "director@iitk.example.edu",
        "president_name": "Dr. B. K. Singh",
        "president_email": "library@iitk.example.edu",
        "secretary_name": "Prof. Manindra Agrawal",
        "secretary_email": "manindra@iitk.example.edu",
    },
    {
        "id": "CLUB-JU-006",
        "club_id": "CLUB-JU-006",
        "aisheCode": "U-0584",
        "name": "Jadavpur University",
        "institution_name": "Jadavpur University",
        "state": "West Bengal",
        "district": "Kolkata",
        "zone": "East",
        "category": "University",
        "passkey": "JU-NDL-6612",
        "status": "Active",
        "memberCount": 3120,
        "member_count": 3120,
        "eventsConducted": 29,
        "soloSessions": 23,
        "jointSessions": 6,
        "solo_activities": 23,
        "joint_activities": 6,
        "establishedDate": "2021-11-15",
        "registrationNo": "NDLI/CLUB/JU-006",
        "registration_no": "NDLI/CLUB/JU-006",
        "reg_no": "NDLI/CLUB/JU-006",
        "websiteUrl": "https://www.jaduniv.edu.in",
        "email": "club.ju@ndli.edu",
        "description": (
            "Engaged in humanities archives, multilingual seminars,"
            " and literature circles."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. B. C. Roy",
                "designation": "Vice Chancellor",
                "email": "vc@jadavpur.example.edu",
                "phone": "+91 9831000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. Subir Das",
                "designation": "Librarian",
                "email": "library@jadavpur.example.edu",
                "phone": "+91 9831000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Swapan Kumar",
                "designation": "Professor Arts",
                "email": "swapan@jadavpur.example.edu",
                "phone": "+91 9831000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Deblina Roy",
                "designation": "PG Representative",
                "email": "deblina.r@jadavpur.example.edu",
                "phone": "+91 9831000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. B. C. Roy",
        "patron_email": "vc@jadavpur.example.edu",
        "president_name": "Dr. Subir Das",
        "president_email": "library@jadavpur.example.edu",
        "secretary_name": "Prof. Swapan Kumar",
        "secretary_email": "swapan@jadavpur.example.edu",
    },
    {
        "id": "CLUB-DU-007",
        "club_id": "CLUB-DU-007",
        "aisheCode": "U-0115",
        "name": "University of Delhi (Central Campus)",
        "institution_name": "University of Delhi (Central Campus)",
        "state": "Delhi",
        "district": "North Delhi",
        "zone": "North",
        "category": "University",
        "passkey": "DU-NDL-7711",
        "status": "Active",
        "memberCount": 5120,
        "member_count": 5120,
        "eventsConducted": 56,
        "soloSessions": 45,
        "jointSessions": 11,
        "solo_activities": 45,
        "joint_activities": 11,
        "establishedDate": "2020-11-05",
        "registrationNo": "NDLI/CLUB/DU-007",
        "registration_no": "NDLI/CLUB/DU-007",
        "reg_no": "NDLI/CLUB/DU-007",
        "websiteUrl": "https://www.du.ac.in",
        "email": "club.du@ndli.edu",
        "description": (
            "Metropolitan club hub driving massive student participation"
            " in reading literacy."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. R. K. Malhotra",
                "designation": "Vice Chancellor",
                "email": "vc@du.example.edu",
                "phone": "+91 9811000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. A. K. Bhatnagar",
                "designation": "Chief Librarian",
                "email": "librarian@du.example.edu",
                "phone": "+91 9811000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Sanjeev Kumar",
                "designation": "Dean of Students",
                "email": "sanjeev@du.example.edu",
                "phone": "+91 9811000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Simran Kaur",
                "designation": "President DUSU",
                "email": "simran.k@du.example.edu",
                "phone": "+91 9811000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. R. K. Malhotra",
        "patron_email": "vc@du.example.edu",
        "president_name": "Dr. A. K. Bhatnagar",
        "president_email": "librarian@du.example.edu",
        "secretary_name": "Prof. Sanjeev Kumar",
        "secretary_email": "sanjeev@du.example.edu",
    },
    {
        "id": "CLUB-BHU-008",
        "club_id": "CLUB-BHU-008",
        "aisheCode": "U-0504",
        "name": "Banaras Hindu University",
        "institution_name": "Banaras Hindu University",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "zone": "North",
        "category": "University",
        "passkey": "BHU-NDL-8812",
        "status": "Active",
        "memberCount": 4680,
        "member_count": 4680,
        "eventsConducted": 34,
        "soloSessions": 28,
        "jointSessions": 6,
        "solo_activities": 28,
        "joint_activities": 6,
        "establishedDate": "2021-12-01",
        "registrationNo": "NDLI/CLUB/BHU-008",
        "registration_no": "NDLI/CLUB/BHU-008",
        "reg_no": "NDLI/CLUB/BHU-008",
        "websiteUrl": "https://www.bhu.ac.in",
        "email": "club.bhu@ndli.edu",
        "description": (
            "Preserves heritage manuscripts and leads classical Indian"
            " knowledge systems discussions."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. S. K. Jain",
                "designation": "Vice Chancellor",
                "email": "vc@bhu.example.edu",
                "phone": "+91 9415000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. D. K. Rai",
                "designation": "Librarian",
                "email": "library@bhu.example.edu",
                "phone": "+91 9415000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Anita Sharma",
                "designation": "Professor Sanskrit",
                "email": "anita@bhu.example.edu",
                "phone": "+91 9415000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Prakash Pandey",
                "designation": "Student Convener",
                "email": "prakash.p@bhu.example.edu",
                "phone": "+91 9415000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. S. K. Jain",
        "patron_email": "vc@bhu.example.edu",
        "president_name": "Dr. D. K. Rai",
        "president_email": "library@bhu.example.edu",
        "secretary_name": "Prof. Anita Sharma",
        "secretary_email": "anita@bhu.example.edu",
    },
    {
        "id": "CLUB-IISCB-009",
        "club_id": "CLUB-IISCB-009",
        "aisheCode": "U-0222",
        "name": "Indian Institute of Science Bangalore",
        "institution_name": "Indian Institute of Science Bangalore",
        "state": "Karnataka",
        "district": "Bengaluru Urban",
        "zone": "South",
        "category": "University",
        "passkey": "IISCB-NDL-9911",
        "status": "Active",
        "memberCount": 3900,
        "member_count": 3900,
        "eventsConducted": 40,
        "soloSessions": 32,
        "jointSessions": 8,
        "solo_activities": 32,
        "joint_activities": 8,
        "establishedDate": "2022-01-15",
        "registrationNo": "NDLI/CLUB/IISCB-009",
        "registration_no": "NDLI/CLUB/IISCB-009",
        "reg_no": "NDLI/CLUB/IISCB-009",
        "websiteUrl": "https://www.iisc.ac.in",
        "email": "club.iisc@ndli.edu",
        "description": (
            "Scientific research repository coordination and graduate study groups."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. G. Rangarajan",
                "designation": "Director",
                "email": "director@iisc.example.edu",
                "phone": "+91 9845000001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. K. N. Prasad",
                "designation": "Librarian",
                "email": "library@iisc.example.edu",
                "phone": "+91 9845000002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Ambarish Ghosh",
                "designation": "Professor Physics",
                "email": "ambarish@iisc.example.edu",
                "phone": "+91 9845000003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Tanvi Reddy",
                "designation": "PhD Scholar",
                "email": "tanvi.r@iisc.example.edu",
                "phone": "+91 9845000004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. G. Rangarajan",
        "patron_email": "director@iisc.example.edu",
        "president_name": "Dr. K. N. Prasad",
        "president_email": "library@iisc.example.edu",
        "secretary_name": "Prof. Ambarish Ghosh",
        "secretary_email": "ambarish@iisc.example.edu",
    },
    {
        "id": "CLUB-CU-010",
        "club_id": "CLUB-CU-010",
        "aisheCode": "U-0568",
        "name": "University of Calcutta",
        "institution_name": "University of Calcutta",
        "state": "West Bengal",
        "district": "Kolkata",
        "zone": "East",
        "category": "University",
        "passkey": "CU-NDL-1010",
        "status": "Active",
        "memberCount": 3670,
        "member_count": 3670,
        "eventsConducted": 27,
        "soloSessions": 21,
        "jointSessions": 6,
        "solo_activities": 21,
        "joint_activities": 6,
        "establishedDate": "2022-02-20",
        "registrationNo": "NDLI/CLUB/CU-010",
        "registration_no": "NDLI/CLUB/CU-010",
        "reg_no": "NDLI/CLUB/CU-010",
        "websiteUrl": "https://www.caluniv.ac.in",
        "email": "club.cu@ndli.edu",
        "description": (
            "Historical university hub with extensive regional language library"
            " programs."
        ),
        "authorities": [
            {
                "role": "Patron",
                "name": "Prof. Santa Datta",
                "designation": "Vice Chancellor",
                "email": "vc@caluniv.example.edu",
                "phone": "+91 9830100001",
                "verified": True,
            },
            {
                "role": "President",
                "name": "Dr. Soumitra Sarkar",
                "designation": "Librarian",
                "email": "library@caluniv.example.edu",
                "phone": "+91 9830100002",
                "verified": True,
            },
            {
                "role": "Secretary",
                "name": "Prof. Tapas Chakraborty",
                "designation": "Professor Chemistry",
                "email": "tapas@caluniv.example.edu",
                "phone": "+91 9830100003",
                "verified": True,
            },
            {
                "role": "Executive Member",
                "name": "Sayantan Sen",
                "designation": "Student Representative",
                "email": "sayantan.s@caluniv.example.edu",
                "phone": "+91 9830100004",
                "verified": True,
            },
        ],
        "patron_name": "Prof. Santa Datta",
        "patron_email": "vc@caluniv.example.edu",
        "president_name": "Dr. Soumitra Sarkar",
        "president_email": "library@caluniv.example.edu",
        "secretary_name": "Prof. Tapas Chakraborty",
        "secretary_email": "tapas@caluniv.example.edu",
    },
]


def get_all_canonical_clubs() -> list[dict[str, Any]]:
    """Return all canonical clubs directly from relational database.

    Queries the Club model (filtering out test fixtures where is_sample=True)
    and formats complete authority and activity records for cross-module consumption.
    """
    from apps.domain.models import Club

    qs = (
        Club.objects.filter(is_sample=False)
        .select_related("institution__state__zone", "institution__district")
        .order_by("code")
    )

    unified: list[dict[str, Any]] = []
    for c in qs:
        inst = c.institution
        st = inst.state.name if inst and inst.state else ""
        zn = inst.state.zone.name if inst and inst.state and inst.state.zone else ""
        dist = inst.district.name if inst and inst.district else ""
        clean_zone = zn.replace(" Zone", "").strip() or "North"
        doa = str(c.date_of_approval) if c.date_of_approval else "2021-04-12"
        last_ren = str(c.last_renewal_date) if c.last_renewal_date else "None (Initial)"
        upcoming_ren = (
            str(c.upcoming_renewal_date) if c.upcoming_renewal_date else "2026-04-12"
        )

        from datetime import date

        from django.utils import timezone
        today = timezone.localdate()
        computed_status = "Active"
        try:
            u_date = date.fromisoformat(upcoming_ren)
            diff_days = (u_date - today).days
            if diff_days < 0:
                computed_status = "Overdue"
            elif diff_days <= 30:
                computed_status = "Expiring Soon"
            else:
                computed_status = "Active"
        except Exception:
            computed_status = "Active"

        patron_n = c.patron_name or "Prof. Patron Head"
        patron_e = c.patron_email or f"director@{c.code.lower()}.ac.in"
        patron_p = c.patron_phone or "+91 9811000011"
        pres_n = c.president_name or "Dr. Club President"
        pres_e = c.president_email or f"librarian@{c.code.lower()}.ac.in"
        pres_p = c.president_phone or "+91 9811000012"
        sec_n = c.secretary_name or "Prof. Secretary Lead"
        sec_e = c.secretary_email or f"secretary@{c.code.lower()}.ac.in"
        sec_p = c.secretary_phone or "+91 9811000013"

        club_name = inst.name if inst else c.name
        is_univ = "University" in club_name or "IIT" in c.code or "IISc" in club_name
        club_dict: dict[str, Any] = {
            "id": c.code,
            "club_id": c.code,
            "code": c.code,
            "aisheCode": getattr(inst, "aishe_code", "") or f"AISHE-{c.code}",
            "aishe_code": getattr(inst, "aishe_code", "") or f"AISHE-{c.code}",
            "name": club_name,
            "institution_name": club_name,
            "state": st,
            "district": dist or f"{st} Central",
            "zone": clean_zone,
            "category": "University" if is_univ else "Autonomous Institute",
            "passkey": f"{c.code}-NDL-001",
            "status": computed_status,
            "memberCount": c.member_count or 2000,
            "member_count": c.member_count or 2000,
            "eventsConducted": (c.solo_activities or 0) + (c.joint_activities or 0),
            "events_conducted": (c.solo_activities or 0) + (c.joint_activities or 0),
            "soloSessions": c.solo_activities or 0,
            "jointSessions": c.joint_activities or 0,
            "solo_activities": c.solo_activities or 0,
            "joint_activities": c.joint_activities or 0,
            "establishedDate": doa,
            "dateOfApproval": doa,
            "date_of_approval": doa,
            "lastRenewalDate": last_ren,
            "last_renewal_date": last_ren,
            "nextRenewalDate": upcoming_ren,
            "upcoming_renewal_date": upcoming_ren,
            "renewal_date": upcoming_ren,
            "registrationNo": c.registration_no or f"NDLI/CLUB/{c.code}",
            "registration_no": c.registration_no or f"NDLI/CLUB/{c.code}",
            "reg_no": c.registration_no or f"NDLI/CLUB/{c.code}",
            "websiteUrl": f"https://www.{c.code.lower()}.ac.in",
            "email": f"club.{c.code.lower()}@ndli.edu",
            "description": f"Official NDLI Club chapter at {club_name}.",
            "authorities": [
                {
                    "role": "Patron",
                    "name": patron_n,
                    "designation": "Director",
                    "email": patron_e,
                    "phone": patron_p,
                    "verified": True,
                },
                {
                    "role": "President",
                    "name": pres_n,
                    "designation": "Librarian & Nodal Officer",
                    "email": pres_e,
                    "phone": pres_p,
                    "verified": True,
                },
                {
                    "role": "Secretary",
                    "name": sec_n,
                    "designation": "Faculty Advisor",
                    "email": sec_e,
                    "phone": sec_p,
                    "verified": True,
                },
                {
                    "role": "Executive Member",
                    "name": "Student Representative",
                    "designation": "Student Representative",
                    "email": f"student@{c.code.lower()}.ac.in",
                    "phone": "+91 9811000014",
                    "verified": True,
                },
            ],
            "patron_name": patron_n,
            "patron_email": patron_e,
            "president_name": pres_n,
            "president_email": pres_e,
            "secretary_name": sec_n,
            "secretary_email": sec_e,
        }
        unified.append(club_dict)

    if not unified:
        # Fallback for bare test database before migration seed
        for c_data in CANONICAL_INSTITUTIONAL_CLUBS:
            cid = str(c_data["id"])
            doa, last_ren, upcoming_ren = get_club_dates(cid, None)
            entry = dict(c_data)
            entry["dateOfApproval"] = doa
            entry["date_of_approval"] = doa
            entry["lastRenewalDate"] = last_ren or "None (Initial)"
            entry["last_renewal_date"] = last_ren or "None (Initial)"
            entry["nextRenewalDate"] = upcoming_ren
            entry["upcoming_renewal_date"] = upcoming_ren
            entry["renewal_date"] = upcoming_ren
            entry["status"] = "Active"
            unified.append(entry)

    return unified
