"""Queryset scoping helpers (PLAN_ACCESS_ARCHITECTURE.md §5, BRIEF §4.3).

The scope rules are mechanical, not remembered:

* ``scope_clubs``    — club-authority facing data (own club only; admins see
  more, ops-only Super Admin sees nothing).
* ``scope_members``  — student/member data (students see only themselves,
  club authorities their own club, officers their zone).
* ``scope_governance`` — staff/officer data (Central Admin sees all, a
  Regional Officer only their own zone; nobody else).

Since M2 the scoped rows are real domain rows: each model declares where its
scope keys live in the ORM via ``SCOPE_LOOKUPS`` (a join path on domain
models, the raw code column on ``accounts.User``), so the SAME helpers
filter user rows and domain querysets with one mechanical rule set. The
404 semantics of ``accounts.policies.ObjectScope`` are unchanged; EMP03
never reaches EMP05 data even across the institution/club joins
(tests/test_m2_d3_scope_fk.py).
"""
from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.accounts.models import (
    Category,
    SubRole,
    User,
)


def _profile(user: Any) -> Any:
    """The identity record of ``user`` (M2U: the user IS the record).

    Returns ``None`` for anything that is not an ``accounts.User``
    (``AnonymousUser`` and friends) — deny by default, exactly like the
    M1-era "authenticated but profile-less" case.
    """
    return user if isinstance(user, User) else None


def _lookups(queryset: QuerySet) -> dict[str, str]:
    """Scope lookup paths for the queryset's model (fail-closed registry)."""
    lookups = getattr(queryset.model, "SCOPE_LOOKUPS", None)
    if not isinstance(lookups, dict):
        return {}
    return lookups


def _filter(queryset: QuerySet, **keys: Any) -> QuerySet:
    """Filter ``queryset`` on the caller's scope keys via ``SCOPE_LOOKUPS``.

    A model that does not declare a needed scope key (or is not scoped at
    all) resolves to EMPTY — deny by default, exactly like the policy layer.
    """
    lookups = _lookups(queryset)
    conditions: dict[str, Any] = {}
    for key, value in keys.items():
        path = lookups.get(key)
        if path is None:
            return queryset.none()
        conditions[path] = value
    return queryset.filter(**conditions)


def scope_clubs(queryset: QuerySet, user: Any) -> QuerySet:
    """Scope club-facing rows to the caller's club (admins: zone / all)."""
    profile = _profile(user)
    if profile is None:
        return queryset.none()
    if profile.category == Category.IIT_KGP_ADMIN:
        if profile.sub_role == SubRole.SUPER_ADMIN_OPS:
            return queryset.none()
        if profile.sub_role == SubRole.REGIONAL_OFFICER:
            return _filter(queryset, zone=profile.zone_code)
        return queryset.all()
    return _filter(
        queryset,
        institution=profile.institution_code,
        club=profile.club_code,
    )


def scope_members(queryset: QuerySet, user: Any) -> QuerySet:
    """Scope member/student rows: own record (student), own club, zone, all."""
    profile = _profile(user)
    if profile is None:
        return queryset.none()
    if profile.category == Category.STUDENT_MEMBER:
        return _filter(queryset, user=user.pk)
    if profile.category == Category.CLUB_ADMIN:
        return _filter(
            queryset,
            institution=profile.institution_code,
            club=profile.club_code,
        )
    if profile.category == Category.IIT_KGP_ADMIN:
        if profile.sub_role == SubRole.SUPER_ADMIN_OPS:
            return queryset.none()
        if profile.sub_role == SubRole.REGIONAL_OFFICER:
            return _filter(queryset, zone=profile.zone_code)
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
        return _filter(queryset, zone=profile.zone_code)
    return queryset.all()
