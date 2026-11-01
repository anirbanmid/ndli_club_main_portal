"""Public telemetry aggregates (BRIEF_M3 §4b, M3-1, CAMPUS Sub-Club + SSOT Telemetry).

ONE computation (:func:`state_breakdown`) produces the State/UT breakdown.
The chart, the accessible ``<table>`` alternative and the cached API response
all render FROM that one computation — no parallel counting anywhere (P4).

* Total Clubs = Main Clubs (1) + Disciplinary Sub-Clubs (N).
* Total Members = Higher Ed Memberships (Active + Inactive) + School Rosters.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Max

from apps.domain.models import Club, Institution, Membership, State, SubClub

#: The single cache key for the telemetry aggregate.
CACHE_KEY = "m3:telemetry:v2"

#: Backstop TTL (seconds). Invalidation is version-keyed, not TTL-driven.
CACHE_TTL_SECONDS = 300

#: HTTP cache lifetime advertised on the endpoint (bounded; V7).
HTTP_MAX_AGE_SECONDS = 300

_MODELS_ANY_STATUS = (State,)


def state_breakdown() -> dict[str, Any]:
    """The single telemetry computation (P4).

    Counts are PUBLIC-facing: active institutions, active clubs (+ sub-clubs) and
    total members till date (active + inactive), broken down per State/UT.
    Every state appears — zeros included — so the accessible table is complete.
    """
    institution_rows = {
        row["state__code"]: row["n"]
        for row in Institution.objects.filter(status=Institution.Status.ACTIVE)
        .values("state__code")
        .annotate(n=Count("id"))
    }

    # Main clubs
    club_rows = {
        row["institution__state__code"]: row["n"]
        for row in Club.objects.filter(status=Club.Status.ACTIVE, is_sample=False)
        .values("institution__state__code")
        .annotate(n=Count("id"))
    }

    # Sub-clubs under active main clubs
    subclub_rows = {
        row["club__institution__state__code"]: row["n"]
        for row in SubClub.objects.filter(is_active=True, club__is_sample=False)
        .values("club__institution__state__code")
        .annotate(n=Count("id"))
    }

    # HEI Memberships (Total till date: active + alumni/inactive)
    hei_member_rows = {
        row["club__institution__state__code"]: row["n"]
        for row in Membership.objects.values("club__institution__state__code").annotate(
            n=Count("id")
        )
    }

    # School Student Rosters (offline members)
    try:
        from apps.members.models import SchoolStudentRoster

        school_member_rows = {
            row["club__institution__state__code"]: row["n"]
            for row in SchoolStudentRoster.objects.values(
                "club__institution__state__code"
            ).annotate(n=Count("id"))
        }
    except Exception:
        school_member_rows = {}

    states: list[dict[str, Any]] = []
    totals = {
        "states": 0,
        "institutions": 0,
        "clubs": 0,
        "main_clubs": 0,
        "sub_clubs": 0,
        "members": 0,
    }

    for state in State.objects.select_related("zone").order_by("code"):
        main_c = club_rows.get(state.code, 0)
        sub_c = subclub_rows.get(state.code, 0)
        combined_clubs = main_c + sub_c
        combined_members = hei_member_rows.get(state.code, 0) + school_member_rows.get(
            state.code, 0
        )

        row = {
            "code": state.code,
            "name": state.name,
            "kind": state.kind,
            "zone": state.zone.code,
            "institutions": institution_rows.get(state.code, 0),
            "clubs": combined_clubs,
            "main_clubs": main_c,
            "sub_clubs": sub_c,
            "members": combined_members,
        }
        states.append(row)
        totals["states"] += 1
        totals["institutions"] += row["institutions"]
        totals["clubs"] += row["clubs"]
        totals["main_clubs"] += main_c
        totals["sub_clubs"] += sub_c
        totals["members"] += row["members"]

    try:
        from apps.activities.models import ClubEvent

        total_activities = ClubEvent.objects.count()
    except Exception:
        total_activities = 0

    try:
        from apps.certificates.models import Certificate

        total_certificates = Certificate.objects.count()
    except Exception:
        total_certificates = 0

    totals["activities"] = total_activities
    totals["certificates"] = total_certificates

    return {"states": states, "totals": totals}


def data_version() -> str:
    """Cheap fingerprint of every table the aggregate reads."""
    parts: list[str] = []
    for model in (State, Institution, Club, SubClub, Membership):
        agg = model.objects.aggregate(n=Count("id"), mx=Max("updated_at"))
        parts.append(f"{model.__name__}:{agg['n']}:{agg['mx']}")
    return sha256("|".join(parts).encode()).hexdigest()[:16]


def get_telemetry() -> dict[str, Any]:
    """Cached aggregate: exact data, one computation, version-checked."""
    version = data_version()
    cached = cache.get(CACHE_KEY)
    if cached is not None and cached.get("version") == version:
        return cached["data"]
    data = state_breakdown()
    cache.set(CACHE_KEY, {"version": version, "data": data}, CACHE_TTL_SECONDS)
    return data


def invalidate() -> None:
    """Drop the cached aggregate."""
    cache.delete(CACHE_KEY)
