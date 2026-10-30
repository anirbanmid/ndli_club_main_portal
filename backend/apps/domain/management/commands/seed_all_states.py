"""Management command to seed canonical NDLI Clubs for all 36 States & UTs.

Ensures:
1. Every State/UT has an assigned Regional Officer in domain.OfficerAssignment.
2. Every Club is created and gated through its Regional Officer, writing an immutable
   'Club Approval' entry in ActivityLog.
3. Every Club has an active Authority account (President) with standard credentials:
   Password: NdliClub@2026!
   Passkey: <CLUB_CODE>-NDL-001
"""

from __future__ import annotations

from datetime import date
from typing import Any

from django.core.management.base import BaseCommand

from apps.accounts.models import AccountState, Category, SubRole, User
from apps.domain.assignments import invalidate_officer_cache
from apps.domain.integrity import LedgerIntegrityEngine
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    OfficerAssignment,
    State,
)

STANDARD_PASSWORD = "NdliClub@2026!"

OFFICER_STATE_MAP = {
    # EMP01: North Zone
    "DELHI": "EMP01",
    "HARYANA": "EMP01",
    "PUNJAB": "EMP01",
    "UTTAR_PRADESH": "EMP01",
    "JAMMU_AND_KASHMIR": "EMP01",
    "HIMACHAL_PRADESH": "EMP01",
    "UTTARAKHAND": "EMP01",
    "CHANDIGARH": "EMP01",
    "LADAKH": "EMP01",
    # EMP02: Central Zone
    "MADHYA_PRADESH": "EMP02",
    "CHHATTISGARH": "EMP02",
    # EMP03: West Zone
    "MAHARASHTRA": "EMP03",
    "GUJARAT": "EMP03",
    "RAJASTHAN": "EMP03",
    "GOA": "EMP03",
    "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU": "EMP03",
    # EMP04: East Zone
    "WEST_BENGAL": "EMP04",
    "BIHAR": "EMP04",
    "JHARKHAND": "EMP04",
    "ODISHA": "EMP04",
    "SIKKIM": "EMP04",
    # EMP05: North East Zone
    "ASSAM": "EMP05",
    "MANIPUR": "EMP05",
    "MEGHALAYA": "EMP05",
    "TRIPURA": "EMP05",
    "ARUNACHAL_PRADESH": "EMP05",
    "MIZORAM": "EMP05",
    "NAGALAND": "EMP05",
    # EMP06: South Zone - A
    "KARNATAKA": "EMP06",
    "TELANGANA": "EMP06",
    "ANDHRA_PRADESH": "EMP06",
    # EMP07: South Zone - B
    "TAMIL_NADU": "EMP07",
    "KERALA": "EMP07",
    "PUDUCHERRY": "EMP07",
    "ANDAMAN_AND_NICOBAR_ISLANDS": "EMP07",
    "LAKSHADWEEP": "EMP07",
}

