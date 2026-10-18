"""Queryset scoping helpers (PLAN_ACCESS_ARCHITECTURE.md §5, BRIEF §4.3).

The scope rules are mechanical, not remembered:

* ``scope_clubs``    — club-authority facing data (own club only; admins see
  more, ops-only Super Admin sees nothing).
* ``scope_members``  — student/member data (students see only themselves,
  club authorities their own club, officers their zone).
* ``scope_governance`` — staff/officer data (Central Admin sees all, a
  Regional Officer only their own zone; nobody else).

In M1 the scoped rows are ``accounts.Profile`` rows (the scoping keys live
on the profile — A1); from M2 on the same helpers filter the real domain
querysets carrying ``institution_code`` / ``club_code`` / ``zone_code``.

Out-of-scope IDs must resolve to 404, never data (see
``accounts.policies.ObjectScope``).
"""
from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.accounts.models import (
    Category,
    SubRole,
)


def _profile(user: Any) -> Any:
    return getattr(user, "profile", None)


def scope_clubs(queryset: QuerySet, user: Any) -> QuerySet:
    """Scope club-facing rows to the caller's club (admins: zone / all)."""
    profile = _profile(user)
    if profile is None:
        return queryset.none()
    if profile.category == Category.IIT_KGP_ADMIN:
        if profile.sub_role == SubRole.SUPER_ADMIN_OPS:
            return queryset.none()
        if profile.sub_role == SubRole.REGIONAL_OFFICER:
            return queryset.filter(zone_code=profile.zone_code)
        return queryset.all()
    return queryset.filter(
        institution_code=profile.institution_code,
        club_code=profile.club_code,
    )


def scope_members(queryset: QuerySet, user: Any) -> QuerySet:
    """Scope member/student rows: own record (student), own club, zone, all."""
    profile = _profile(user)
    if profile is None:
        return queryset.none()
    if profile.category == Category.STUDENT_MEMBER:
        return queryset.filter(user_id=user.pk)
    if profile.category == Category.CLUB_ADMIN:
        return queryset.filter(
            institution_code=profile.institution_code,
            club_code=profile.club_code,
        )
    if profile.category == Category.IIT_KGP_ADMIN:
        if profile.sub_role == SubRole.SUPER_ADMIN_OPS:
            return queryset.none()
        if profile.sub_role == SubRole.REGIONAL_OFFICER:
            return queryset.filter(zone_code=profile.zone_code)
        return queryset.all()
    return queryset.none()


def scope_governance(queryset: QuerySet, user: Any) -> QuerySet:
    """Scope staff/officer rows: Central Admin all, officers their zone."""
    profile = _profile(user)
    if profile is None:
        return queryset.none()
    if profile.category != Category.IIT_KGP_ADMIN:
        return queryset.none()
    if profile.sub_role == SubRole.SUPER_ADMIN_OPS:
        return queryset.none()
    if profile.sub_role == SubRole.REGIONAL_OFFICER:
        return queryset.filter(zone_code=profile.zone_code)
    return queryset.all()
