"""Zone dashboard metrics — M6 D4 (BRIEF_M6.md §1 "Officer Audit Dashboards").

BRIEF D4 scope, verbatim: *"Zone-scoped metrics: open tickets, SLA compliance %,
charter queue depth, recent audit-trail activity. Full audit visibility for
CentralAdmin. Read-only over AuditLog + SLAEvent (P4 single source: no
duplicated counters — derived at query time or one cached rollup computed in
exactly one place)."*

This module is that single derivation place. It keeps NO counter and writes
NOTHING: every figure below is a query over the existing ledgers.

* open / not_resolved / resolved tickets -- ``grievances.GrievanceTicket``
  status counts.
* SLA breaches / escalations -- ``grievances.SLAEvent`` kind counts
  (the append-only SLA ledger the dispatcher writes).
* **SLA compliance %** -- share of tickets that NEVER took a ``breach`` mark:
  ``(tickets - tickets_with_breach) / tickets * 100`` (100.0 on an empty
  queue). Derived from ``SLAEvent`` only.
* charter queue depth -- ``onboarding.CharterApplication`` rows still in the
  review pipeline (queued / under_review).
* recent audit-trail activity -- the tail of ``audit.AuditLog``.

Zone scoping lives in :func:`visible_zone` — the ONE decision point (P0): a
zone-bound officer can only ever see their own zone, whatever they ask for,
and out-of-scope zones are indistinguishable from empty ones.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.accounts.models import Category, SubRole
from apps.audit.models import AuditLog
from apps.grievances.models import GrievanceTicket, SLAEvent
from apps.onboarding.models import CharterApplication

#: Sub-roles that get SCORED: the EMP officers (the previous project's
#: employee-performance cohort — central admins run the desks, they are not
#: rated). The dashboard door itself is wider (see DASHBOARD_SUB_ROLES).
SCORED_SUB_ROLES = frozenset({SubRole.REGIONAL_OFFICER})

#: Sub-roles allowed on the dashboards (admin module).
DASHBOARD_SUB_ROLES = frozenset(
    {SubRole.REGIONAL_OFFICER, SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}
)
#: Sub-roles acting like the old project's "ADMIN" actor (all-zone view).
CENTRAL_SUB_ROLES = frozenset({SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS})
#: Sub-roles whose reach is limited to their own zone.
ZONE_BOUND_SUB_ROLES = frozenset({SubRole.REGIONAL_OFFICER})

#: Charter statuses still occupying the review queue (queue depth).
_QUEUED_STATUSES = (
    CharterApplication.Status.QUEUED,
    CharterApplication.Status.UNDER_REVIEW,
)

#: Ticket statuses that have not left the dispatcher stream.
_UNRESOLVED = (GrievanceTicket.Status.OPEN, GrievanceTicket.Status.NOT_RESOLVED)


def _sub_role(user: Any) -> str:
    return str(getattr(user, "sub_role", "") or "")


def visible_zone(user: Any, requested: Any = "") -> str | None:
    """THE zone-scoping decision (P0): which zone this caller may see.

    ``None`` means "all zones" and is reachable by central actors only; a
    zone-bound officer always gets their own zone, silently ignoring any other
    request (out-of-scope == missing, never data).
    """
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        return str(getattr(user, "zone_code", "") or "")
    return str(requested or "") or None


def officers_in_scope(user: Any, requested_zone: Any = "") -> Any:
    """The officers this caller may score (their own row, or the cohort)."""
    from apps.accounts.models import User

    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        return User.objects.filter(pk=user.pk)
    qs = User.objects.filter(
        category=Category.IIT_KGP_ADMIN, sub_role__in=SCORED_SUB_ROLES
    )
    zone = str(requested_zone or "")
    if zone:
        # User.zone is the FK (db_column="zone_code"); zone_code is a property.
        qs = qs.filter(zone_id=zone)
    return qs.order_by("username")


@dataclass(frozen=True)
class ZoneDashboard:
    """One derived dashboard snapshot (a value, not a state)."""

    zone_code: str | None
    open_tickets: int
    not_resolved_tickets: int
    resolved_tickets: int
    sla_breaches: int
    sla_escalations: int
    sla_compliance_pct: float
    charter_queue_depth: int
    audit_events: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "zone_code": self.zone_code,
            "open_tickets": self.open_tickets,
            "not_resolved_tickets": self.not_resolved_tickets,
            "resolved_tickets": self.resolved_tickets,
            "sla_breaches": self.sla_breaches,
            "sla_escalations": self.sla_escalations,
            "sla_compliance_pct": self.sla_compliance_pct,
            "charter_queue_depth": self.charter_queue_depth,
            "audit_events": self.audit_events,
        }


def _tickets(zone: str | None) -> Any:
    qs = GrievanceTicket.objects.all()
    return qs.filter(zone_code=zone) if zone else qs


def _applications(zone: str | None) -> Any:
    qs = CharterApplication.objects.all()
    return qs.filter(zone_code=zone) if zone else qs


def _sla_events(zone: str | None) -> Any:
    qs = SLAEvent.objects.all()
    return qs.filter(ticket__zone_code=zone) if zone else qs


def _audit_rows(zone: str | None) -> Any:
    qs = AuditLog.objects.all()
    return qs.filter(zone_code=zone) if zone else qs


def sla_compliance_pct(zone: str | None = None) -> float:
    """Share of tickets that never took a breach mark (SLAEvent-derived)."""
    total = _tickets(zone).count()
    if total == 0:
        return 100.0
    breached = (
        _sla_events(zone)
        .filter(kind=SLAEvent.Kind.BREACH)
        .values("ticket_id")
        .distinct()
        .count()
    )
    return round(((total - breached) / total) * 100, 1)


def zone_dashboard(zone: str | None = None) -> ZoneDashboard:
    """Derive the whole dashboard in one place (P4)."""
    tickets = _tickets(zone)
    events = _sla_events(zone)
    return ZoneDashboard(
        zone_code=zone,
        open_tickets=tickets.filter(status=GrievanceTicket.Status.OPEN).count(),
        not_resolved_tickets=tickets.filter(
            status=GrievanceTicket.Status.NOT_RESOLVED
        ).count(),
        resolved_tickets=tickets.filter(status=GrievanceTicket.Status.RESOLVED).count(),
        sla_breaches=events.filter(kind=SLAEvent.Kind.BREACH).count(),
        sla_escalations=events.filter(kind=SLAEvent.Kind.ESCALATION).count(),
        sla_compliance_pct=sla_compliance_pct(zone),
        charter_queue_depth=_applications(zone)
        .filter(status__in=_QUEUED_STATUSES)
        .count(),
        audit_events=_audit_rows(zone).count(),
    )


def recent_audit(zone: str | None = None, *, limit: int = 20) -> list[dict[str, Any]]:
    """The audit-trail tail (CentralAdmin sees every zone; officers their own)."""
    rows = _audit_rows(zone).order_by("-seq")[: max(1, min(int(limit), 100))]
    return [
        {
            "seq": row.seq,
            "timestamp": row.timestamp,
            "actor_label": row.actor_label,
            "action": row.action,
            "outcome": row.outcome,
            "object_type": row.object_type,
            "object_id": row.object_id,
            "zone_code": row.zone_code,
        }
        for row in rows
    ]