ALL_STATE_CLUBS: list[dict[str, Any]] = [
    {
        "state_code": "ANDAMAN_AND_NICOBAR_ISLANDS",
        "club_code": "CLUB-AN-JNRM-001",
        "inst_name": "Jawaharlal Nehru Rajkeeya Mahavidyalaya",
        "district": "South Andaman",
        "category": "College",
        "pres_name": "Dr. H. K. Sharma",
        "sec_name": "Prof. S. B. Rao",
        "patron_name": "Prof. Principal JNRM",
        "member_count": 1820,
        "doa": "2023-01-15",
        "last_ren": "2025-01-15",
        "next_ren": "2026-01-15",
    },
    {
        "state_code": "ANDHRA_PRADESH",
        "club_code": "CLUB-AP-AU-001",
        "inst_name": "Andhra University",
        "district": "Visakhapatnam",
        "category": "University",
        "pres_name": "Dr. P. V. Prasad",
        "sec_name": "Prof. K. Satyanarayana",
        "patron_name": "Prof. P. V. G. D. Prasad Reddy",
        "member_count": 3450,
        "doa": "2022-04-10",
        "last_ren": "2025-04-10",
        "next_ren": "2026-04-10",
    },
    {
        "state_code": "ARUNACHAL_PRADESH",
        "club_code": "CLUB-AR-RGU-001",
        "inst_name": "Rajiv Gandhi University",
        "district": "Papum Pare",
        "category": "University",
        "pres_name": "Dr. T. Mibang",
        "sec_name": "Prof. N. K. Singh",
        "patron_name": "Prof. S. K. Nayak",
        "member_count": 1640,
        "doa": "2023-03-20",
        "last_ren": "2025-03-20",
        "next_ren": "2026-03-20",
    },
    {
        "state_code": "ASSAM",
        "club_code": "CLUB-AS-GU-001",
        "inst_name": "Gauhati University",
        "district": "Kamrup Metropolitan",
        "category": "University",
        "pres_name": "Dr. B. K. Sarma",
        "sec_name": "Prof. P. J. Das",
        "patron_name": "Prof. Pratap Jyoti Handique",
        "member_count": 3120,
        "doa": "2022-06-15",
        "last_ren": "2025-06-15",
        "next_ren": "2026-06-15",
    },
    {
        "state_code": "BIHAR",
        "club_code": "CLUB-BR-PU-001",
        "inst_name": "Patna University",
        "district": "Patna",
        "category": "University",
        "pres_name": "Dr. R. K. Sinha",
        "sec_name": "Prof. M. N. Jha",
        "patron_name": "Prof. Girish Kumar Choudhary",
        "member_count": 2980,
        "doa": "2022-02-18",
        "last_ren": "2025-02-18",
        "next_ren": "2026-02-18",
    },
    {
        "state_code": "CHANDIGARH",
        "club_code": "CLUB-CH-PU-001",
        "inst_name": "Panjab University Chandigarh",
        "district": "Chandigarh",
        "category": "University",
        "pres_name": "Dr. J. K. Sehgal",
        "sec_name": "Prof. R. P. Sharma",
        "patron_name": "Prof. Renu Vig",
        "member_count": 3650,
        "doa": "2021-08-25",
        "last_ren": "2025-08-25",
        "next_ren": "2026-08-25",
    },
    {
        "state_code": "CHHATTISGARH",
        "club_code": "CLUB-CG-RSU-001",
        "inst_name": "Pt. Ravishankar Shukla University",
        "district": "Raipur",
        "category": "University",
        "pres_name": "Dr. S. K. Verma",
        "sec_name": "Prof. A. K. Gupta",
        "patron_name": "Prof. K. L. Verma",
        "member_count": 2420,
        "doa": "2022-09-12",
        "last_ren": "2025-09-12",
        "next_ren": "2026-09-12",
    },
    {
        "state_code": "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU",
        "club_code": "CLUB-DN-GCD-001",
        "inst_name": "Government College Daman",
        "district": "Daman",
        "category": "College",
        "pres_name": "Dr. R. B. Patel",
        "sec_name": "Prof. M. D. Shah",
        "patron_name": "Prof. Principal GCD",
        "member_count": 1450,
        "doa": "2023-05-14",
        "last_ren": "2025-05-14",
        "next_ren": "2026-05-14",
    },
    {
        "state_code": "DELHI",
        "club_code": "CLUB-IITD-002",
        "inst_name": "Indian Institute of Technology Delhi",
        "district": "South Delhi",
        "category": "University",
        "pres_name": "Dr. Nabi Hasan",
        "sec_name": "Prof. B. K. Panigrahi",
        "patron_name": "Prof. Rangan Banerjee",
        "member_count": 3950,
        "doa": "2021-05-10",
        "last_ren": "2025-05-10",
        "next_ren": "2026-05-10",
    },
    {
        "state_code": "GOA",
        "club_code": "CLUB-GA-GU-001",
        "inst_name": "Goa University",
        "district": "North Goa",
        "category": "University",
        "pres_name": "Dr. G. K. Naik",
        "sec_name": "Prof. R. S. Fernandes",
        "patron_name": "Prof. Harilal B. Menon",
        "member_count": 2180,
        "doa": "2022-11-20",
        "last_ren": "2025-11-20",
        "next_ren": "2026-11-20",
    },
    {
        "state_code": "GUJARAT",
        "club_code": "CLUB-GJ-GU-001",
        "inst_name": "Gujarat University",
        "district": "Ahmedabad",
        "category": "University",
        "pres_name": "Dr. N. R. Pandya",
        "sec_name": "Prof. P. C. Joshi",
        "patron_name": "Prof. Neerja A. Gupta",
        "member_count": 3520,
        "doa": "2021-12-05",
        "last_ren": "2025-12-05",
        "next_ren": "2026-12-05",
    },
    {
        "state_code": "HARYANA",
        "club_code": "CLUB-HR-KU-001",
        "inst_name": "Kurukshetra University",
        "district": "Kurukshetra",
        "category": "University",
        "pres_name": "Dr. C. P. Sharma",
        "sec_name": "Prof. R. K. Deswal",
        "patron_name": "Prof. Som Nath Sachdeva",
        "member_count": 2890,
        "doa": "2022-07-10",
        "last_ren": "2025-07-10",
        "next_ren": "2026-07-10",
    },
    {
        "state_code": "HIMACHAL_PRADESH",
        "club_code": "CLUB-HP-HPU-001",
        "inst_name": "Himachal Pradesh University",
        "district": "Shimla",
        "category": "University",
        "pres_name": "Dr. V. K. Sharma",
        "sec_name": "Prof. S. L. Kaushal",
        "patron_name": "Prof. S. P. Bansal",
        "member_count": 2340,
        "doa": "2022-10-05",
        "last_ren": "2025-10-05",
        "next_ren": "2026-10-05",
    },
    {
        "state_code": "JAMMU_AND_KASHMIR",
        "club_code": "CLUB-JK-UOK-001",
        "inst_name": "University of Kashmir",
        "district": "Srinagar",
        "category": "University",
        "pres_name": "Dr. M. Ishaq",
        "sec_name": "Prof. G. N. Dar",
        "patron_name": "Prof. Nilofer Khan",
        "member_count": 2780,
        "doa": "2022-08-14",
        "last_ren": "2025-08-14",
        "next_ren": "2026-08-14",
    },
    {
        "state_code": "JHARKHAND",
        "club_code": "CLUB-JH-RU-001",
        "inst_name": "Ranchi University",
        "district": "Ranchi",
        "category": "University",
        "pres_name": "Dr. A. K. Choudhary",
        "sec_name": "Prof. S. N. Munda",
        "patron_name": "Prof. Ajit Kumar Sinha",
        "member_count": 2650,
        "doa": "2022-05-19",
        "last_ren": "2025-05-19",
        "next_ren": "2026-05-19",
    },
    {
        "state_code": "KARNATAKA",
        "club_code": "CLUB-IISCB-009",
        "inst_name": "Indian Institute of Science Bangalore",
        "district": "Bangalore Urban",
        "category": "University",
        "pres_name": "Dr. Francis Jayakanth",
        "sec_name": "Prof. N. Balakrishnan",
        "patron_name": "Prof. Govindan Rangarajan",
        "member_count": 3780,
        "doa": "2022-01-15",
        "last_ren": "2025-01-15",
        "next_ren": "2026-01-15",
    },
    {
        "state_code": "KERALA",
        "club_code": "CLUB-KL-UOK-001",
        "inst_name": "University of Kerala",
        "district": "ThiruvananthORam",
        "category": "University",
        "pres_name": "Dr. A. Gopikuttan",
        "sec_name": "Prof. K. G. Gopchandran",
        "patron_name": "Prof. Mohanan Kunnummal",
        "member_count": 3190,
        "doa": "2022-03-12",
        "last_ren": "2025-03-12",
        "next_ren": "2026-03-12",
    },
    {
        "state_code": "LADAKH",
        "club_code": "CLUB-LA-UOL-001",
        "inst_name": "University of Ladakh",
        "district": "Leh",
        "category": "University",
        "pres_name": "Dr. T. Norboo",
        "sec_name": "Prof. S. Dorje",
        "patron_name": "Prof. S. K. Mehta",
        "member_count": 1280,
        "doa": "2023-06-21",
        "last_ren": "2025-06-21",
        "next_ren": "2026-06-21",
    },
    {
        "state_code": "LAKSHADWEEP",
        "club_code": "CLUB-LD-CUC-001",
        "inst_name": "Calicut University Centre Kavaratti",
        "district": "Lakshadweep",
        "category": "College",
        "pres_name": "Dr. M. K. Koya",
        "sec_name": "Prof. P. P. Sayed",
        "patron_name": "Prof. Centre Director CUC",
        "member_count": 890,
        "doa": "2023-04-10",
        "last_ren": "2025-04-10",
        "next_ren": "2026-04-10",
    },
    {
        "state_code": "MADHYA_PRADESH",
        "club_code": "CLUB-MP-BU-001",
        "inst_name": "Barkatullah University Bhopal",
        "district": "Bhopal",
        "category": "University",
        "pres_name": "Dr. R. K. Chhabra",
        "sec_name": "Prof. D. C. Gupta",
        "patron_name": "Prof. S. K. Jain",
        "member_count": 2840,
        "doa": "2022-04-22",
        "last_ren": "2025-04-22",
        "next_ren": "2026-04-22",
    },
    {
        "state_code": "MAHARASHTRA",
        "club_code": "CLUB-IITB-003",
        "inst_name": "Indian Institute of Technology Bombay",
        "district": "Mumbai Suburban",
        "category": "University",
        "pres_name": "Dr. Manju Naika",
        "sec_name": "Prof. P. V. Balaji",
        "patron_name": "Prof. Shireesh Kedare",
        "member_count": 4120,
        "doa": "2021-08-15",
        "last_ren": "2025-08-15",
        "next_ren": "2026-08-15",
    },
    {
        "state_code": "MANIPUR",
        "club_code": "CLUB-MN-MU-001",
        "inst_name": "Manipur University",
        "district": "Imphal West",
        "category": "University",
        "pres_name": "Dr. Ch. Ibohal Singh",
        "sec_name": "Prof. N. Lokendra Singh",
        "patron_name": "Prof. N. Lokendra Singh",
        "member_count": 1980,
        "doa": "2022-09-05",
        "last_ren": "2025-09-05",
        "next_ren": "2026-09-05",
    },
    {
        "state_code": "MEGHALAYA",
        "club_code": "CLUB-ML-NEHU-001",
        "inst_name": "North-Eastern Hill University",
        "district": "East Khasi Hills",
        "category": "University",
        "pres_name": "Dr. F. R. Sumer",
        "sec_name": "Prof. S. R. Joshi",
        "patron_name": "Prof. Prabha Shankar Shukla",
        "member_count": 2230,
        "doa": "2022-08-10",
        "last_ren": "2025-08-10",
        "next_ren": "2026-08-10",
    },
    {
        "state_code": "MIZORAM",
        "club_code": "CLUB-MZ-MZU-001",
        "inst_name": "Mizoram University",
        "district": "Aizawl",
        "category": "University",
        "pres_name": "Dr. Akhandanand Shukla",
        "sec_name": "Prof. Lalnilawma",
        "patron_name": "Prof. Dibakar Chandra Deka",
        "member_count": 1750,
        "doa": "2023-02-14",
        "last_ren": "2025-02-14",
        "next_ren": "2026-02-14",
    },
    {
        "state_code": "NAGALAND",
        "club_code": "CLUB-NL-NU-001",
        "inst_name": "Nagaland University",
        "district": "Zunheboto",
        "category": "University",
        "pres_name": "Dr. T. Temjen",
        "sec_name": "Prof. Sangyu Yaden",
        "patron_name": "Prof. Jagadish Kumar Patnaik",
        "member_count": 1620,
        "doa": "2023-01-20",
        "last_ren": "2025-01-20",
        "next_ren": "2026-01-20",
    },
    {
        "state_code": "ODISHA",
        "club_code": "CLUB-OD-UU-001",
        "inst_name": "Utkal University",
        "district": "Khordha",
        "category": "University",
        "pres_name": "Dr. B. K. Choudhury",
        "sec_name": "Prof. P. K. Hota",
        "patron_name": "Prof. Sabita Acharya",
        "member_count": 3150,
        "doa": "2022-03-30",
        "last_ren": "2025-03-30",
        "next_ren": "2026-03-30",
    },
    {
        "state_code": "PUDUCHERRY",
        "club_code": "CLUB-PY-PU-001",
        "inst_name": "Pondicherry University",
        "district": "Puducherry",
        "category": "University",
        "pres_name": "Dr. M. Vijayakumar",
        "sec_name": "Prof. K. Chandrasekhara Rao",
        "patron_name": "Prof. Gurmeet Singh",
        "member_count": 2870,
        "doa": "2022-06-18",
        "last_ren": "2025-06-18",
        "next_ren": "2026-06-18",
    },
    {
        "state_code": "PUNJAB",
        "club_code": "CLUB-PB-PUP-001",
        "inst_name": "Punjabi University Patiala",
        "district": "Patiala",
        "category": "University",
        "pres_name": "Dr. H. P. S. Kalra",
        "sec_name": "Prof. A. S. Chawla",
        "patron_name": "Prof. Arvind",
        "member_count": 3280,
        "doa": "2022-01-28",
        "last_ren": "2025-01-28",
        "next_ren": "2026-01-28",
    },
    {
        "state_code": "RAJASTHAN",
        "club_code": "CLUB-RJ-UOR-001",
        "inst_name": "University of Rajasthan",
        "district": "Jaipur",
        "category": "University",
        "pres_name": "Dr. Nandani Sharma",
        "sec_name": "Prof. S. L. Sharma",
        "patron_name": "Prof. Alpana Kateja",
        "member_count": 3610,
        "doa": "2021-11-12",
        "last_ren": "2025-11-12",
        "next_ren": "2026-11-12",
    },
    {
        "state_code": "SIKKIM",
        "club_code": "CLUB-SK-SU-001",
        "inst_name": "Sikkim University",
        "district": "East Sikkim",
        "category": "University",
        "pres_name": "Dr. Manasesh Kumar",
        "sec_name": "Prof. S. S. Sharma",
        "patron_name": "Prof. Avinash Khare",
        "member_count": 1580,
        "doa": "2023-05-18",
        "last_ren": "2025-05-18",
        "next_ren": "2026-05-18",
    },
    {
        "state_code": "TAMIL_NADU",
        "club_code": "CLUB-IITM-004",
        "inst_name": "Indian Institute of Technology Madras",
        "district": "Chennai",
        "category": "University",
        "pres_name": "Dr. K. Ramasamy",
        "sec_name": "Prof. V. Kamakoti",
        "patron_name": "Prof. V. Kamakoti",
        "member_count": 3890,
        "doa": "2021-09-01",
        "last_ren": "2025-09-01",
        "next_ren": "2026-09-01",
    },
    {
        "state_code": "TELANGANA",
        "club_code": "CLUB-TS-OU-001",
        "inst_name": "Osmania University",
        "district": "Hyderabad",
        "category": "University",
        "pres_name": "Dr. A. S. Chakravarthy",
        "sec_name": "Prof. B. Sudhakar Reddy",
        "patron_name": "Prof. D. Ravinder",
        "member_count": 3720,
        "doa": "2021-10-25",
        "last_ren": "2025-10-25",
        "next_ren": "2026-10-25",
    },
    {
        "state_code": "TRIPURA",
        "club_code": "CLUB-TR-TU-001",
        "inst_name": "Tripura University",
        "district": "West Tripura",
        "category": "University",
        "pres_name": "Dr. B. Sutradhar",
        "sec_name": "Prof. S. Poddar",
        "patron_name": "Prof. Ganga Prasad Prasain",
        "member_count": 1940,
        "doa": "2022-11-15",
        "last_ren": "2025-11-15",
        "next_ren": "2026-11-15",
    },
    {
        "state_code": "UTTAR_PRADESH",
        "club_code": "CLUB-BHU-008",
        "inst_name": "Banaras Hindu University",
        "district": "Varanasi",
        "category": "University",
        "pres_name": "Dr. D. K. Singh",
        "sec_name": "Prof. R. R. Pandey",
        "patron_name": "Prof. Sudhir K. Jain",
        "member_count": 4250,
        "doa": "2021-12-01",
        "last_ren": "2025-12-01",
        "next_ren": "2026-12-01",
    },
    {
        "state_code": "UTTARAKHAND",
        "club_code": "CLUB-UK-HNB-001",
        "inst_name": "Hemvati Nandan Bahuguna Garhwal University",
        "district": "Pauri Garhwal",
        "category": "University",
        "pres_name": "Dr. R. K. Bhatt",
        "sec_name": "Prof. M. S. Rawat",
        "patron_name": "Prof. Annpurna Nautiyal",
        "member_count": 2680,
        "doa": "2022-09-28",
        "last_ren": "2025-09-28",
        "next_ren": "2026-09-28",
    },
    {
        "state_code": "WEST_BENGAL",
        "club_code": "CLUB-IITKGP-001",
        "inst_name": "Indian Institute of Technology Kharagpur",
        "district": "Paschim Medinipur",
        "category": "University",
        "pres_name": "Dr. S. K. Iyer",
        "sec_name": "Prof. M. Banerjee",
        "patron_name": "Prof. V. K. Tewari",
        "member_count": 4350,
        "doa": "2021-04-12",
        "last_ren": "2025-04-12",
        "next_ren": "2026-04-12",
    },
]


