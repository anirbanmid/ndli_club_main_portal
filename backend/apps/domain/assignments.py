"""Single-source resolution of officers and zones (P4).

Every derived value M2 exposes resolves HERE and nowhere else:

* ``officer_username_for_state`` — reads ONLY ``OfficerAssignment``
  (BRIEF_M2.md §2b: the routing stub becomes assignment-backed). States with
  no open assignment resolve to ``None`` ("awaiting officer assignment"),
  never to a guessed zone mate (that guess is a drift bug by construction).
* ``zone_code_of_profile`` / ``state_code_of_profile`` — the domain relation
  (club -> institution -> state -> zone) wins; the profile's own scope key is
  the documented fallback for M1-era rows until they are re-pointed (the
  drift is reported by ``manage.py verify_domain``).

The officer lookup is the one cached derived value in M2 (110K-capacity
hygiene, BRIEF_M2.md §3): cache keys are namespaced by a version token that
``domain.signals`` bumps on every ``OfficerAssignment`` / ``State`` write, so
invalidation is explicit (never implicit staleness) and the TTL bounds any
worst-case staleness at ``CACHE_TTL_SECONDS``.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from .models import Club, OfficerAssignment

#: Bounded staleness window for the officer cache (P5: bounded + explicit).
CACHE_TTL_SECONDS = 300

_VERSION_KEY = "domain:assignments:version"
_KEY_PREFIX = "domain:officer:"


def _version() -> str:
    """Current cache namespace token (created on first use)."""
    version = cache.get(_VERSION_KEY)
    if not isinstance(version, str):
        version = uuid4().hex
        cache.set(_VERSION_KEY, version, None)
    return version


def invalidate_officer_cache() -> None:
    """Explicitly invalidate every cached officer resolution (P4).

    Wired to ``OfficerAssignment``/``State`` saves and deletes in
    ``domain.signals``.
    """
    cache.set(_VERSION_KEY, uuid4().hex, None)


def officer_assignment_for_state(state_code: str) -> OfficerAssignment | None:
    """The open assignment row for ``state_code`` (deterministic pick).

    Overlapping windows are a data-integrity finding (``verify_domain``);
    the pick here is deterministic so routing never flips silently: the most
    recent ``from_date`` wins, ties broken by the lowest row id.
    """
    today = timezone.localdate()
    return (
        OfficerAssignment.objects.select_related("officer", "state")
        .filter(state__code=state_code, from_date__lte=today)
        .filter(Q(to_date__isnull=True) | Q(to_date__gte=today))
        .order_by("-from_date", "pk")
        .first()
    )


def officer_username_for_state(state_code: str) -> str | None:
    """Username of the officer responsible for ``state_code``, or ``None``.

    Backed by ``OfficerAssignment`` ONLY (P4 single source). Cached with
    explicit invalidation; one query on a cold cache, zero on a warm one.
    """
    if not state_code:
        return None
    key = f"{_KEY_PREFIX}{_version()}:{state_code}"
    cached = cache.get(key)
    if isinstance(cached, str):
        return cached or None
    row = officer_assignment_for_state(state_code)
    username = row.officer.get_username() if row is not None else ""
    cache.set(key, username, CACHE_TTL_SECONDS)
    return username or None


def _club_of_profile(profile: Any) -> Club | None:
    club_id = getattr(profile, "club_id", "") or ""
    if not club_id:
        return None
    return (
        Club.objects.select_related("institution__state__zone")
        .filter(code=club_id)
        .first()
    )


def zone_code_of_profile(profile: Any) -> str | None:
    """Zone code owning ``profile`` — domain relation first, soft key after.

    1. ``profile.club`` -> ``institution.state.zone`` (the real graph);
    2. the profile's own ``zone`` scope key (M1-era rows, no domain backing);
    3. ``None`` (unscoped).
    """
    club = _club_of_profile(profile)
    if club is not None:
        return club.institution.state.zone.code
    code = getattr(profile, "zone_id", "") or ""
    return code or None


def state_code_of_profile(profile: Any) -> str | None:
    """State code owning ``profile`` — domain relation first, soft key after."""
    club = _club_of_profile(profile)
    if club is not None:
        return club.institution.state.code
    code = getattr(profile, "state_id", "") or ""
    return code or None
