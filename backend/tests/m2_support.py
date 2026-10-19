"""Shared builders for the M2 gate pins (D1-D5 + security).

New in M2 (the M1 builders in ``support.py`` stay untouched). Everything is
offline and deterministic; the domain fixtures use the real sample codes
from ``data/samples/`` so the pins read like the seed they mirror.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from django.contrib.auth import get_user_model

from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)

#: The small zone graph used by the D3/D4/D5 pins.
ZONE_GRAPH = (
    ("NORTH", "North", "DELHI", "Delhi", "INST-DU-001", "CLB-DU-CULT"),
    ("WEST", "West", "MAHARASHTRA", "Maharashtra", "INST-MH-001", "CLB-MH-TECH"),
    ("NORTH_EAST", "North East", "ASSAM", "Assam", "INST-AS-001", "CLB-AS-CULT"),
)


def build_zone_graph() -> dict[str, dict[str, Any]]:
    """Create 3 zones/states/institutions/clubs; returns lookup maps."""
    made: dict[str, dict[str, Any]] = {}
    for (
        zone_code,
        zone_name,
        state_code,
        state_name,
        inst_code,
        club_code,
    ) in ZONE_GRAPH:
        zone = Zone.objects.create(code=zone_code, name=zone_name)
        state = State.objects.create(code=state_code, name=state_name, zone=zone)
        district = District.objects.create(
            state=state, code=f"{state_code}-SAMPLE", name=f"{state_name} sample"
        )
        institution = Institution.objects.create(
            code=inst_code,
            legacy_id=f"LEG-{inst_code}",
            name=f"{state_name} sample institution",
            state=state,
            district=district,
        )
        club = Club.objects.create(
            code=club_code,
            institution=institution,
            name=f"{state_name} sample club",
        )
        made[zone_code] = {
            "zone": zone,
            "state": state,
            "institution": institution,
            "club": club,
        }
    return made


def assign_officer(
    username: str,
    state: State,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
) -> tuple[Any, OfficerAssignment]:
    """Create an officer user (Regional Officer) + one assignment row."""
    user_model = get_user_model()
    user = user_model.objects.create_user(
        username=username, email=f"{username.lower()}@example.test"
    )
    assignment = OfficerAssignment.objects.create(
        state=state,
        officer=user,
        from_date=from_date or (date.today() - timedelta(days=30)),
        to_date=to_date,
    )
    return user, assignment


def assign_authority(
    user: Any,
    club: Club,
    tier: str,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
) -> AuthorityAssignment:
    """Create one authority assignment row for a user at a club."""
    return AuthorityAssignment.objects.create(
        user=user,
        club=club,
        tier=tier,
        from_date=from_date or (date.today() - timedelta(days=30)),
        to_date=to_date,
    )


def add_membership(user: Any, club: Club, *, role: str = "member") -> Membership:
    """Create one membership row (the only way to join a club)."""
    return Membership.objects.create(user=user, club=club, role=role)
