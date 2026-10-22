"""Roster join-request services (M4 D3 — confirm/reject in the roster view).

Single source (P4): the confirmation rule lives HERE. Confirming a pending
request is the ONLY way a campus self-join becomes a ``domain.Membership``
row, and it is idempotent at the membership level (``get_or_create``): a
member added through any other path is reused, never duplicated, and the
decision is always audited (M8 ethic: zero silent loss).
"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.domain.models import Membership

from .models import JoinRequest


class MemberError(Exception):
    """Roster-side error carrying a machine code + HTTP status for views."""

    def __init__(self, message: str, *, code: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


def _audit(
    action: str, request: Any = None, *, actor: Any = None, **detail: Any
) -> None:
    """Append exactly one audit row for a roster decision (M1 pattern)."""
    from apps.audit.services import record as audit_record

    actor_id = getattr(actor, "pk", None) if actor is not None else None
    audit_record(
        action=action,
        request=request,
        actor_id=int(actor_id) if actor_id is not None else None,
        actor_label=actor.get_username() if actor is not None else "",
        detail=detail,
    )


def confirm_join(
    *, join_request: JoinRequest, decided_by: Any, request: Any = None
) -> Membership:
    """Approve a pending join and create/reuse THE membership row (W6/W9).

    Only ``pending`` requests can be decided (a re-decide is a 409 — the
    decision log stays truthful). The membership itself is
    ``get_or_create``: confirming can never duplicate a roster row (P2) and
    never silently drops the request (P5/M8).
    """
    if join_request.status != JoinRequest.Status.PENDING:
        raise MemberError(
            "That join request is already decided.",
            code="already_decided",
            http_status=409,
        )
    with transaction.atomic():
        membership, created = Membership.objects.get_or_create(
            user=join_request.user,
            club=join_request.club,
            defaults={
                "role": Membership.Role.MEMBER,
                "status": Membership.Status.ACTIVE,
            },
        )
        join_request.status = JoinRequest.Status.APPROVED
        join_request.decided_by = decided_by
        join_request.decided_at = timezone.now()
        join_request.save(
            update_fields=["status", "decided_by", "decided_at"]
        )
    _audit(
        "club_join.confirmed",
        request,
        actor=decided_by,
        object_type="join_request",
        object_id=str(join_request.pk),
        club=join_request.club_id,
        membership_created=created,
    )
    return membership


def reject_join(
    *, join_request: JoinRequest, decided_by: Any, request: Any = None
) -> JoinRequest:
    """Reject a pending join (audited; the student may re-request later)."""
    if join_request.status != JoinRequest.Status.PENDING:
        raise MemberError(
            "That join request is already decided.",
            code="already_decided",
            http_status=409,
        )
    join_request.status = JoinRequest.Status.REJECTED
    join_request.decided_by = decided_by
    join_request.decided_at = timezone.now()
    join_request.save(update_fields=["status", "decided_by", "decided_at"])
    _audit(
        "club_join.rejected",
        request,
        actor=decided_by,
        object_type="join_request",
        object_id=str(join_request.pk),
        club=join_request.club_id,
    )
    return join_request


def join_request_payload(join_request: JoinRequest) -> dict[str, Any]:
    """Roster-view row: member identity stays BEHIND Module 2 auth (M4-A2)."""
    user = join_request.user
    return {
        "id": join_request.pk,
        "user": {"username": user.get_username(), "email": user.email},
        "club_code": join_request.club_id,
        "source": join_request.source,
        "status": join_request.status,
        "created_at": join_request.created_at,
        "decided_at": join_request.decided_at,
    }
