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
        doa = MASTER_CLUB_DATES.get(clean_code, ("", "", ""))[0]
        return doa, last_r, upcoming_r

    if clean_code in MASTER_CLUB_DATES:
        return MASTER_CLUB_DATES[clean_code]
    c_date = created_at.date() if created_at else None
    doa = c_date.strftime("%Y-%m-%d") if c_date else ""
    last_ren = ""
    try:
        next_year = c_date.replace(year=c_date.year + 1) if c_date else None
        upcoming_ren = next_year.strftime("%Y-%m-%d") if next_year else ""
    except ValueError:
        upcoming_ren = f"{c_date.year + 1}-02-28" if c_date else ""
    if last_ren and doa and last_ren < doa:
        last_ren = ""
    return doa, last_ren or "None (Initial)", upcoming_ren


CANONICAL_INSTITUTIONAL_CLUBS: list[dict[str, Any]] = []

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
        doa = str(c.date_of_approval) if c.date_of_approval else ""
        last_ren = str(c.last_renewal_date) if c.last_renewal_date else "None (Initial)"
        upcoming_ren = (
            str(c.upcoming_renewal_date) if c.upcoming_renewal_date else ""
        )

        from datetime import date

        from django.utils import timezone

        today = timezone.localdate()
        computed_status = "Active"
        if upcoming_ren:
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

        patron_n = c.patron_name or ""
        patron_e = c.patron_email or ""
        patron_p = c.patron_phone or ""
        pres_n = c.president_name or ""
        pres_e = c.president_email or ""
        pres_p = c.president_phone or ""
        sec_n = c.secretary_name or ""
        sec_e = c.secretary_email or ""
        sec_p = c.secretary_phone or ""

        hei_count = (
            c.student_profiles.filter(user__account_state="active").count()
            if hasattr(c, "student_profiles")
            else 0
        )
        school_count = (
            c.school_roster.filter(is_active=True).count()
            if hasattr(c, "school_roster")
            else 0
        )
        other_count = (
            c.memberships.exclude(user__category="student_member").count()
            if hasattr(c, "memberships")
            else 0
        )
        actual_members = hei_count + school_count + other_count
        hosted_events = c.hosted_events.count() if hasattr(c, "hosted_events") else 0
        partner_events = (
            c.event_partnerships.filter(status="accepted").count()
            if hasattr(c, "event_partnerships")
            else 0
        )
        from apps.activities.models import APPROVAL_LOG_TYPES, ActivityLog
        activity_logs_count = (
            ActivityLog.objects.filter(club_code=c.code)
            .exclude(support_type__in=APPROVAL_LOG_TYPES)
            .count()
        )

        solo_events = (
            c.hosted_events.filter(scope="institutional").count()
            if hasattr(c, "hosted_events")
            else 0
        )
        joint_events = (
            c.hosted_events.filter(scope="multi_club").count()
            if hasattr(c, "hosted_events")
            else 0
        ) + partner_events

        actual_events = hosted_events + partner_events + activity_logs_count

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
            "memberCount": actual_members,
            "member_count": actual_members,
            "eventsConducted": actual_events,
            "events_conducted": actual_events,
            "soloSessions": solo_events,
            "jointSessions": joint_events,
            "solo_activities": solo_events,
            "joint_activities": joint_events,
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
                *(
                    [
                        {
                            "role": "Patron",
                            "name": patron_n,
                            "designation": "Director",
                            "email": patron_e,
                            "phone": patron_p,
                            "verified": True,
                        }
                    ]
                    if patron_n
                    else []
                ),
                *(
                    [
                        {
                            "role": "President",
                            "name": pres_n,
                            "designation": "Librarian & Nodal Officer",
                            "email": pres_e,
                            "phone": pres_p,
                            "verified": True,
                        }
                    ]
                    if pres_n
                    else []
                ),
                *(
                    [
                        {
                            "role": "Secretary",
                            "name": sec_n,
                            "designation": "Faculty Advisor",
                            "email": sec_e,
                            "phone": sec_p,
                            "verified": True,
                        }
                    ]
                    if sec_n
                    else []
                ),
            ],
            "patron_name": patron_n,
            "patron_email": patron_e,
            "patron_phone": patron_p,
            "president_name": pres_n,
            "president_email": pres_e,
            "president_phone": pres_p,
            "secretary_name": sec_n,
            "secretary_email": sec_e,
            "secretary_phone": sec_p,
        }
        unified.append(club_dict)

    return unified
