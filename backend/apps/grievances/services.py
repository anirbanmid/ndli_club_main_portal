"""Grievance lifecycle — the M6 port of the previous project's issue manager.

Source of truth for the rules (``BRIEF_M6.md`` §6 C3, previous project
``db/issue_manager.py``):

* Creation sets ``reminder_due_at = created + 72h`` and
  ``admin_reminder_due_at = created + 30d`` (wall-clock, exactly as before).
* A "Not Resolved" mark reschedules +7 days for the **actor's own** stream:
  central admin → ``admin_reminder_due_at`` only (old line 269-270); zone
  officer → ``reminder_due_at`` only (old line 273-274).
* **The 30-day escalation is NEVER postponed by employee-side marks** (old
  line 275 preserves ``admin_reminder_due_at``) — pinned in tests.
* ≥30 days unresolved AND ``admin_reminder_due_at`` due → central escalation
  (``is_admin_escalated``), recorded as an ``SLAEvent`` (P4: dashboards derive
  from the SLA ledger + AuditLog, never independently counted).

All timers come from ``settings.GRIEVANCE_SLA`` — the ONE settings store (P4).
Access rules: intake is **club authorities only** (C4); the dispatcher side is
zone-scoped at the queryset level (P0/P4 — cross-zone rows look missing).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..accounts.models import SubRole
from ..audit import services as audit_services
from ..domain.models import AuthorityAssignment
from .models import GrievanceTicket, SLAEvent


#: Error codes mapped to HTTP by the API layer (see governance.services).
class GrievanceError(Exception):
    """Domain error; the API layer maps it to HTTP 400/403/404."""


#: Decisions accepted by :func:`resolve_ticket` (old free-text statuses).
DECISION_RESOLVED = "resolved"
DECISION_NOT_RESOLVED = "not_resolved"
DECISIONS = frozenset({DECISION_RESOLVED, DECISION_NOT_RESOLVED})

#: Sub-roles allowed on the dispatcher (zone desk + central escalation desk).
DECIDER_SUB_ROLES = frozenset(
    {SubRole.REGIONAL_OFFICER, SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}
)
#: Sub-roles that act like the old project's "ADMIN" actor (7d escalation cycle).
CENTRAL_SUB_ROLES = frozenset({SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS})
#: Sub-roles whose reach is limited to their own zone.
ZONE_BOUND_SUB_ROLES = frozenset({SubRole.REGIONAL_OFFICER})


def _sla() -> dict[str, Any]:
    """The one settings-backed SLA store (P4)."""
    return settings.GRIEVANCE_SLA


def _sub_role(user: Any) -> str:
    return str(getattr(user, "sub_role", "") or "")


def _zone_code(user: Any) -> str:
    return str(getattr(user, "zone_code", "") or "")


def ensure_dispatcher(user: Any) -> None:
    """Role gate: only EMP officers and central admins run the dispatcher."""
    if _sub_role(user) not in DECIDER_SUB_ROLES:
        raise GrievanceError("not_a_decider")


def _scoped_queryset(user: Any) -> Any:
    """Ticket rows visible to ``user`` (queryset-level zone scoping, P0)."""
    qs = GrievanceTicket.objects.all()
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        qs = qs.filter(zone_code=_zone_code(user))
    return qs.order_by("-created_at")


def queue_for(user: Any) -> Any:
    """The dispatcher queue for this actor (zone-scoped for officers)."""
    ensure_dispatcher(user)
    return _scoped_queryset(user)


def tickets_for_club_authority(user: Any) -> Any:
    """The caller's own club tickets (club-authority door, C4)."""
    club_ids = AuthorityAssignment.objects.filter(
        user=user, status=AuthorityAssignment.Status.ACTIVE
    ).values_list("club_id", flat=True)
    return GrievanceTicket.objects.filter(club_id__in=list(club_ids)).order_by(
        "-created_at"
    )


