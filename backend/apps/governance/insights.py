"""M6 D5 MCC insights — READ-ONLY strategic report (P4 single derivation).

Semantics ported from the previous project's ``ai/decision_module.py``
(``AIDecisionEngine.generate_strategic_report``): state/zone penetration,
support mix, renewal health, strategic recommendations + a 30/90/365-day
roadmap ("growth corridors"). Everything is derived from live tables at query
time — no stored counters, no fabricated data. The training-mix rule from the
old project stays dormant until the activities app carries real rows.

Audience (old-project RBAC parity): CentralAdmin / SuperAdminOps only — the
MCC is master control; EMPs get the operational desks, not the strategic
report.
"""

from __future__ import annotations

from collections import Counter
from datetime import timedelta
from typing import Any

from django.utils import timezone

from apps.audit.models import AuditLog
from apps.domain.models import Club, State, Zone

from . import renewals

#: Horizon buckets for the roadmap (days).
HORIZONS = (30, 90, 365)


def _penetration() -> dict[str, Any]:
    all_states = list(State.objects.order_by("code").values_list("code", "name"))
    all_zones = list(Zone.objects.order_by("code").values_list("code", "name"))
    state_counts: Counter[str] = Counter(
        Club.objects.values_list("institution__state__code", flat=True)
    )
    zone_counts: Counter[str] = Counter(
        Club.objects.values_list("institution__state__zone__code", flat=True)
    )
    clubs_by_state = {code: state_counts.get(code, 0) for code, _ in all_states}
    clubs_by_zone = {code: zone_counts.get(code, 0) for code, _ in all_zones}
    unrepresented = [code for code, n in clubs_by_state.items() if n == 0]
    top_states = sorted(clubs_by_state.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "total_states": len(all_states),
        "total_zones": len(all_zones),
        "clubs_by_state": clubs_by_state,
        "clubs_by_zone": clubs_by_zone,
        "unrepresented_states": unrepresented,
        "top_states": [{"state": s, "clubs": n} for s, n in top_states],
    }


def _renewal_health() -> dict[str, Any]:
    """Renewal horizons over ALL clubs (30/90/365 + overdue), query-time."""
    buckets = {"overdue": 0, "within_30d": 0, "within_90d": 0, "within_365d": 0}
    for club in Club.objects.select_related("institution__state").prefetch_related(
        "renewal_records"
    ):
        days_left = renewals.state_payload(
            club, records=list(club.renewal_records.all())
        )["days_left"]
        if days_left < 0:
            buckets["overdue"] += 1
        elif days_left <= HORIZONS[0]:
            buckets["within_30d"] += 1
        elif days_left <= HORIZONS[1]:
            buckets["within_90d"] += 1
        elif days_left <= HORIZONS[2]:
            buckets["within_365d"] += 1
    buckets["attention_count"] = buckets["overdue"] + buckets["within_30d"]
    return buckets


def _activity_mix() -> dict[str, Any]:
    """Support-mix proxy: audit activity by category over the last 90 days.

    The previous project counted online/offline training sessions from its
    activities master. The activities app carries no rows yet, so the mix
    stays empty (never fabricated) and the training rule below stays dormant.
    """
    recent = AuditLog.objects.filter(timestamp__gte=timezone.now() - timedelta(days=90))
    return {
        "audit_activity_by_category": dict(
            Counter(recent.values_list("category", flat=True))
        ),
        "training_mix_available": False,
    }


def _recommendations(
    penetration: dict[str, Any], health: dict[str, Any]
) -> list[dict[str, str]]:
    recs: list[dict[str, str]] = []

    unrep = penetration["unrepresented_states"]
    if unrep:
        sample = ", ".join(unrep[:4])
        recs.append(
            {
                "category": "Regional Outreach",
                "priority": "High",
                "title": "Establish Foothold in Unrepresented States",
                "insight": f"{len(unrep)} out of {penetration['total_states']} "
                f"States/UTs currently have zero registered NDLI clubs "
                f"(e.g., {sample}).",
                "action": "Task corresponding regional employees to initiate outreach "
                "to State Directorate of Higher Education in these states.",
            }
        )

    by_zone = penetration["clubs_by_zone"]
    if by_zone:
        lowest = min(by_zone.items(), key=lambda kv: kv[1])
        highest = max(by_zone.items(), key=lambda kv: kv[1])
        if lowest[1] < highest[1]:
            recs.append(
                {
                    "category": "Resource Allocation",
                    "priority": "Medium",
                    "title": f"Expand Capacity in {lowest[0]} Zone",
                    "insight": f"{lowest[0]} Zone currently trails with "
                    f"{lowest[1]} clubs compared to {highest[0]} Zone "
                    f"with {highest[1]} clubs.",
                    "action": f"Schedule targeted online awareness sessions "
                    f"and allocate secondary support to {lowest[0]} Zone "
                    f"nodal officer.",
                }
            )

    # Dormant until the activities app carries training rows (see _activity_mix).
    if health["attention_count"]:
        recs.append(
            {
                "category": "Retention & Renewal",
                "priority": "High",
                "title": "Prevent Registration Churn",
                "insight": f"{health['within_30d']} clubs have renewals due "
                f"within 30 days, and {health['overdue']} are overdue.",
                "action": "Trigger automated renewal notification reminders "
                "to President and Secretary email addresses.",
            }
        )
    return recs


def _roadmap(
    penetration: dict[str, Any], health: dict[str, Any], total_clubs: int
) -> list[dict[str, Any]]:
    """30/90/365-day horizon plan (the old project's strategic roadmap)."""
    return [
        {
            "horizon_days": 30,
            "focus": "Renewal retention",
            "goal": f"Clear the renewal attention queue "
            f"({health['attention_count']} clubs).",
        },
        {
            "horizon_days": 90,
            "focus": "Growth corridors",
            "goal": "Open outreach in unrepresented States/UTs "
            f"({len(penetration['unrepresented_states'])} today).",
        },
        {
            "horizon_days": 365,
            "focus": "National scale",
            "goal": f"Reach {max(total_clubs * 2, 25)} clubs with balanced "
            "zone coverage.",
        },
    ]


def strategic_report() -> dict[str, Any]:
    """The full read-only MCC strategic report (derived at query time)."""
    penetration = _penetration()
    health = _renewal_health()
    total_clubs = sum(penetration["clubs_by_state"].values())
    return {
        "generated_at": timezone.now().isoformat(),
        "metrics": {
            "total_clubs": total_clubs,
            "unrepresented_states_count": len(penetration["unrepresented_states"]),
            "renewal_attention_count": health["attention_count"],
            "overdue_count": health["overdue"],
        },
        "penetration": penetration,
        "renewal_health": health,
        "activity_mix": _activity_mix(),
        "strategic_recommendations": _recommendations(penetration, health),
        "roadmap": _roadmap(penetration, health, total_clubs),
    }
