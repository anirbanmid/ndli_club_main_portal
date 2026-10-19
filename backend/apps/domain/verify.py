"""Integrity checks behind ``manage.py verify_domain`` (P5 machinery).

Read-only by construction: these checks REPORT broken relations and never
mutate anything (the future bounded auto-repair trigger point — BRIEF_M2.md
§3). Output distinguishes:

* **findings** — broken data (orphans, overlaps, scope drift);
* **notices**  — known-pending states (e.g. States/UTs awaiting an officer
  assignment, AISHE-less institutions which are usable by design).

``clean`` means zero findings; notices are expected and informational.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from django.utils import timezone

from .models import (
    AuthorityAssignment,
    Club,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)


@dataclass
class Report:
    """The full verify_domain report (findings + notices)."""

    orphan_memberships: list[str] = field(default_factory=list)
    orphan_scope_codes: list[str] = field(default_factory=list)
    orphan_passkeys: list[str] = field(default_factory=list)
    assignment_overlaps: list[str] = field(default_factory=list)
    scope_drift: list[str] = field(default_factory=list)
    awaiting_officer: list[str] = field(default_factory=list)
    aishe_less_institutions: list[str] = field(default_factory=list)

    @property
    def findings(self) -> list[str]:
        """Every finding line (broken data)."""
        return (
            self.orphan_memberships
            + self.orphan_scope_codes
            + self.orphan_passkeys
            + self.assignment_overlaps
            + self.scope_drift
        )

    @property
    def notices(self) -> list[str]:
        """Every notice line (known-pending, never blocking)."""
        return self.awaiting_officer + self.aishe_less_institutions

    @property
    def clean(self) -> bool:
        """True when no broken data was found (notices do not count)."""
        return not self.findings

    def counts(self) -> dict[str, int]:
        """Machine-friendly summary (used for the audit detail)."""
        return {
            "orphan_memberships": len(self.orphan_memberships),
            "orphan_scope_codes": len(self.orphan_scope_codes),
            "orphan_passkeys": len(self.orphan_passkeys),
            "assignment_overlaps": len(self.assignment_overlaps),
            "scope_drift": len(self.scope_drift),
            "awaiting_officer": len(self.awaiting_officer),
            "aishe_less_institutions": len(self.aishe_less_institutions),
        }


def _overlaps(rows: list[tuple[date, date | None, str]]) -> list[str]:
    """Pairwise interval overlap on (from, to|None-open, label) windows."""
    hits: list[str] = []
    windows = sorted(rows, key=lambda row: (row[0], row[2]))
    for index, (_start_a, end_a, label_a) in enumerate(windows):
        for start_b, _end_b, label_b in windows[index + 1 :]:
            if start_b > (end_a if end_a is not None else date.max):
                break
            hits.append(f"{label_a} overlaps {label_b}")
    return hits


def run_checks(today: date | None = None) -> Report:
    """Run every integrity check; pure reads, safe at any time (P5)."""
    today = today or timezone.localdate()
    report = Report()

    # 1. Orphan memberships: an account without an identity profile cannot be
    #    scoped or categorised (the FK keeps the row, the identity is gone).
    for membership_row in Membership.objects.filter(
        user__profile__isnull=True
    ).select_related("club"):
        report.orphan_memberships.append(
            f"membership#{membership_row.pk} user#{membership_row.user_id} "
            f"has no profile (club {membership_row.club_id})"
        )

    # 2. Orphan scope codes: the Profile soft-FK columns (M1-era plain codes)
    #    that no domain row answers for. This is the heal list for the
    #    future auto-repair (re-point or create the missing rows).
    from apps.accounts.models import Profile

    for attr, model, label in (
        ("zone_id", Zone, "zone"),
        ("state_id", State, "state"),
        ("institution_id", Institution, "institution"),
        ("club_id", Club, "club"),
    ):
        used = (
            Profile.objects.exclude(**{attr: ""})
            .exclude(**{attr: None})
            .values_list(attr, flat=True)
            .distinct()
        )
        known = set(model.objects.values_list("code", flat=True))
        for code in sorted(set(used) - known):
            report.orphan_scope_codes.append(
                f"profile {label} code {code!r} has no domain row"
            )

    # 3. Orphan passkeys: Official Institutional Passkeys keyed by a club
    #    code that no Club row answers for.
    from apps.accounts.models import ClubPasskey

    known_clubs = set(Club.objects.values_list("code", flat=True))
    for code in ClubPasskey.objects.values_list("club_code", flat=True):
        if code not in known_clubs:
            report.orphan_passkeys.append(f"passkey club code {code!r} has no club")

    # 4. Assignment overlaps (officer: per state; authority: per club+tier
    #    and per user+club).
    per_state: dict[int, list[tuple[date, date | None, str]]] = {}
    for officer_row in OfficerAssignment.objects.select_related("state", "officer"):
        per_state.setdefault(officer_row.state_id, []).append(
            (
                officer_row.from_date,
                officer_row.to_date,
                f"officer {officer_row.officer.get_username()}",
            )
        )
    for state_id, windows in per_state.items():
        for hit in _overlaps(windows):
            report.assignment_overlaps.append(f"state#{state_id}: {hit}")

    per_club_tier: dict[tuple[int, str], list[tuple[date, date | None, str]]] = {}
    per_user_club: dict[tuple[int, int], list[tuple[date, date | None, str]]] = {}
    for authority_row in AuthorityAssignment.objects.select_related("user"):
        label = f"{authority_row.user.get_username()} ({authority_row.tier})"
        windows_club = (authority_row.from_date, authority_row.to_date, label)
        windows_user = (authority_row.from_date, authority_row.to_date, label)
        per_club_tier.setdefault(
            (authority_row.club_id, authority_row.tier), []
        ).append(windows_club)
        per_user_club.setdefault(
            (authority_row.user_id, authority_row.club_id), []
        ).append(windows_user)
    for (club_id, tier), windows in per_club_tier.items():
        for hit in _overlaps(windows):
            report.assignment_overlaps.append(f"club#{club_id} tier {tier}: {hit}")
    for (user_id, club_id), windows in per_user_club.items():
        for hit in _overlaps(windows):
            report.assignment_overlaps.append(f"user#{user_id}@club#{club_id}: {hit}")

    # 5. Scope drift: a profile whose soft zone key disagrees with the zone
    #    derived from its club (the P4 drift class, reported — never guessed).
    for profile in Profile.objects.exclude(club_id="").exclude(
        club_id__isnull=True
    ):
        club = Club.objects.select_related("institution__state__zone").filter(
            code=profile.club_id
        ).first()
        if club is None:
            continue  # already reported as an orphan scope code
        derived = club.institution.state.zone.code
        if profile.zone_id and profile.zone_id != derived:
            report.scope_drift.append(
                f"profile#{profile.pk} zone {profile.zone_id!r} != club "
                f"{club.code!r} derived zone {derived!r}"
            )

    # 6. Notices: States/UTs awaiting an officer assignment (never blocking,
    #    BRIEF_M2.md §6) and AISHE-less institutions (usable by design).
    assigned_states = {
        row.state_id
        for row in OfficerAssignment.objects.filter(from_date__lte=today)
        .filter(to_date__isnull=True)
        .only("state_id")
    }
    assigned_states |= set(
        OfficerAssignment.objects.filter(
            from_date__lte=today, to_date__gte=today
        ).values_list("state_id", flat=True)
    )
    for state in State.objects.exclude(id__in=assigned_states).order_by("code"):
        report.awaiting_officer.append(f"{state.code} ({state.name})")
    for institution in Institution.objects.filter(aishe_code__isnull=True).order_by(
        "code"
    ):
        report.aishe_less_institutions.append(
            f"{institution.code} ({institution.name})"
        )

    return report


def render(report: Report) -> list[str]:
    """Human-readable report lines (stable prefixes for scripting)."""
    lines = [
        "verify_domain: read-only integrity check (P5 trigger point)",
        f"FINDINGS: {len(report.findings)}",
        f"NOTICES: {len(report.notices)}",
    ]
    for label, items in (
        ("orphan-memberships", report.orphan_memberships),
        ("orphan-scope-codes", report.orphan_scope_codes),
        ("orphan-passkeys", report.orphan_passkeys),
        ("assignment-overlaps", report.assignment_overlaps),
        ("scope-drift", report.scope_drift),
    ):
        lines.append(f"{'OK' if not items else 'FINDING'} {label}: {len(items)}")
        lines.extend(f"  - {item}" for item in items)
    for label, items in (
        ("awaiting-officer-assignment", report.awaiting_officer),
        ("aishe-less-institutions", report.aishe_less_institutions),
    ):
        lines.append(f"NOTICE {label}: {len(items)}")
        lines.extend(f"  - {item}" for item in items)
    lines.append("RESULT: CLEAN" if report.clean else "RESULT: FINDINGS PRESENT")
    return lines
