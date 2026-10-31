"""Bounded, N+1-free read layer for the directory and roster surfaces.

These helpers are the query layer the M3+ list endpoints will call (M2 ships
no HTTP endpoints — the UI-defer rule). Every function is pinned by
``tests/test_m2_d5_capacity.py``: a fixed query count per page REGARDLESS of
row count, full relation chains pre-fetched with ``select_related``, and page
sizes bounded (no unbounded query at 110K, BRIEF_M2.md §3 / P2).
"""

from __future__ import annotations

from django.db.models import Count, Q, QuerySet

from .models import Institution, Membership, OfficerAssignment

#: Hard cap on page size — an unbounded page is a capacity bug, not a feature.
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


def bounded_page_size(size: int | None) -> int:
    """Clamp a requested page size into ``[1, MAX_PAGE_SIZE]``."""
    requested = size if size is not None else DEFAULT_PAGE_SIZE
    return max(1, min(int(requested), MAX_PAGE_SIZE))


def _page(queryset: QuerySet, page: int, page_size: int) -> tuple[QuerySet, int]:
    """Slice one bounded page; returns (page rows, total row count)."""
    size = bounded_page_size(page_size)
    number = max(1, int(page))
    offset = (number - 1) * size
    total = queryset.count()
    return queryset[offset : offset + size], total


def institution_directory(
    *,
    state_code: str = "",
    district_code: str = "",
    name_query: str = "",
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> tuple[list[Institution], int]:
    """One directory page: state/district/name filters, 2 queries, any size.

    Query pattern (P2 index plan): ``state + district + name`` via
    ``institution_directory_idx``; the zone is read through
    ``institution.state.zone`` with zero extra queries.
    """
    queryset: QuerySet = Institution.objects.select_related(
        "state", "district", "state__zone"
    )
    if state_code:
        queryset = queryset.filter(state__code=state_code)
    if district_code:
        queryset = queryset.filter(district__code=district_code)
    if name_query:
        queryset = queryset.filter(name__icontains=name_query)
    rows, total = _page(queryset.order_by("name"), page, page_size)
    return list(rows), total


def club_roster(club_code: str) -> list[Membership]:
    """Full member roster of one club — exactly 1 query at any roster size."""
    return list(
        Membership.objects.select_related(
            "user",
            "club",
            "club__institution",
            "club__institution__state",
            "club__institution__state__zone",
        )
        .filter(club__code=club_code, status=Membership.Status.ACTIVE)
        .order_by("joined_on", "pk")
    )


def roster_aggregates(club_code: str) -> dict[str, int]:
    """Public-safe membership COUNTS of one club (M4-A2 / P0: never rows).

    ONE aggregate query (P1/P2) — the single source for every roster figure
    shown anywhere (public showcase + club dashboard reuse THIS, P4).
    Computes both HEI memberships and School student rosters (Active + Inactive).
    """
    rows = Membership.objects.filter(club__code=club_code).aggregate(
        members_total=Count("id"),
        members_active=Count("id", filter=Q(status=Membership.Status.ACTIVE)),
        alumni=Count("id", filter=Q(status=Membership.Status.ALUMNI)),
        members_suspended=Count("id", filter=Q(status=Membership.Status.SUSPENDED)),
    )

    try:
        from apps.members.models import SchoolStudentRoster

        school_rows = SchoolStudentRoster.objects.filter(
            club__code=club_code
        ).aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )
        school_total = int(school_rows.get("total") or 0)
        school_active = int(school_rows.get("active") or 0)
        school_inactive = int(school_rows.get("inactive") or 0)
    except Exception:
        school_total = school_active = school_inactive = 0

    hei_total = int(rows.get("members_total") or 0)
    hei_active = int(rows.get("members_active") or 0)
    hei_alumni = int(rows.get("alumni") or 0)
    hei_suspended = int(rows.get("members_suspended") or 0)
    hei_inactive = hei_alumni + hei_suspended

    total = hei_total + school_total
    active = hei_active + school_active
    inactive = hei_inactive + school_inactive

    return {
        "members_total": total,
        "members_active": active,
        "members_inactive": inactive,
        "alumni": hei_alumni,
        "members_suspended": hei_suspended,
    }


def memberships_of_user(user_id: int) -> list[Membership]:
    """Every membership row of one account — exactly 1 query."""
    return list(
        Membership.objects.select_related(
            "club",
            "club__institution",
            "club__institution__state",
            "club__institution__state__zone",
        )
        .filter(user_id=user_id)
        .order_by("joined_on", "pk")
    )


def officer_roster(*, state_code: str = "") -> list[OfficerAssignment]:
    """Officer assignment rows (optionally one state) — exactly 1 query."""
    queryset: QuerySet = OfficerAssignment.objects.select_related(
        "officer", "state", "state__zone"
    )
    if state_code:
        queryset = queryset.filter(state__code=state_code)
    return list(queryset.order_by("state__code", "-from_date", "pk"))