def ensure_club_authority(user: Any, club: Any) -> None:
    """C4/P0: only an ACTIVE authority of THIS club may raise a ticket."""
    if not AuthorityAssignment.objects.filter(
        user=user, club=club, status=AuthorityAssignment.Status.ACTIVE
    ).exists():
        raise GrievanceError("not_club_authority")


def _derive_zone(club: Any) -> tuple[str, str]:
    """(state_code, zone_code) from the canonical mapping (C2: never fabricate)."""
    state = getattr(getattr(club, "institution", None), "state", None)
    zone = getattr(state, "zone", None)
    if state is None or zone is None:
        raise GrievanceError("no_zone_mapping")
    return str(state.code), str(zone.code)


@transaction.atomic
def create_ticket(
    *,
    raised_by: Any,
    club: Any,
    subject: str,
    description: str,
    request: Any = None,
) -> GrievanceTicket:
    """Intake (C4: club authorities only) with auto zone routing (C2)."""
    ensure_club_authority(raised_by, club)
    subject = str(subject).strip()
    if not subject:
        raise GrievanceError("empty_subject")
    state_code, zone_code = _derive_zone(club)

    cfg = _sla()
    now = timezone.now()
    ticket = GrievanceTicket.objects.create(
        club=club,
        raised_by=raised_by,
        state_code=state_code,
        zone_code=zone_code,
        subject=subject[:200],
        description=str(description),
        reminder_due_at=now + timedelta(hours=int(cfg["REMINDER_HOURS"])),
        admin_reminder_due_at=now + timedelta(days=int(cfg["ESCALATION_DAYS"])),
    )
    audit_services.record(
        action="grievance.created",
        outcome="success",
        object_type="grievance_ticket",
        object_id=str(ticket.pk),
        request=request,
        detail={
            "subject": ticket.subject,
            "club_id": str(ticket.club_id),
            "zone_code": ticket.zone_code,
            "state_code": ticket.state_code,
        },
        zone_code=ticket.zone_code,
    )
    return ticket


def due_reminders(as_of: Any = None) -> Any:
    """Unresolved tickets whose reminder stream is due (old get_employee_reminders)."""
    as_of = as_of or timezone.now()
    return GrievanceTicket.objects.filter(
        reminder_due_at__lte=as_of,
        status__in=[
            GrievanceTicket.Status.OPEN,
            GrievanceTicket.Status.NOT_RESOLVED,
        ],
    ).order_by("reminder_due_at")


def due_admin_escalations(as_of: Any = None) -> Any:
    """Unresolved tickets ready for the central escalation (old get_admin_reminders)."""
    as_of = as_of or timezone.now()
    cfg = _sla()
    min_age = as_of - timedelta(days=int(cfg["ESCALATION_DAYS"]))
    return GrievanceTicket.objects.filter(
        admin_reminder_due_at__lte=as_of,
        created_at__lte=min_age,
        status__in=[
            GrievanceTicket.Status.OPEN,
            GrievanceTicket.Status.NOT_RESOLVED,
        ],
        is_admin_escalated=False,
    ).order_by("created_at")


