"""M6 governance — Institutional Charter Verification & Sanction Gate.

Owner decisions (``BRIEF_M6.md`` §6, 2026-10-24):

* Zone officers (``SubRole.REGIONAL_OFFICER``) review and sanction charters for
  their **own zone only**; ``central_admin`` / ``super_admin_ops`` act on any
  zone (override path). Cross-zone access is denied at the **queryset** level
  (P0/P4): a foreign application is indistinguishable from a missing one.
* Every decision writes an immutable ``AuditLog`` entry (P0).
* Sanctioning a charter materialises the club and auto-generates the
  registration certificate deposited to the club admin side (slice D2b —
  wired on top of :func:`review_charter`, which returns the sanctioned row).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from ..accounts.models import SubRole
from ..audit import services as audit_services
from ..onboarding.models import CharterApplication


class GovernanceError(Exception):
    """Domain error; the API layer maps it to HTTP 400/404."""


#: Decisions accepted by :func:`review_charter`.
DECISION_REVIEW = "review"
DECISION_SANCTION = "sanction"
DECISION_REJECT = "reject"
DECISIONS = frozenset({DECISION_REVIEW, DECISION_SANCTION, DECISION_REJECT})

#: Sub-roles allowed to decide charters at all.
DECIDER_SUB_ROLES = frozenset(
    {SubRole.REGIONAL_OFFICER, SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}
)

#: Sub-roles whose reach is limited to their own zone.
ZONE_BOUND_SUB_ROLES = frozenset({SubRole.REGIONAL_OFFICER})

_DECISION_TO_STATUS = {
    DECISION_REVIEW: CharterApplication.Status.UNDER_REVIEW,
    DECISION_SANCTION: CharterApplication.Status.SANCTIONED,
    DECISION_REJECT: CharterApplication.Status.REJECTED,
}

_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    CharterApplication.Status.QUEUED: frozenset(
        {
            CharterApplication.Status.UNDER_REVIEW,
            CharterApplication.Status.SANCTIONED,
            CharterApplication.Status.REJECTED,
        }
    ),
    CharterApplication.Status.UNDER_REVIEW: frozenset(
        {CharterApplication.Status.SANCTIONED, CharterApplication.Status.REJECTED}
    ),
    CharterApplication.Status.SANCTIONED: frozenset(),
    CharterApplication.Status.REJECTED: frozenset(),
}


def _sub_role(user: Any) -> str:
    return str(getattr(user, "sub_role", "") or "")


def _zone_code(user: Any) -> str:
    return str(getattr(user, "zone_code", "") or "")


def ensure_decider(user: Any) -> None:
    """Role gate: only EMP officers and central admins decide charters."""
    if _sub_role(user) not in DECIDER_SUB_ROLES:
        raise GovernanceError("not_a_decider")


def _scoped_queryset(user: Any) -> Any:
    """Charter queue rows visible to ``user`` (queryset-level scoping)."""
    qs = CharterApplication.objects.all()
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        qs = qs.filter(zone_code=_zone_code(user))
    return qs.order_by("submitted_at")


def queue_for(user: Any) -> Any:
    """The charter review queue for this actor (zone-scoped for officers)."""
    ensure_decider(user)
    return _scoped_queryset(user)


@transaction.atomic
def review_charter(
    *,
    application_id: Any,
    user: Any,
    decision: str,
    reason: str = "",
    request: Any = None,
) -> CharterApplication:
    """Record a charter review decision for ``application_id``.

    Raises ``GovernanceError("not_found")`` both when the row does not exist
    and when it lies outside the actor's zone (404 semantics — existence is
    never disclosed cross-zone), ``GovernanceError("illegal_transition")`` on
    state-machine violations and ``GovernanceError("invalid_decision")`` on
    unknown decisions.
    """
    ensure_decider(user)
    if decision not in DECISIONS:
        raise GovernanceError("invalid_decision")

    new_status = _DECISION_TO_STATUS[decision]
    # select_for_update + scope filter: the row is locked AND zone-filtered in
    # one query, so a cross-zone IDOR resolves to the same 404 as a bad id.
    try:
        application = _scoped_queryset(user).select_for_update().get(pk=application_id)
    except CharterApplication.DoesNotExist:
        raise GovernanceError("not_found") from None

    previous_status = application.status
    if new_status not in _ALLOWED_TRANSITIONS[previous_status]:
        raise GovernanceError("illegal_transition")

    application.status = new_status
    application.reviewed_by = user
    application.reviewed_at = timezone.now()
    application.review_reason = str(reason)[:500]
    application.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "review_reason"]
    )

    audit_services.record(
        action=f"charter.{decision}",
        outcome="success",
        object_type="charter_application",
        object_id=str(application.pk),
        request=request,
        detail={
            "club_name": application.club_name,
            "institution_name": application.institution_name,
            "zone_code": application.zone_code,
            "from_status": str(previous_status),
            "to_status": str(application.status),
            "reason": application.review_reason,
        },
    )
    if decision == DECISION_SANCTION:
        # Deferred import: materialisation imports GovernanceError from here.
        from .materialisation import materialise_charter

        materialise_charter(application=application, request=request)
    return application
