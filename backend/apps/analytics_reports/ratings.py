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

#: Weights of composite:
#: Raw weights: Clubs Approved 50, Other Supports 30, Offline Training 20,
#: Online Training 10 (sum = 110). Normalize: w' = w / sum(w).
RAW_WEIGHT_CLUBS_APPROVED = 50.0
RAW_WEIGHT_OTHER_SUPPORTS = 30.0
RAW_WEIGHT_OFFLINE_TRAINING = 20.0
RAW_WEIGHT_ONLINE_TRAINING = 10.0
TOTAL_RAW_WEIGHT = (
    RAW_WEIGHT_CLUBS_APPROVED
    + RAW_WEIGHT_OTHER_SUPPORTS
    + RAW_WEIGHT_OFFLINE_TRAINING
    + RAW_WEIGHT_ONLINE_TRAINING
)  # 110.0

NORM_WEIGHT_CLUBS_APPROVED = RAW_WEIGHT_CLUBS_APPROVED / TOTAL_RAW_WEIGHT
NORM_WEIGHT_OTHER_SUPPORTS = RAW_WEIGHT_OTHER_SUPPORTS / TOTAL_RAW_WEIGHT
NORM_WEIGHT_OFFLINE_TRAINING = RAW_WEIGHT_OFFLINE_TRAINING / TOTAL_RAW_WEIGHT
NORM_WEIGHT_ONLINE_TRAINING = RAW_WEIGHT_ONLINE_TRAINING / TOTAL_RAW_WEIGHT

#: Legacy backward compatibility aliases
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
    """Tickets this officer closed (SLAEvent resolved + ActivityLog OS_TICKET)."""
    from apps.activities.models import ActivityLog, SupportType

    sla_count = _in_period(
        SLAEvent.objects.filter(kind=SLAEvent.Kind.RESOLVED, actor=officer),
        "occurred_at",
        year,
        month,
    ).count()
    act_count = _in_period(
        ActivityLog.objects.filter(
            employee=officer, support_type=SupportType.OS_TICKET
        ),
        "timestamp",
        year,
        month,
    ).count()
    return sla_count + act_count