class Command(BaseCommand):
    help = "Seed at least 1 canonical NDLI Club for every State and UT in India."

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write("=" * 80)
        self.stdout.write(
            "STEP 1: Reconciling Officer Assignments across all 36 States & UTs..."
        )
        self.stdout.write("=" * 80)

        for state_code, emp_code in OFFICER_STATE_MAP.items():
            state = State.objects.filter(code=state_code).first()
            if not state:
                continue
            officer = User.objects.filter(username=emp_code, is_active=True).first()
            if not officer:
                self.stdout.write(f"Warning: Officer {emp_code} not found.")
                continue

            oa, created = OfficerAssignment.objects.get_or_create(
                state=state,
                defaults={"officer": officer, "from_date": date(2020, 1, 1)},
            )
            if oa.officer != officer:
                oa.officer = officer
                oa.save(update_fields=["officer"])
                self.stdout.write(
                    f"Updated OfficerAssignment: {state.name} -> {officer.username}"
                )
            elif created:
                self.stdout.write(
                    f"Created OfficerAssignment: {state.name} -> {officer.username}"
                )

        invalidate_officer_cache()

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(
            "STEP 2: Creating Canonical Clubs and Authority Credentials..."
        )
        self.stdout.write("=" * 80)

        for item in ALL_STATE_CLUBS:
            st_code = item["state_code"]
            state = State.objects.filter(code=st_code).first()
            if not state:
                self.stdout.write(f"Error: State {st_code} not found in DB.")
                continue

            emp_code = OFFICER_STATE_MAP.get(st_code, "EMP01")
            officer = User.objects.get(username=emp_code)

            # 1. District
            district_name = item["district"]
            dist_code = f"DIST-{st_code[:4]}-01"
            district, _ = District.objects.get_or_create(
                state=state,
                name=district_name,
                defaults={"code": dist_code},
            )

            # 2. Institution
            inst_name = item["inst_name"]
            inst_code = f"INST-{item['club_code'].replace('CLUB-', '')}"
            inst, _ = Institution.objects.get_or_create(
                name=inst_name,
                state=state,
                defaults={
                    "code": inst_code,
                    "legacy_id": f"leg-{inst_code.lower()}",
                    "district": district,
                    "status": Institution.Status.ACTIVE,
                },
            )

            # 3. Club
            c_code = item["club_code"]
            c_date = date.fromisoformat(item["doa"])
            l_ren = date.fromisoformat(item["last_ren"])
            n_ren = date.fromisoformat(item["next_ren"])

            club, created = Club.objects.get_or_create(
                code=c_code,
                defaults={
                    "institution": inst,
                    "name": inst_name,
                    "status": Club.Status.ACTIVE,
                    "registration_no": f"NDLI/CLUB/{c_code}",
                    "date_of_approval": c_date,
                    "last_renewal_date": l_ren,
                    "upcoming_renewal_date": n_ren,
                    "member_count": item["member_count"],
                    "solo_activities": 25,
                    "joint_activities": 5,
                    "patron_name": item["patron_name"],
                    "patron_email": f"patron@{c_code.lower()}.ac.in",
                    "president_name": item["pres_name"],
                    "president_email": f"president@{c_code.lower()}.ac.in",
                    "secretary_name": item["sec_name"],
                    "secretary_email": f"secretary@{c_code.lower()}.ac.in",
                    "is_sample": False,
                },
            )
            if not created and getattr(club, "is_sample", False):
                club.is_sample = False
                club.save(update_fields=["is_sample"])

            # 4. Trigger State-Gated Hard Check Gate (ActivityLog entry)
            LedgerIntegrityEngine.ensure_club_approval_log(
                club,
                officer=officer,
                timestamp=c_date,
                strict_gate=False,
            )

            # 5. Authority User (President Account)
            pres_username = f"pres.{c_code.lower().replace('club-', '')}"
            pres_email = f"pres.{c_code.lower()}@ndli.edu"
            user, _ = User.objects.get_or_create(
                username=pres_username,
                defaults={
                    "email": pres_email,
                    "category": Category.CLUB_ADMIN,
                    "sub_role": SubRole.CLUB_PRESIDENT,
                    "account_state": AccountState.ACTIVE,
                    "first_name": item["pres_name"],
                    "is_active": True,
                },
            )
            user.set_password(STANDARD_PASSWORD)
            user.save()

            # Link AuthorityAssignment
            AuthorityAssignment.objects.get_or_create(
                user=user,
                club=club,
                tier="President",
                defaults={
                    "from_date": c_date,
                    "status": AuthorityAssignment.Status.ACTIVE,
                },
            )

        # Ensure all canonical clubs have president authority credentials
        for club in Club.objects.filter(is_sample=False):
            auth = AuthorityAssignment.objects.filter(
                club=club, tier="President"
            ).first()
            if not auth or not auth.user:
                clean_code = (
                    club.code.lower()
                    .replace("club-", "")
                    .replace("ndli-", "")
                    .replace("-", "")
                )
                pres_username = f"pres.{clean_code}"
                pres_email = f"pres.{club.code.lower()}@ndli.edu"
                u, _ = User.objects.get_or_create(
                    username=pres_username,
                    defaults={
                        "email": pres_email,
                        "category": Category.CLUB_ADMIN,
                        "sub_role": SubRole.CLUB_PRESIDENT,
                        "account_state": AccountState.ACTIVE,
                        "first_name": club.president_name or "Dr. Club President",
                        "is_active": True,
                    },
                )
                u.set_password(STANDARD_PASSWORD)
                u.save()
                AuthorityAssignment.objects.get_or_create(
                    user=u,
                    club=club,
                    tier="President",
                    defaults={
                        "from_date": club.date_of_approval or club.created_at.date(),
                        "status": AuthorityAssignment.Status.ACTIVE,
                    },
                )
                self.stdout.write(
                    f"Created missing President Authority: {club.code} -> "
                    f"{pres_username}"
                )

        # Run full Ledger Audit & Reconcile
        report = LedgerIntegrityEngine.audit_and_heal()
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("STEP 3: SSOT Ledger Audit & Auto-Healing Report:")
        self.stdout.write("=" * 80)
        self.stdout.write(f"Total Clubs Audited: {report.total_clubs_audited}")
        self.stdout.write(f"Healed Approvals: {report.healed_approvals_count}")
        self.stdout.write(
            f"Unresolved Deviations: {report.unresolved_deviations_count}"
        )
        status_str = "HEALTHY" if report.healthy else "DEVIATIONS"
        self.stdout.write(f"Ledger Status: {status_str}")