@transaction.atomic
def sweep(*, as_of: Any = None, request: Any = None) -> dict[str, int]:
    """Bounded self-heal pass (P5): record breaches + fire escalations.

    Idempotent — each reminder cycle records at most one ``BREACH`` and an
    escalation fires at most once per ticket (``is_admin_escalated`` latch).
    """
    as_of = as_of or timezone.now()
    breaches = 0
    escalations = 0

    for ticket in due_reminders(as_of):
        # One breach mark per reminder cycle (since creation / last "Not Resolved").
        anchor = (
            ticket.sla_events.filter(kind=SLAEvent.Kind.NOT_RESOLVED)
            .order_by("-occurred_at")
            .values_list("occurred_at", flat=True)
            .first()
            or ticket.created_at
        )
        if not ticket.sla_events.filter(
            kind=SLAEvent.Kind.BREACH, occurred_at__gte=anchor
        ).exists():
            SLAEvent.objects.create(
                ticket=ticket,
                kind=SLAEvent.Kind.BREACH,
                note=f"reminder due {ticket.reminder_due_at.isoformat()}",
            )
            breaches += 1

    for ticket in due_admin_escalations(as_of):
        ticket.is_admin_escalated = True
        ticket.escalated_at = as_of
        ticket.save(update_fields=["is_admin_escalated", "escalated_at", "updated_at"])
        SLAEvent.objects.create(
            ticket=ticket,
            kind=SLAEvent.Kind.ESCALATION,
            note="unresolved 30 days -> central escalation",
        )
        audit_services.record(
            action="grievance.escalated",
            outcome="success",
            object_type="grievance_ticket",
            object_id=str(ticket.pk),
            request=request,
            detail={"zone_code": ticket.zone_code, "subject": ticket.subject},
            zone_code=ticket.zone_code,
        )
        escalations += 1

    return {"breaches": breaches, "escalations": escalations}


@transaction.atomic
def resolve_ticket(
    *,
    ticket_id: Any,
    user: Any,
    decision: str,
    reason: str = "",
    request: Any = None,
) -> GrievanceTicket:
    """Record a "Resolved" / "Not Resolved" mark (old ``resolve_issue`` port).

    * resolved → ticket leaves both streams.
    * not_resolved by a **central** actor → ``admin_reminder_due_at += 7d``
      (recurrent escalation cycle; the employee stream is untouched).
    * not_resolved by a **zone officer** → ``reminder_due_at += 7d`` and
      ``admin_reminder_due_at`` is PRESERVED — the 30-day escalation is never
      postponed (old line 275).

    Cross-zone tickets resolve to the same 404 as unknown ids (P0).
    """
    ensure_dispatcher(user)
    if decision not in DECISIONS:
        raise GrievanceError("invalid_decision")

    try:
        ticket = _scoped_queryset(user).select_for_update().get(pk=ticket_id)
    except GrievanceTicket.DoesNotExist:
        raise GrievanceError("not_found") from None

    if ticket.status == GrievanceTicket.Status.RESOLVED:
        raise GrievanceError("illegal_transition")

    cfg = _sla()
    now = timezone.now()
    cycle = timedelta(days=int(cfg["CYCLE_DAYS"]))
    reason = str(reason)[:500]

    if decision == DECISION_RESOLVED:
        ticket.status = GrievanceTicket.Status.RESOLVED
        ticket.resolved_at = now
        ticket.resolved_by = user
        ticket.save(
            update_fields=["status", "resolved_at", "resolved_by", "updated_at"]
        )
        SLAEvent.objects.create(
            ticket=ticket, kind=SLAEvent.Kind.RESOLVED, actor=user, note=reason
        )
        action = "grievance.resolved"
    else:
        ticket.status = GrievanceTicket.Status.NOT_RESOLVED
        fields = ["status", "updated_at"]
        if _sub_role(user) in CENTRAL_SUB_ROLES:
            # Old line 269-270: admin bumps the ESCALATION stream only.
            ticket.admin_reminder_due_at = now + cycle
            fields.append("admin_reminder_due_at")
        else:
            # Old line 273-275: employee bumps their own stream ONLY — the
            # 30-day escalation anchor is deliberately preserved.
            ticket.reminder_due_at = now + cycle
            fields.append("reminder_due_at")
        ticket.save(update_fields=fields)
        SLAEvent.objects.create(
            ticket=ticket, kind=SLAEvent.Kind.NOT_RESOLVED, actor=user, note=reason
        )
        action = "grievance.not_resolved"

    audit_services.record(
        action=action,
        outcome="success",
        object_type="grievance_ticket",
        object_id=str(ticket.pk),
        request=request,
        detail={
            "decision": decision,
            "reason": reason,
            "zone_code": ticket.zone_code,
            "subject": ticket.subject,
        },
        zone_code=ticket.zone_code,
    )
    return ticket