def phone_calls_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Phone/remote-assistance calls for officer (AuditLog + ActivityLog)."""
    from django.db.models import Sum
    from django.db.models.functions import Coalesce

    from apps.activities.models import ActivityLog, SupportType

    audit_count = _in_period(
        AuditLog.objects.filter(action=PHONE_CALL_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()
    act_calls = _in_period(
        ActivityLog.objects.filter(
            employee=officer, support_type=SupportType.PHONE_CALL
        ),
        "timestamp",
        year,
        month,
    ).aggregate(n=Sum(Coalesce("call_count", 1)))["n"] or 0
    return audit_count + act_calls


def offline_training_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Offline training sessions for officer (AuditLog + ActivityLog)."""
    from apps.activities.models import ActivityLog, SupportType

    audit_count = _in_period(
        AuditLog.objects.filter(action=OFFLINE_TRAINING_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()
    act_count = _in_period(
        ActivityLog.objects.filter(
            employee=officer, support_type=SupportType.OFFLINE_TRAINING
        ),
        "timestamp",
        year,
        month,
    ).count()
    return audit_count + act_count


def online_training_for(
    officer: Any, *, year: int | None = None, month: int | None = None
) -> int:
    """Online workshops logged for this officer (``AuditLog`` + ``ActivityLog``)."""
    from apps.activities.models import ActivityLog, SupportType

    audit_count = _in_period(
        AuditLog.objects.filter(action=ONLINE_TRAINING_ACTION, actor_id=officer.pk),
        "timestamp",
        year,
        month,
    ).count()
    act_count = _in_period(
        ActivityLog.objects.filter(
            employee=officer, support_type=SupportType.ONLINE_TRAINING
        ),
        "timestamp",
        year,
        month,
    ).count()
    return audit_count + act_count


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
    """Relative star banding (integer legacy helper)."""
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


def compute_stars(total_score: float) -> float:
    """Convert 0-100 total score into 5-star rating (0.5 star increments).

    Rules:
    Total / 20 rounded to nearest 0.5, minimum 1.0, maximum 5.0.
    Total 90-100 -> 5.0
    Total 80-89.9 -> 4.0-4.5
    Total 60-79.9 -> 3.0-3.5
    Total 40-59.9 -> 2.0-2.5
    Below 40 -> 1.0-1.5
    """
    raw_stars = total_score / 20.0
    stars = round(raw_stars * 2) / 2.0
    if total_score >= 90.0:
        stars = 5.0
    return max(1.0, min(5.0, stars))


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

CANONICAL_BASELINES: dict[str, BaselineBreakdown] = {}


def evaluate_officers(
    officers: Any,
    *,
    year: int | None = None,
    month: int | None = None,
    baselines: dict[str, BaselineBreakdown] | None = None,
) -> list[dict[str, Any]]:
    """Rank a cohort using normalized weights, zone difficulty multipliers,

    task scores (0-100 against team maxima), and 0.5-star banded scoring.
    """
    from apps.activities.models import ActivityLog, SupportType

    active_baselines = CANONICAL_BASELINES if baselines is None else baselines
    evaluations: list[dict[str, Any]] = []

    for officer in officers:
        key = str(getattr(officer, "username", ""))
        if not key.upper().startswith("EMP"):
            continue
        base = active_baselines.get(key, BaselineBreakdown())
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

        # Raw counts: preserve SSOT without double counting baseline and ActivityLog
        clubs = clubs_approved_for(officer, year=year, month=month)
        tickets = tickets_closed_for(officer, year=year, month=month)
        calls = phone_calls_for(officer, year=year, month=month)
        offline = offline_training_for(officer, year=year, month=month)
        online = online_training_for(officer, year=year, month=month)
        act_approvals = _in_period(
            ActivityLog.objects.filter(
                employee=officer, support_type=SupportType.CLUB_APPROVAL
            ),
            "timestamp",
            year,
            month,
        ).count()

        renewals = _in_period(
            ActivityLog.objects.filter(
                employee=officer, support_type=SupportType.REGISTRATION_RENEWAL
            ),
            "timestamp",
            year,
            month,
        ).count()

        raw_a = max(clubs, int(base.approvals), act_approvals)
        raw_s = max(tickets + calls + renewals, int(base.support))
        raw_f = max(offline, 0)
        raw_o = max(online, int(base.online_workshops))

        # Zone difficulty multipliers:
        # North / North-East: Club Approval x1.40; Other Supports, Offline, Online x1.25
        # Other zones: all x1.00
        z_clean = (
            zone_name.upper().replace("-", " ").replace("_", " ").strip()
        )
        is_nne = z_clean in [
            "NORTH",
            "NORTH EAST",
            "NNE",
            "NORTH ZONE",
            "NORTH EAST ZONE",
        ]
        m_a = 1.40 if is_nne else 1.00
        m_s = 1.25 if is_nne else 1.00
        m_f = 1.25 if is_nne else 1.00
        m_o = 1.25 if is_nne else 1.00

        adj_a = raw_a * m_a
        adj_s = raw_s * m_s
        adj_f = raw_f * m_f
        adj_o = raw_o * m_o

        evaluations.append(
            {
                "officer": key,
                "emp_id": key,
                "officer_name": full_name,
                "full_name": full_name,
                "name": full_name,
                "zone": zone_name,
                "is_nne": is_nne,
                "assigned_jurisdiction": assigned_states,
                "assigned_states": assigned_states,
                "clubs_approved": raw_a,
                "tickets_closed": tickets,
                "phone_calls": calls,
                "other_supports": raw_s,
                "offline_training": raw_f,
                "online_training": raw_o,
                "total_activities": raw_s + raw_f + raw_o,
                "multiplier_clubs_approved": m_a,
                "multiplier_other_supports": m_s,
                "multiplier_offline_training": m_f,
                "multiplier_online_training": m_o,
                "adj_clubs_approved": round(adj_a, 2),
                "adj_other_supports": round(adj_s, 2),
                "adj_offline_training": round(adj_f, 2),
                "adj_online_training": round(adj_o, 2),
                "migrated_baseline": {
                    "approvals": base.approvals,
                    "support": base.support,
                    "online_workshops": base.online_workshops,
                },
            }
        )

    # Calculate team maxima for task scores (0-100)
    max_a = max((e["adj_clubs_approved"] for e in evaluations), default=0.0)
    max_s = max((e["adj_other_supports"] for e in evaluations), default=0.0)
    max_f = max((e["adj_offline_training"] for e in evaluations), default=0.0)
    max_o = max((e["adj_online_training"] for e in evaluations), default=0.0)

    for e in evaluations:
        score_a = (
            (e["adj_clubs_approved"] / max_a * 100.0) if max_a > 0 else 0.0
        )
        score_s = (
            (e["adj_other_supports"] / max_s * 100.0) if max_s > 0 else 0.0
        )
        score_f = (
            (e["adj_offline_training"] / max_f * 100.0) if max_f > 0 else 0.0
        )
        score_o = (
            (e["adj_online_training"] / max_o * 100.0) if max_o > 0 else 0.0
        )

        total = (
            (NORM_WEIGHT_CLUBS_APPROVED * score_a)
            + (NORM_WEIGHT_OTHER_SUPPORTS * score_s)
            + (NORM_WEIGHT_OFFLINE_TRAINING * score_f)
            + (NORM_WEIGHT_ONLINE_TRAINING * score_o)
        )
        stars = compute_stars(total)

        e["score_clubs_approved"] = round(score_a, 1)
        e["score_other_supports"] = round(score_s, 1)
        e["score_offline_training"] = round(score_f, 1)
        e["score_online_training"] = round(score_o, 1)
        e["total"] = round(total, 1)
        e["score"] = round(total, 1)
        e["weighted_score"] = round(total, 1)
        e["stars"] = stars
        full_stars = int(stars)
        has_half = (stars % 1.0) != 0
        empty_stars = 5 - full_stars - (1 if has_half else 0)
        e["stars_display"] = (
            ("★" * full_stars) + ("½" if has_half else "") + ("☆" * empty_stars)
        )
        e["rating_label"] = f"{stars:.1f} / 5.0"
        e["max_score"] = 100.0

    evaluations.sort(
        key=lambda e: (
            e["weighted_score"],
            e["clubs_approved"],
            e["other_supports"],
        ),
        reverse=True,
    )

    for index, evaluation in enumerate(evaluations, start=1):
        evaluation["rank"] = index

    return evaluations
