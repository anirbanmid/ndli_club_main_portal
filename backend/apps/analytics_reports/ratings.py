"""Officer performance star rating — M6 D4 (BRIEF_M6.md §6, owner Q2 = YES).

FAITHFUL PORT of the previous project's ``routes/metrics.py`` (lines 460-530),
owner-confirmed 2026-10-25 02:15 ("implement the faithful old-project version")::

    weighted_score = 0.50 * clubs_approved
                   + 0.30 * other_supports
                   + 0.20 * offline_training
                   + 0.10 * online_training
                   (then rounded to 2 places)

The four terms are the old project's "50% Club Approval + 30% Other Supports +
20% Offline Training + 10% Online Training" (the BRIEF's `...x0.20 + ...`
ellipsis hid the 0.10 term — this module carries the full formula).

**Migrated baseline (old R30 decision: "star rating = migrated baseline +
live")** is per-component, never one scalar: the client-worksheet history adds
its own approvals / support / online_workshops to the matching live buckets
(old lines 468-473) before the weights are applied.

P4 — every live input is DERIVED at call time from the existing tables. This
module (and the whole portal) keeps NO counter, NO "score" column, NOTHING
that can drift out of sync with the ledgers it summarises:

* ``clubs_approved``   -- DISTINCT clubs whose charter this officer sanctioned
  (``onboarding.CharterApplication`` ``status="sanctioned"`` +
  ``reviewed_by=<officer>`` — the review trail ``governance.services`` writes).
  Old code counted a SET of club ids (never double-counts a club); the portal
  equivalent is a distinct (institution_name, club_name) count.
* ``other_supports``   -- the old project's catch-all "other" activity bucket
  (``SyncEngine.bucket_activity`` else-branch: tickets, phone/remote help,
  data corrections, renewals...). Portal mapping: **TicketsClosed +
  PhoneCalls** — ``grievances.SLAEvent`` ``kind="resolved"`` rows attributed to
  the officer + ``audit.AuditLog`` rows ``action="activity.phone_call"``.
* ``offline_training`` -- ``audit.AuditLog`` ``action="activity.offline_training"``
  (old bucket ``offline``).
* ``online_training``  -- ``audit.AuditLog`` ``action="activity.online_training"``
  (old bucket ``online``).

Star banding is the old project's RELATIVE banding (``routes/metrics.py``):
5/4/3/2/1 stars at ``score / max_score`` ratios >= .80/.60/.40/.20/below.

READ-ONLY BY CONTRACT: no function here writes to the database (pinned by
``apps.analytics_reports.tests.OfficerRatingTests.test_rating_is_read_only``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.audit.models import AuditLog
from apps.grievances.models import SLAEvent
from apps.onboarding.models import CharterApplication

#: Weights of the old project's composite (routes/metrics.py line 478-482).
WEIGHT_CLUBS_APPROVED = 0.50
WEIGHT_OTHER_SUPPORTS = 0.30
WEIGHT_OFFLINE_TRAINING = 0.20
WEIGHT_ONLINE_TRAINING = 0.10

#: Audit actions carrying the support-work inputs (the previous project's
#: support log types mapped onto the audit chain).
PHONE_CALL_ACTION = "activity.phone_call"
OFFLINE_TRAINING_ACTION = "activity.offline_training"
ONLINE_TRAINING_ACTION = "activity.online_training"


@dataclass(frozen=True)
class BaselineBreakdown:
    """The migrated client-worksheet history for one officer (old R30).

    Three components because the old code adds them to THREE different live
    buckets (approvals -> clubs_approved, support -> other_supports,
    online_workshops -> online_training). ``offline_training`` has no baseline
    term in the previous project — kept identical here.
    """

    approvals: int = 0
    support: int = 0
    online_workshops: int = 0


@dataclass(frozen=True)
class RatingBreakdown:
    """One officer's derived composite (immutable — a value, not a state)."""

    officer: str
    clubs_approved: int
    tickets_closed: int
    phone_calls: int
    other_supports: int
    offline_training: int
    online_training: int
    migrated_baseline: BaselineBreakdown
    score: float


def _in_period(qs: Any, field: str, year: int | None, month: int | None) -> Any:
    """Optional period slice — the old dashboard's year/month filters."""
    if year is not None:
        qs = qs.filter(**{f"{field}__year": year})
    if month is not None:
        qs = qs.filter(**{f"{field}__month": month})
    return qs


def clubs_approved_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """DISTINCT clubs this officer sanctioned (old: a set of club ids)."""
    rows = _in_period(
        CharterApplication.objects.filter(
            status=CharterApplication.Status.SANCTIONED, reviewed_by=officer
        ),
        "reviewed_at",
        year,
        month,
    )
    return len(
        {
            (r["institution_name"], r["club_name"])
            for r in rows.values("institution_name", "club_name")
        }
    )


