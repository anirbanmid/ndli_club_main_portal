"""Public telemetry aggregates (BRIEF_M3 §4b, M3-1).

ONE computation (:func:`state_breakdown`) produces the State/UT breakdown.
The chart, the accessible ``<table>`` alternative and the cached API response
all render FROM that one computation — no parallel counting anywhere (P4).

Serving shape (P1/P2): the aggregate is cached behind a data-version key.
The version fingerprint changes whenever any contributing table changes, so
a content change invalidates the cache immediately (V7) and the TTL is only
a backstop — never stale-forever.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Max

from apps.domain.models import Club, Institution, Membership, State

#: The single cache key for the telemetry aggregate.
CACHE_KEY = "m3:telemetry:v1"

#: Backstop TTL (seconds). Invalidation is version-keyed, not TTL-driven.
CACHE_TTL_SECONDS = 300

#: HTTP cache lifetime advertised on the endpoint (bounded; V7).
HTTP_MAX_AGE_SECONDS = 300

_MODELS_ANY_STATUS = (State,)


def state_breakdown() -> dict[str, Any]:
    """The single telemetry computation (P4).

    Counts are PUBLIC-facing: active institutions, active clubs and active
    memberships, broken down per State/UT. Every state appears — zeros
    included — so the accessible table is complete, not a summary.
    """
    institution_rows = {
        row["state__code"]: row["n"]
        for row in Institution.objects.filter(status=Institution.Status.ACTIVE)
        .values("state__code")
        .annotate(n=Count("id"))
    }
    club_rows = {
        row["institution__state__code"]: row["n"]
        for row in Club.objects.filter(status=Club.Status.ACTIVE, is_sample=False)
        .values("institution__state__code")
        .annotate(n=Count("id"))
    }
    member_rows = {
        row["club__institution__state__code"]: row["n"]
        for row in Membership.objects.filter(status=Membership.Status.ACTIVE)
        .values("club__institution__state__code")
        .annotate(n=Count("id"))
    }

    states: list[dict[str, Any]] = []
    totals = {"states": 0, "institutions": 0, "clubs": 0, "members": 0}
    for state in State.objects.select_related("zone").order_by("code"):
        row = {
            "code": state.code,
            "name": state.name,
            "kind": state.kind,
            "zone": state.zone.code,
            "institutions": institution_rows.get(state.code, 0),
            "clubs": club_rows.get(state.code, 0),
            "members": member_rows.get(state.code, 0),
        }
        states.append(row)
        totals["states"] += 1
        totals["institutions"] += row["institutions"]
        totals["clubs"] += row["clubs"]
        totals["members"] += row["members"]

    return {"states": states, "totals": totals}


def data_version() -> str:
    """Cheap fingerprint of every table the aggregate reads.

    Count + max(updated_at) per contributing table: any insert or update
    changes the fingerprint, which changes the cache key (immediate
    invalidation) while old entries age out via TTL (P5: bounded, never
    destructive).
    """
    parts: list[str] = []
    for model in (State, Institution, Club, Membership):
        agg = model.objects.aggregate(n=Count("id"), mx=Max("updated_at"))
        parts.append(f"{model.__name__}:{agg['n']}:{agg['mx']}")
    return sha256("|".join(parts).encode()).hexdigest()[:16]


def get_telemetry() -> dict[str, Any]:
    """Cached aggregate: exact data, one computation, version-checked.

    The stored entry carries the data fingerprint; a mismatch means the data
    changed and the aggregate is recomputed at once (no stale reads).
    """
    version = data_version()
    cached = cache.get(CACHE_KEY)
    if cached is not None and cached.get("version") == version:
        return cached["data"]
    data = state_breakdown()
    cache.set(CACHE_KEY, {"version": version, "data": data}, CACHE_TTL_SECONDS)
    return data


def invalidate() -> None:
    """Drop the cached aggregate (writers may call it; version makes it safe)."""
    cache.delete(CACHE_KEY)
