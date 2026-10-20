"""Public directory search (BRIEF_M3 §4b, M3-2, pin V5).

ONE query definition (:func:`directory_search`) owns search, filtering,
ranking and ordering. Typo tolerance comes from PostgreSQL ``pg_trgm``
(same-word trigram similarity over the institution name); exact-ish matches
on the stable code and AISHE code always win their ``icontains`` clause.

Ordering is ALWAYS total (``-match``, then the unique ``code``) so pagination
is stable page-to-page — no duplicate or skipped rows (V5).

Engine note (M3-A5): PostgreSQL 16 is the tested engine. The non-Postgres
branch below exists only so a dev shell on SQLite does not 500; it is
deliberately NOT part of the tested surface and not faked as equivalent.
"""
from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q, QuerySet
from django.db.models.functions import Greatest

from apps.domain.models import Institution


def _trigram_clause(q: str) -> Q:
    """Typo-tolerant match over name + exact-ish match over codes."""
    return (
        Q(name__trigram_similar=q)
        | Q(name__trigram_word_similar=q)
        | Q(code__icontains=q)
        | Q(aishe_code__icontains=q)
    )


def _fallback_clause(q: str) -> Q:
    """Dev-only fallback (non-PostgreSQL): substring match, no ranking."""
    return (
        Q(name__icontains=q)
        | Q(code__icontains=q)
        | Q(aishe_code__icontains=q)
    )


def directory_search(
    *,
    q: str = "",
    state: str = "",
    district: str = "",
    aishe: str = "",
) -> QuerySet[Any]:
    """Search the public institution directory.

    Filters combine as AND (scoped, V5) and always sit on the ACTIVE public
    directory. ``q`` is optional; with no filters this lists the directory in
    stable code order.
    """
    queryset = Institution.objects.select_related("state", "district").filter(
        status=Institution.Status.ACTIVE
    )
    if state:
        queryset = queryset.filter(state__code=state)
    if district:
        queryset = queryset.filter(district__code=district)
    if aishe:
        queryset = queryset.filter(aishe_code__iexact=aishe)

    if q:
        if connection.vendor == "postgresql":
            from django.contrib.postgres.search import (
                TrigramSimilarity,
                TrigramWordSimilarity,
            )

            queryset = queryset.annotate(
                match=Greatest(
                    TrigramSimilarity("name", q),
                    TrigramWordSimilarity(q, "name"),
                )
            ).filter(_trigram_clause(q))
            # Rank first, unique code as the tiebreaker => total order.
            return queryset.order_by("-match", "code")
        return queryset.filter(_fallback_clause(q)).order_by("code")
    return queryset.order_by("code")