def tickets_closed_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Tickets this officer closed (``SLAEvent`` kind=resolved)."""
    return _in_period(
        SLAEvent.objects.filter(kind=SLAEvent.Kind.RESOLVED, actor=officer),
        "occurred_at",
        year,
        month,
    ).count()


def phone_calls_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Phone/remote-assistance calls logged for this officer (``AuditLog``)."""
    return _in_period(
        AuditLog.objects.filter(action=PHONE_CALL_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()


def offline_training_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Offline training sessions logged for this officer (``AuditLog``)."""
    return _in_period(
        AuditLog.objects.filter(action=OFFLINE_TRAINING_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()


def online_training_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Online workshops logged for this officer (``AuditLog``)."""
    return _in_period(
        AuditLog.objects.filter(action=ONLINE_TRAINING_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()


def migrated_baseline_for(officer: Any) -> BaselineBreakdown:
    """The migrated client-worksheet baseline for ``officer`` (old R30).

    Source: the migration history of BRIEF_M6.md §6 (previous project
    ``db/migration_engine.py`` history rows). Those rows are NOT re-stored
    here (P4); when the ``migration_salvage`` history import lands, THIS
    function is the one place that reads it. Until then every component is 0
    — derived, never counted twice.
    """
    return BaselineBreakdown()


def other_supports_for(officer: Any, *, year=None, month=None) -> int:
    """The old catch-all "other" bucket: TicketsClosed + PhoneCalls."""
    return tickets_closed_for(officer, year=year, month=month) + phone_calls_for(
        officer, year=year, month=month
    )


def officer_rating(
    officer: Any,
    *,
    baseline: BaselineBreakdown | None = None,
    year: int | None = None,
    month: int | None = None,
) -> RatingBreakdown:
    """Derive the officer's composite score — read-only, no side effects.

    ``baseline`` overrides the migrated baseline term (tests pin the formula
    with it); ``None`` derives it from the migration source.
    """
    clubs = clubs_approved_for(officer, year=year, month=month)
    tickets = tickets_closed_for(officer, year=year, month=month)
    calls = phone_calls_for(officer, year=year, month=month)
    offline = offline_training_for(officer, year=year, month=month)
    online = online_training_for(officer, year=year, month=month)
    base = migrated_baseline_for(officer) if baseline is None else baseline

    live_clubs = clubs + int(base.approvals)
    live_support = tickets + calls + int(base.support)
    live_online = online + int(base.online_workshops)

    score = round(
        (WEIGHT_CLUBS_APPROVED * live_clubs)
        + (WEIGHT_OTHER_SUPPORTS * live_support)
        + (WEIGHT_OFFLINE_TRAINING * offline)
        + (WEIGHT_ONLINE_TRAINING * live_online),
        2,
    )
    return RatingBreakdown(
        officer=str(getattr(officer, "username", "")),
        clubs_approved=live_clubs,
        tickets_closed=tickets,
        phone_calls=calls,
        other_supports=live_support,
        offline_training=offline,
        online_training=live_online,
        migrated_baseline=base,
        score=score,
    )


def stars_for(score: float, max_score: float) -> int:
    """Relative star banding — the previous project's thresholds.

    ``routes/metrics.py`` bands ``score / max_score`` at 0.80/0.60/0.40/0.20
    into 5/4/3/2 stars, everything else (including a zero cohort) 1 star.
    Pure: same inputs, same output.
    """
    if max_score > 0 and score > 0:
        ratio = score / max_score
        if ratio >= 0.80:
            return 5
        if ratio >= 0.60:
            return 4
        if ratio >= 0.40:
            return 3
        if ratio >= 0.20:
            return 2
        return 1
    return 1


OFFICER_METADATA: dict[str, dict[str, Any]] = {
    "EMP01": {
        "name": "Rohan Sharma (North Zone)",
        "zone": "North",
        "states": (
            "Jammu & Kashmir, Ladakh, Uttarakhand, Himachal Pradesh, "
            "Chandigarh, Punjab, Haryana, Delhi, Uttar Pradesh"
        ),
    },
    "EMP02": {
        "name": "Pooja Verma (Central Zone)",
        "zone": "Central",
        "states": "Madhya Pradesh, Chhattisgarh",
    },
    "EMP03": {
        "name": "Amit Patel (West Zone)",
        "zone": "West",
        "states": (
            "Rajasthan, Gujarat, Maharashtra, Goa, Daman and Diu, Dadar & Nagar Haveli"
        ),
    },
    "EMP04": {
        "name": "Debabrata D. Ghosh",
        "zone": "East",
        "states": "Bihar, Jharkhand, West Bengal, Odisha",
    },
    "EMP05": {
        "name": "Mayanglambam Singh (North East Zone)",
        "zone": "North East",
        "states": (
            "Sikkim, Assam, Arunachal Pradesh, Meghalaya, Manipur, "
            "Tripura, Nagaland, Mizoram"
        ),
    },
    "EMP06": {
        "name": "K. Venkatesh (South Zone 1)",
        "zone": "South",
        "states": "Andhra Pradesh, Telangana, Karnataka",
    },
    "EMP07": {
        "name": "Ananya Nair (South Zone 2)",
        "zone": "South",
        "states": (
            "Tamil Nadu, Puducherry, Kerala, Andaman & Nicobar Island, Lakshadweep"
        ),
    },
}

CANONICAL_BASELINES: dict[str, BaselineBreakdown] = {
    "EMP01": BaselineBreakdown(approvals=50, support=38, online_workshops=0),
    "EMP02": BaselineBreakdown(approvals=9, support=41, online_workshops=4),
    "EMP03": BaselineBreakdown(approvals=3, support=9, online_workshops=0),
    "EMP04": BaselineBreakdown(approvals=3, support=2, online_workshops=0),
    "EMP05": BaselineBreakdown(approvals=3, support=3, online_workshops=0),
    "EMP06": BaselineBreakdown(approvals=1, support=1, online_workshops=0),
    "EMP07": BaselineBreakdown(approvals=1, support=0, online_workshops=0),
}


def evaluate_officers(
    officers: Any,
    *,
    year: int | None = None,
    month: int | None = None,
    baselines: dict[str, BaselineBreakdown] | None = None,
) -> list[dict[str, Any]]:
    """Rank a cohort exactly like the old ``routes/metrics.py``.

    Sort: weighted_score desc, then clubs_approved desc, then total_activities
    desc (old line 509); ranks are 1..n in that order; stars are banded
    RELATIVELY against the cohort's ``max_score`` (old lines 512-524).
    """
    evaluations: list[dict[str, Any]] = []
    for officer in officers:
        key = str(getattr(officer, "username", ""))
        base = (baselines or {}).get(key)
        rating = officer_rating(officer, baseline=base, year=year, month=month)

        meta = OFFICER_METADATA.get(key.upper(), {})
        full_name = (
            getattr(officer, "get_full_name", lambda: "")() or meta.get("name") or key
        )

        zone_name = ""
        try:
            if hasattr(officer, "zone") and officer.zone:
                zone_name = (
                    getattr(officer.zone, "name", "")
                    or getattr(officer.zone, "code", "")
                    or ""
                )
        except Exception:
            zone_name = ""
        if not zone_name:
            zone_name = meta.get("zone", "Other")

        assigned_states = meta.get("states", "")
        try:
            from apps.domain.models import OfficerAssignment

            assignments = list(
                OfficerAssignment.objects.filter(officer=officer).select_related(
                    "state"
                )
            )
            if assignments:
                assigned_states = ", ".join(
                    a.state.name for a in assignments if hasattr(a, "state") and a.state
                )
        except Exception:
            pass

        evaluations.append(
            {
                "officer": key,
                "emp_id": key,
                "officer_name": full_name,
                "full_name": full_name,
                "name": full_name,
                "zone": zone_name,
                "assigned_jurisdiction": assigned_states,
                "assigned_states": assigned_states,
                "clubs_approved": rating.clubs_approved,
                "tickets_closed": rating.tickets_closed,
                "phone_calls": rating.phone_calls,
                "other_supports": rating.other_supports,
                "offline_training": rating.offline_training,
                "online_training": rating.online_training,
                "total_activities": (
                    rating.other_supports
                    + rating.offline_training
                    + rating.online_training
                ),
                "weighted_score": rating.score,
                "score": rating.score,
                "migrated_baseline": {
                    "approvals": rating.migrated_baseline.approvals,
                    "support": rating.migrated_baseline.support,
                    "online_workshops": rating.migrated_baseline.online_workshops,
                },
            }
        )

    evaluations.sort(
        key=lambda e: (e["weighted_score"], e["clubs_approved"], e["total_activities"]),
        reverse=True,
    )
    max_score = max((e["weighted_score"] for e in evaluations), default=0.0)
    for index, evaluation in enumerate(evaluations, start=1):
        evaluation["rank"] = index
        evaluation["stars"] = stars_for(evaluation["weighted_score"], max_score)
        evaluation["max_score"] = max_score
    return evaluations
